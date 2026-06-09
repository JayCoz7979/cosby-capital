/**
 * POST /api/auth/send-device-otp
 *
 * Generates a 6-digit OTP, stores its SHA-256 hash, and emails it to the user
 * for step-up device verification.
 *
 * Security:
 * - Requires valid session
 * - Rate limit: max 3 OTP sends per user per 15 minutes
 * - OTP stored as SHA-256 hash — never plaintext
 * - Always returns { sent: true } regardless of email success (prevents enumeration)
 * - OTP value NEVER logged — only hash prefix (if needed for debugging)
 * - Service client used for DB writes (device_otps RLS: service_role only)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { generateOtp, hashOtp } from "@/lib/otp";
import { logger } from "@/lib/logger";
import { sanitizeForLog } from "@/lib/logger";

const sendOtpSchema = z.object({
  fingerprint_hash: z.string().min(1).max(64),
});

/** Max OTP send attempts per user per rate-limit window */
const RATE_LIMIT_MAX = 3;
/** Rate limit window in minutes */
const RATE_LIMIT_WINDOW_MINUTES = 15;

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Authenticate user ─────────────────────────────────────────────────────
  let userId: string;
  let userEmail: string;
  try {
    const supabase = await createServerClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    userId = session.user.id;
    userEmail = session.user.email;
  } catch (err) {
    logger.error("send-device-otp: session error", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = sendOtpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid fingerprint" }, { status: 400 });
  }

  const { fingerprint_hash } = parsed.data;
  const fingerprintPrefix = fingerprint_hash.slice(0, 8);

  const serviceClient = createServiceClient();

  // ── Rate limit check: max 3 sends per user per 15 minutes ────────────────
  try {
    const windowStart = new Date(
      Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    const { count, error: countError } = await serviceClient
      .from("device_otps")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);

    if (countError) {
      logger.error("send-device-otp: rate limit query error", countError);
      // Fail closed on rate limit check error — return sent:true (enumeration prevention)
      return NextResponse.json({ sent: true });
    }

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      logger.warn("send-device-otp: rate limit exceeded", {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      });
      // Return sent:true to prevent enumeration — client shows standard UI
      return NextResponse.json({ sent: true });
    }
  } catch (err) {
    logger.error("send-device-otp: rate limit check unexpected error", err);
    return NextResponse.json({ sent: true });
  }

  // ── Generate OTP and store hash ───────────────────────────────────────────
  try {
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await serviceClient
      .from("device_otps")
      .insert({
        user_id: userId,
        fingerprint_hash,
        otp_hash: otpHash,
        expires_at: expiresAt,
        used: false,
        attempt_count: 0,
      });

    if (insertError) {
      logger.error("send-device-otp: insert error", insertError, {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      });
      // Always return sent:true (enumeration prevention)
      return NextResponse.json({ sent: true });
    }

    // ── Send OTP email via Resend ─────────────────────────────────────────
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: "Cosby Capital <security@cosbyaisolutions.com>",
        to: [userEmail],
        subject: "Cosby Capital — New Device Login Verification",
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Device Login Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f1117; padding: 24px 32px;">
              <p style="margin: 0; color: #C9A84C; font-size: 20px; font-weight: 700; letter-spacing: 0.05em;">COSBY CAPITAL</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #111827;">New Device Login Verification</h1>
              <p style="margin: 0 0 24px; font-size: 15px; color: #4b5563; line-height: 1.6;">
                A login attempt was made from an unrecognized device. Enter the verification code below to confirm it was you.
              </p>
              <!-- OTP Code Box -->
              <div style="background-color: #f3f4f6; border: 2px solid #C9A84C; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em;">Your verification code</p>
                <p style="margin: 0; font-size: 36px; font-weight: 700; letter-spacing: 0.3em; color: #111827; font-family: 'Courier New', monospace;">${otp}</p>
                <p style="margin: 8px 0 0; font-size: 13px; color: #9ca3af;">Expires in 10 minutes</p>
              </div>
              <p style="margin: 0 0 16px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                If you did not attempt to log in, contact us immediately at
                <a href="mailto:security@cosbycapital.com" style="color: #C9A84C; text-decoration: none;">security@cosbycapital.com</a>.
              </p>
              <p style="margin: 0; font-size: 13px; color: #9ca3af;">
                Do not share this code with anyone. Cosby Capital will never ask for your verification code.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 32px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Powered by <a href="https://cosbyaisolutions.com" style="color: #C9A84C; text-decoration: none;">Cosby AI Solutions</a> | cosbyaisolutions.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      logger.info("send-device-otp: OTP sent successfully", {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
        // OTP value is NEVER logged — only the fact that one was sent
      });
    } catch (emailErr) {
      // Email failure is non-fatal for the response — still return sent:true
      // (prevents enumeration of valid email addresses)
      logger.error("send-device-otp: email send error", emailErr, {
        fingerprintPrefix: sanitizeForLog(fingerprintPrefix),
      });
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    logger.error("send-device-otp: unexpected error", err);
    return NextResponse.json({ sent: true });
  }
}
