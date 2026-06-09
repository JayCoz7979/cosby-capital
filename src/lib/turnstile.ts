"server-only";

/**
 * Cloudflare Turnstile server-side verification utility.
 * NEVER expose TURNSTILE_SECRET_KEY to the client — this file is server-only.
 * The 'server-only' import at the top enforces this at build time.
 */

import { logger } from "@/lib/logger";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v1/siteverify";

/**
 * Verifies a Cloudflare Turnstile token server-side.
 *
 * @param token - The cf-turnstile-response token from the client form submission
 * @param remoteip - Optional: the client's IP address (improves accuracy)
 * @returns true if verification passes, false otherwise
 *
 * Security: TURNSTILE_SECRET_KEY never leaves the server.
 * If the env var is not set in development, logs a warning and returns true
 * to allow local dev without Turnstile credentials. No NODE_ENV bypass —
 * the bypass only applies when the key is genuinely absent.
 */
export async function verifyTurnstile(
  token: string,
  remoteip?: string
): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    logger.warn(
      "TURNSTILE_SECRET_KEY is not set — Turnstile verification skipped. " +
        "Set this env var in production."
    );
    return true;
  }

  if (!token || typeof token !== "string" || token.trim().length === 0) {
    logger.warn("verifyTurnstile called with empty token");
    return false;
  }

  try {
    const body = new URLSearchParams({
      secret: secretKey,
      response: token,
    });

    if (remoteip) {
      body.append("remoteip", remoteip);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      logger.error("Turnstile verify HTTP error", undefined, {
        status: response.status,
      });
      return false;
    }

    const data = (await response.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };

    if (!data.success) {
      logger.warn("Turnstile verification failed", {
        errorCodes: data["error-codes"],
      });
    }

    return data.success === true;
  } catch (err) {
    logger.error("Turnstile verification threw an exception", err);
    return false;
  }
}
