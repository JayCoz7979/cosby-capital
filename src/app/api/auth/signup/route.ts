/**
 * POST /api/auth/signup — Server-side signup handler.
 *
 * Security controls:
 * - Honeypot field check (name="website") — rejects bots silently
 * - Turnstile token verified SERVER-SIDE (TURNSTILE_SECRET_KEY never in client)
 * - Disposable email domain blocklist
 * - Zod schema validation (email format, password length)
 * - Generic success response regardless of whether email already exists (S11-009)
 * - signup_ip logged in user metadata for audit trail
 * - sanitizeForLog() on all logged data
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { verifyTurnstile } from "@/lib/turnstile";
import { isDisposableEmail } from "@/lib/email-blocklist";
import { logger } from "@/lib/logger";
import { sanitizeForLog } from "@/lib/logger";

// Signup request schema — password min 12 chars per security mandate
const signupRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  turnstileToken: z.string().max(2048).optional().default(""),
  website: z.string().max(200).optional().default(""), // honeypot
});

/** Generic success message — same regardless of whether email exists (S11-009) */
const SUCCESS_MESSAGE =
  "If this email is not already registered, you'll receive a verification link shortly.";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Extract client IP for logging and Turnstile verification
  const clientIp =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Validate request shape
  const parsed = signupRequestSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    const field = firstError?.path[0];

    // Return a user-friendly error for known fields; generic for others
    if (field === "email") {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }
    if (field === "password") {
      return NextResponse.json(
        { error: "Password must be at least 12 characters." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }

  const { email, password, turnstileToken, website } = parsed.data;

  // ── Honeypot check — bots fill the hidden "website" field ─────────────────
  // Silently return success to avoid tipping off the bot
  if (website && website.trim().length > 0) {
    logger.warn("signup honeypot triggered", {
      ip: sanitizeForLog(clientIp),
    });
    // Return the same success shape so the bot receives no signal
    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
  }

  // ── Turnstile verification (server-side — secret key never leaves server) ──
  const turnstileValid = await verifyTurnstile(turnstileToken, clientIp);
  if (!turnstileValid) {
    return NextResponse.json(
      { error: "Human verification failed. Please try again." },
      { status: 400 }
    );
  }

  // ── Disposable email blocklist check ──────────────────────────────────────
  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: "Please use a business email address. Disposable email providers are not accepted." },
      { status: 400 }
    );
  }

  // ── Supabase signup ───────────────────────────────────────────────────────
  try {
    const supabase = await createServerClient();

    const { error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          signup_ip: clientIp,
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://cosbycapital.com"}/auth/callback`,
      },
    });

    if (signupError) {
      // Log the actual error server-side but return generic message (S11-009)
      logger.warn("signup error from Supabase", {
        ip: sanitizeForLog(clientIp),
        // Do not log email in warn — could expose enumeration via logs
        errorCode: signupError.status,
      });

      // Even on error (e.g., email already exists) return generic success
      // to prevent email enumeration (S11-009)
      return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
    }

    logger.info("signup attempt processed", {
      ip: sanitizeForLog(clientIp),
    });

    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
  } catch (err) {
    logger.error("signup route unexpected error", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
