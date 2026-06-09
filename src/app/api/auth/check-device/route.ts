/**
 * POST /api/auth/check-device
 *
 * Checks whether the current user's device fingerprint matches a trusted device.
 * Called after successful login to determine if step-up OTP verification is required.
 *
 * Security:
 * - Requires valid session (authenticated via cookie)
 * - Uses service client for DB query (bypasses RLS — controlled access)
 * - Fingerprint hash logged only by first 8 chars (no full hash in logs)
 * - Updates last_seen_at on trusted device match
 * - No NODE_ENV bypass — device trust check always enforced
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { sanitizeForLog } from "@/lib/logger";

const checkDeviceSchema = z.object({
  fingerprint_hash: z.string().min(1).max(64),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Authenticate user ─────────────────────────────────────────────────────
  let userId: string;
  try {
    const supabase = await createServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    userId = session.user.id;
  } catch (err) {
    logger.error("check-device: session error", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse and validate request body ──────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = checkDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid fingerprint" }, { status: 400 });
  }

  const { fingerprint_hash } = parsed.data;

  // Truncate fingerprint for logging — never log full hash
  const fingerprintPrefix = fingerprint_hash.slice(0, 8);

  // ── Query trusted_devices via service client ──────────────────────────────
  try {
    const serviceClient = createServiceClient();

    const { data: device, error: queryError } = await serviceClient
      .from("trusted_devices")
      .select("id, device_name, expires_at")
      .eq("user_id", userId)
      .eq("fingerprint_hash", fingerprint_hash)
      .eq("is_revoked", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (queryError) {
      logger.error("check-device: query error", queryError, {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      });
      // Fail open — treat as untrusted device on DB error (require OTP)
      return NextResponse.json({ trusted: false });
    }

    if (!device) {
      logger.info("check-device: unrecognized device", {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      });
      return NextResponse.json({ trusted: false });
    }

    // ── Device matched — update last_seen_at ──────────────────────────────
    const { error: updateError } = await serviceClient
      .from("trusted_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id);

    if (updateError) {
      // Non-fatal — log and continue; device is still trusted
      logger.warn("check-device: failed to update last_seen_at", {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
        error: updateError.message,
      });
    }

    logger.info("check-device: trusted device recognized", {
      fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      deviceName: sanitizeForLog(device.device_name),
    });

    return NextResponse.json({
      trusted: true,
      device_name: device.device_name,
    });
  } catch (err) {
    logger.error("check-device: unexpected error", err);
    // Fail open — require OTP on any unexpected error
    return NextResponse.json({ trusted: false });
  }
}
