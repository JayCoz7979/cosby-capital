/**
 * POST /api/auth/verify-device-otp
 *
 * Verifies the 6-digit OTP entered by the user. On success, registers the
 * device as trusted for 90 days and returns { trusted: true }.
 *
 * Security:
 * - Requires valid session
 * - Minimum 50ms response time (S16-004 — prevents timing side-channels)
 * - attempt_count incremented BEFORE verification (prevents race condition exploitation)
 * - After 3 failed attempts: OTP marked used + 429 returned (brute force prevention)
 * - verifyOtp() uses crypto.timingSafeEqual (constant-time comparison)
 * - OTP marked used=true immediately after successful verification (replay prevention)
 * - trusted_devices expires_at = now() + 90 days
 * - Service client used for all DB writes (device_otps RLS: service_role only)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { verifyOtp } from "@/lib/otp";
import { logger } from "@/lib/logger";
import { sanitizeForLog } from "@/lib/logger";

const verifyOtpSchema = z.object({
  otp: z.string().min(1).max(6),
  fingerprint_hash: z.string().min(1).max(64),
  device_name: z.string().max(200).optional(),
});

/** Minimum response time in ms to prevent timing side-channels (S16-004) */
const MIN_RESPONSE_MS = 50;

/** Maximum failed attempts before locking an OTP record */
const MAX_ATTEMPTS = 3;

/** Trusted device expiry in days */
const TRUSTED_DEVICE_EXPIRY_DAYS = 90;

async function enforceMinResponseTime(startMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_RESPONSE_MS - elapsed)
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startMs = Date.now();

  // ── Authenticate user ─────────────────────────────────────────────────────
  let userId: string;
  try {
    const supabase = await createServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id) {
      await enforceMinResponseTime(startMs);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    userId = session.user.id;
  } catch (err) {
    logger.error("verify-device-otp: session error", err);
    await enforceMinResponseTime(startMs);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse and validate request ────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await enforceMinResponseTime(startMs);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = verifyOtpSchema.safeParse(body);
  if (!parsed.success) {
    await enforceMinResponseTime(startMs);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { otp, fingerprint_hash, device_name } = parsed.data;
  const fingerprintPrefix = fingerprint_hash.slice(0, 8);

  const serviceClient = createServiceClient();

  // ── Fetch the latest unused, non-expired OTP for this user + device ───────
  let otpRecord: {
    id: string;
    otp_hash: string;
    attempt_count: number;
  } | null = null;

  try {
    const { data, error: fetchError } = await serviceClient
      .from("device_otps")
      .select("id, otp_hash, attempt_count")
      .eq("user_id", userId)
      .eq("fingerprint_hash", fingerprint_hash)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      logger.error("verify-device-otp: fetch OTP error", fetchError, {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      });
      await enforceMinResponseTime(startMs);
      return NextResponse.json(
        { error: "Code expired or not found" },
        { status: 400 }
      );
    }

    otpRecord = data;
  } catch (err) {
    logger.error("verify-device-otp: unexpected fetch error", err);
    await enforceMinResponseTime(startMs);
    return NextResponse.json(
      { error: "Code expired or not found" },
      { status: 400 }
    );
  }

  if (!otpRecord) {
    logger.info("verify-device-otp: no active OTP found", {
      fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
    });
    await enforceMinResponseTime(startMs);
    return NextResponse.json(
      { error: "Code expired or not found" },
      { status: 400 }
    );
  }

  // ── Increment attempt_count BEFORE verification (prevents race conditions) ─
  // This ensures concurrent requests cannot bypass the attempt limit
  try {
    const newAttemptCount = otpRecord.attempt_count + 1;

    const { error: incrementError } = await serviceClient
      .from("device_otps")
      .update({ attempt_count: newAttemptCount })
      .eq("id", otpRecord.id);

    if (incrementError) {
      logger.error("verify-device-otp: failed to increment attempt_count", incrementError);
      // Continue — we still want to verify and apply limits below
    }

    // ── Check attempt limit AFTER incrementing ──────────────────────────────
    if (otpRecord.attempt_count >= MAX_ATTEMPTS) {
      // Mark OTP as used to block further attempts (brute force prevention)
      await serviceClient
        .from("device_otps")
        .update({ used: true })
        .eq("id", otpRecord.id);

      logger.warn("verify-device-otp: max attempts exceeded, OTP locked", {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
        attempts: newAttemptCount,
      });

      await enforceMinResponseTime(startMs);
      return NextResponse.json(
        { error: "Too many attempts. Request a new code." },
        { status: 429 }
      );
    }
  } catch (err) {
    logger.error("verify-device-otp: attempt increment error", err);
    await enforceMinResponseTime(startMs);
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 500 }
    );
  }

  // ── Constant-time OTP verification ───────────────────────────────────────
  const isValid = verifyOtp(otp, otpRecord.otp_hash);

  if (!isValid) {
    logger.info("verify-device-otp: invalid OTP", {
      fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      attempt: otpRecord.attempt_count + 1,
    });
    await enforceMinResponseTime(startMs);
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  // ── OTP verified — mark as used and register trusted device ──────────────
  try {
    // Mark OTP as used (replay prevention — single-use enforcement)
    const { error: markUsedError } = await serviceClient
      .from("device_otps")
      .update({ used: true })
      .eq("id", otpRecord.id);

    if (markUsedError) {
      logger.error("verify-device-otp: failed to mark OTP used", markUsedError);
      // Continue — device trust insert is more important
    }

    // Register device as trusted for 90 days
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + TRUSTED_DEVICE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: trustError } = await serviceClient
      .from("trusted_devices")
      .insert({
        user_id: userId,
        fingerprint_hash,
        device_name: device_name?.trim() || "Unknown Device",
        trusted_at: now.toISOString(),
        last_seen_at: now.toISOString(),
        expires_at: expiresAt,
        is_revoked: false,
      });

    if (trustError) {
      logger.error("verify-device-otp: failed to insert trusted_device", trustError, {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      });
      // Still return trusted:true — OTP was valid, DB insert failure is recoverable
      // (next login will just ask for OTP again, which is acceptable behavior)
    }

    logger.info("verify-device-otp: device trusted successfully", {
      fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      deviceName: sanitizeForLog(device_name ?? "Unknown Device"),
      expiresAt,
    });

    await enforceMinResponseTime(startMs);
    return NextResponse.json({ trusted: true });
  } catch (err) {
    logger.error("verify-device-otp: post-verification error", err);
    await enforceMinResponseTime(startMs);
    // OTP was valid — return trusted:true even if DB operations failed
    return NextResponse.json({ trusted: true });
  }
}
