/**
 * POST /api/auth/forgot-password — Constant-time password reset request handler.
 *
 * Security:
 * - S11-009: ALWAYS returns success regardless of whether email exists
 * - S16-002: 200ms artificial delay on BOTH code paths (prevents timing attacks)
 * - Zod email validation
 * - Actual reset email sent via Supabase if account exists
 * - No information leaked about account existence
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { sanitizeForLog } from "@/lib/logger";

const forgotPasswordSchema = z.object({
  email: z.string().email().max(254),
});

/** Minimum artificial delay in ms to prevent timing-based enumeration (S16-002) */
const MIN_RESPONSE_DELAY_MS = 200;

/** Generic success response — same for both existing and non-existing accounts */
const SUCCESS_RESPONSE = NextResponse.json({ success: true });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startMs = Date.now();

  const clientIp =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  /** Enforce minimum response time on both success and error paths (S16-002) */
  async function enforceMinDelay(): Promise<void> {
    const elapsed = Date.now() - startMs;
    if (elapsed < MIN_RESPONSE_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_RESPONSE_DELAY_MS - elapsed)
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await enforceMinDelay();
    // Return success even on malformed body (constant-time, S11-009)
    return SUCCESS_RESPONSE;
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    await enforceMinDelay();
    // Return success even on invalid email (constant-time, S11-009)
    return SUCCESS_RESPONSE;
  }

  const { email } = parsed.data;

  try {
    const supabase = await createServerClient();

    // Send reset email — Supabase silently ignores non-existent emails
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://cosbycapital.com";

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?type=recovery`,
    });

    logger.info("password reset requested", {
      ip: sanitizeForLog(clientIp),
      // Do NOT log email — even hashed email leaks account existence patterns
    });
  } catch (err) {
    // Log error server-side but still return success to client (S11-009)
    logger.error("forgot-password route error", err, {
      ip: sanitizeForLog(clientIp),
    });
  }

  await enforceMinDelay();
  return SUCCESS_RESPONSE;
}
