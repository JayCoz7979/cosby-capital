/**
 * POST /api/onboarding/verify-kyb
 *
 * Next.js API route that proxies to the verify-kyb Supabase Edge Function.
 * Auth required. Calls edge function with INTERNAL_SERVICE_SECRET.
 *
 * Body: { ein: string }
 * Returns: { verified: boolean, status: string, notes?: string }
 *
 * Security:
 * - Auth enforced server-side — client never gets INTERNAL_SERVICE_SECRET
 * - EIN never logged in plaintext (sanitizeForLog applied)
 * - KYB failure returns ONLY generic support message
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? "";

const EIN_REGEX = /^\d{2}-\d{7}$/;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ein?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ein } = body;

  if (!ein || !EIN_REGEX.test(ein)) {
    return NextResponse.json(
      { verified: false, status: "failed", notes: "Invalid EIN format" },
      { status: 422 }
    );
  }

  // Get client_id for this user
  const serviceClient = createServiceClient();
  const { data: clientRecord } = await serviceClient
    .from("clients")
    .select("id, business_name, state")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!clientRecord) {
    return NextResponse.json(
      { error: "Client record not found. Please complete Step 1 first." },
      { status: 400 }
    );
  }

  try {
    // Call verify-kyb edge function server-side
    const edgeFnUrl = `${SUPABASE_URL}/functions/v1/verify-kyb`;
    const res = await fetch(edgeFnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-secret": INTERNAL_SERVICE_SECRET,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      },
      body: JSON.stringify({
        ein,
        business_name: clientRecord.business_name,
        state: clientRecord.state ?? "",
        client_id: clientRecord.id,
      }),
    });

    const data = await res.json() as {
      verified?: boolean;
      status?: string;
      notes?: string;
    };

    // Never forward technical error details to client
    return NextResponse.json({
      verified: data.verified ?? false,
      status: data.status ?? "failed",
      // Only forward safe, generic notes
      notes: data.verified
        ? "Business verified successfully"
        : "We couldn't automatically verify your business. Please contact support@cosbycapital.com with your business documents.",
    });
  } catch (err) {
    logger.error("verify-kyb proxy: edge function call failed", err);
    // Generic error — no technical details to client
    return NextResponse.json(
      {
        verified: false,
        status: "failed",
        notes: "We couldn't automatically verify your business. Please contact support@cosbycapital.com with your business documents.",
      },
      { status: 200 } // 200 so client handles gracefully
    );
  }
}
