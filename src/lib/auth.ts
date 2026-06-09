/**
 * Access control + JWT verification utilities (A01, A02, A06, S16-004)
 * Server-side only — never import in client components.
 */

import { cookies } from "next/headers";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

/** Subscription tier order — lower index = lower access */
const TIER_ORDER: string[] = [
  "free",
  "starter",
  "growth",
  "capital_partner",
  "done_for_you",
];

/** Minimum response time in ms to prevent timing-based BOLA enumeration (S16-004) */
const MIN_OWNERSHIP_RESPONSE_MS = 50;

/**
 * Verifies that userId owns resourceId in the given Supabase table (A01).
 * Always returns false on any error — never throws.
 * Enforces minimum 50ms response time to prevent timing-based UUID enumeration (S16-004).
 */
export async function verifyOwnership(
  userId: string,
  resourceId: string,
  table: string,
  supabase?: SupabaseClient
): Promise<boolean> {
  const startMs = Date.now();

  try {
    const client = supabase ?? (await createSupabaseServerClient());

    const { data, error } = await client
      .from(table)
      .select("id")
      .eq("id", resourceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.warn("verifyOwnership query error", { table, error: error.message });
    }

    const owned = !error && data !== null;

    // Enforce minimum response time to prevent timing side-channels (S16-004)
    const elapsed = Date.now() - startMs;
    if (elapsed < MIN_OWNERSHIP_RESPONSE_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_OWNERSHIP_RESPONSE_MS - elapsed)
      );
    }

    return owned;
  } catch (err) {
    logger.error("verifyOwnership unexpected error", err);

    // Still enforce minimum response time even on error
    const elapsed = Date.now() - startMs;
    if (elapsed < MIN_OWNERSHIP_RESPONSE_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_OWNERSHIP_RESPONSE_MS - elapsed)
      );
    }

    return false;
  }
}

/**
 * Throws a 403 ApiError if the session user's subscription tier is below requiredTier (A06).
 * Server-side only.
 */
export function requireTier(requiredTier: string, session: Session): void {
  const userTier: string =
    (session.user.user_metadata?.subscription_tier as string | undefined) ??
    "free";

  const requiredIndex = TIER_ORDER.indexOf(requiredTier);
  const userIndex = TIER_ORDER.indexOf(userTier);

  if (requiredIndex === -1) {
    throw new Error(`Unknown required tier: ${requiredTier}`);
  }

  if (userIndex < requiredIndex) {
    const err = new Error("Subscription tier insufficient");
    (err as Error & { statusCode: number }).statusCode = 403;
    throw err;
  }
}

/**
 * Validates that a JWT's algorithm field is not 'none' (A02).
 * Throws if the algorithm is invalid or missing.
 * Only inspects the header — full signature verification is Supabase's responsibility.
 */
export function verifyJwtAlgorithm(token: string): void {
  try {
    const [headerB64] = token.split(".");
    if (!headerB64) throw new Error("Malformed JWT: missing header");

    const headerJson = Buffer.from(headerB64, "base64url").toString("utf8");
    const header = JSON.parse(headerJson) as { alg?: string };

    if (!header.alg || header.alg.toLowerCase() === "none") {
      throw new Error(`Rejected JWT with alg=${header.alg ?? "missing"} (A02)`);
    }

    // Only accept RS256 or HS256 (Supabase uses HS256 by default)
    const allowed = ["hs256", "rs256", "es256"];
    if (!allowed.includes(header.alg.toLowerCase())) {
      throw new Error(
        `Rejected JWT with unsupported alg=${header.alg} — allowed: ${allowed.join(", ")}`
      );
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("Malformed JWT: invalid header JSON");
    }
    throw err;
  }
}

/**
 * Creates an SSR-safe Supabase client using @supabase/ssr.
 * Cookie-based session with secure, httpOnly, sameSite=strict settings.
 * Use in Server Components, Route Handlers, and Server Actions.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: true,
                sameSite: "strict",
              });
            }
          } catch {
            // setAll is called from Server Components where cookies are read-only.
            // This is safe to ignore — the session will be refreshed on next request.
          }
        },
      },
    }
  );
}
