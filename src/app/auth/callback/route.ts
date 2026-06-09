/**
 * GET /auth/callback — Supabase Auth code exchange handler.
 *
 * Handles:
 * - Email confirmation links (type=signup or type=email)
 * - Password reset links (type=recovery)
 * - Magic link logins (type=magiclink)
 *
 * Security:
 * - Never exposes error details to client
 * - Redirects to safe allowlisted paths only
 * - Error redirect goes to /auth/login?error=invalid_link (generic)
 * - validateRedirect() used for any external next param
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { validateRedirect } from "@/lib/validate";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type") ?? "";
  const next = searchParams.get("next") ?? "";

  // If no code provided, redirect to login with generic error
  if (!code) {
    logger.warn("auth callback called without code param", { type });
    return NextResponse.redirect(
      new URL("/auth/login?error=invalid_link", origin)
    );
  }

  try {
    const supabase = await createServerClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      // Log server-side but never expose error details to client
      logger.warn("auth code exchange failed", {
        type,
        errorCode: error.status,
        // Do not log error.message — may contain sensitive info
      });
      return NextResponse.redirect(
        new URL("/auth/login?error=invalid_link", origin)
      );
    }

    // Determine redirect destination based on link type
    let destination: string;

    switch (type) {
      case "recovery":
        // Password reset flow — go to reset password page
        destination = "/auth/reset-password";
        break;

      case "signup":
      case "email":
      case "email_change":
        // Email confirmation — go to onboarding
        destination = "/onboarding/step-1";
        break;

      case "magiclink":
        // Magic link — go to dashboard or validated next param
        destination = next ? validateRedirect(next) : "/dashboard";
        break;

      default:
        // Unknown type — safe default
        destination = next ? validateRedirect(next) : "/dashboard";
        break;
    }

    return NextResponse.redirect(new URL(destination, origin));
  } catch (err) {
    // Log unexpected errors server-side only
    logger.error("auth callback unexpected error", err, { type });
    return NextResponse.redirect(
      new URL("/auth/login?error=invalid_link", origin)
    );
  }
}
