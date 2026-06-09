/**
 * Supabase client factories.
 * Three clients for three contexts — never mix them.
 *
 * createServerClient()  — Server Components, Route Handlers, Server Actions (anon key + cookies)
 * createServiceClient() — Server-only admin operations (service_role key) — NEVER in browser
 * createBrowserClient() — Client Components (anon key, no cookies)
 */

// ── Server client (SSR, cookie-based session) ─────────────────────────────────

import { cookies } from "next/headers";
import {
  createServerClient as createSSRServerClient,
  createBrowserClient as createSSRBrowserClient,
} from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createSSRServerClient(
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
            // Called from Server Components where cookies are read-only — safe to ignore.
          }
        },
      },
    }
  );
}

// ── Service client (server-only, service_role key) ────────────────────────────
// This import guard ensures the module is never bundled into client-side code.
// Any attempt to import createServiceClient() in a Client Component will throw
// a build error: "This module cannot be imported from a Client Component".

import "server-only";

export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for service client"
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ── Browser client (Client Components, anon key only) ─────────────────────────

export function createBrowserClient(): SupabaseClient {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
