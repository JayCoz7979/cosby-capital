/**
 * Next.js Middleware — full route protection (S12-003, S13-008, GAP-255, A02)
 *
 * SECURITY RULES ENFORCED:
 * - Content-Length > 65536 → 413 on API routes (GAP-255)
 * - CORS allowlist for API routes (S13-008)
 * - Admin IP allowlist → 404 (NOT 403) for non-allowlisted IPs
 * - JWT verification via Supabase SSR on all protected routes
 * - Security headers on every response
 * - NO NODE_ENV bypass conditions anywhere (S12-003)
 * - Stripe + VAPI webhook routes excluded from auth matcher
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ── Configuration ─────────────────────────────────────────────────────────────

/** Comma-separated list of allowed admin IPs from environment */
const ADMIN_IP_ALLOWLIST: string[] = (
  process.env.ADMIN_IP_ALLOWLIST ?? ""
)
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

/** CORS allowlist — only these origins may call /api/* routes (S13-008) */
const ALLOWED_ORIGINS: string[] = [
  "https://cosbycapital.com",
  "https://www.cosbycapital.com",
  "http://localhost:3000",
];

/** API route Content-Length limit in bytes (GAP-255) */
const MAX_CONTENT_LENGTH = 65536; // 64 KB

/** Routes that require authentication */
const PROTECTED_PREFIXES: string[] = [
  "/dashboard",
  "/api/",
  "/admin",
  "/onboarding",
];

/** Routes inside /api/ that are always public (webhooks) */
const PUBLIC_API_PREFIXES: string[] = [
  "/api/webhooks/",
  "/api/health",
];

/** Auth routes — authenticated users should be redirected away */
const AUTH_PREFIXES: string[] = [
  "/auth/login",
  "/auth/signup",
  "/auth/reset-password",
];

// ── Security headers applied to every response ────────────────────────────────

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
  return response;
}

// ── CORS helper ───────────────────────────────────────────────────────────────

function handleCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    response.headers.set("Vary", "Origin");
  }

  return response;
}

// ── IP extraction ─────────────────────────────────────────────────────────────

function getClientIp(request: NextRequest): string {
  // Cloudflare → x-real-ip → x-forwarded-for → fallback
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// ── Main middleware ───────────────────────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ── 1. OPTIONS preflight — respond immediately with CORS headers ──────────
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const preflight = new NextResponse(null, { status: 204 });
    return addSecurityHeaders(handleCors(request, preflight));
  }

  // ── 2. Content-Length guard on API routes (GAP-255) ───────────────────────
  if (pathname.startsWith("/api/")) {
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
      const bytes = parseInt(contentLength, 10);
      if (!Number.isNaN(bytes) && bytes > MAX_CONTENT_LENGTH) {
        const res = NextResponse.json(
          { error: "Request payload too large" },
          { status: 413 }
        );
        return addSecurityHeaders(res);
      }
    }
  }

  // ── 3. Admin IP allowlist — return 404 (NOT 403) for non-allowlisted IPs ──
  if (pathname.startsWith("/admin")) {
    const clientIp = getClientIp(request);
    if (ADMIN_IP_ALLOWLIST.length > 0 && !ADMIN_IP_ALLOWLIST.includes(clientIp)) {
      const res = new NextResponse(null, { status: 404 });
      return addSecurityHeaders(res);
    }
  }

  // ── 4. Skip auth for public API routes (webhooks, health) ─────────────────
  const isPublicApi = PUBLIC_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (isPublicApi) {
    const res = NextResponse.next();
    return addSecurityHeaders(handleCors(request, res));
  }

  // ── 5. Determine if route requires authentication ──────────────────────────
  const requiresAuth = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!requiresAuth) {
    const res = NextResponse.next();
    return addSecurityHeaders(handleCors(request, res));
  }

  // ── 6. JWT verification via Supabase SSR ──────────────────────────────────
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              secure: true,
              sameSite: "strict",
            });
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── 7. Auth redirect logic ────────────────────────────────────────────────
  const isAuthRoute = AUTH_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!user) {
    // Unauthenticated — redirect to login for protected routes
    if (requiresAuth && !isAuthRoute) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set(
        "redirect",
        pathname.startsWith("/api/") ? "/dashboard" : pathname
      );
      const redirectResponse = NextResponse.redirect(loginUrl);
      return addSecurityHeaders(redirectResponse);
    }
  } else {
    // Authenticated — redirect away from auth routes
    if (isAuthRoute) {
      const dashboardUrl = new URL("/dashboard", request.url);
      const redirectResponse = NextResponse.redirect(dashboardUrl);
      return addSecurityHeaders(redirectResponse);
    }
  }

  return addSecurityHeaders(handleCors(request, response));
}

// ── Route matcher ─────────────────────────────────────────────────────────────
// Excludes: static files, images, favicon, public assets, ALL webhook routes

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/|api/webhooks/).*)",
  ],
};
