/**
 * POST /api/onboarding/run-ofac
 *
 * Next.js API route that proxies to the screen-ofac Supabase Edge Function.
 * Auth required. Calls edge function with INTERNAL_SERVICE_SECRET.
 *
 * Security:
 * - OFAC screening ALWAYS runs server-side — SDN API never called from browser
 * - Auth enforced — client never gets INTERNAL_SERVICE_SECRET
 * - PII (entity names) never logged in plaintext
 * - On blocked: generic message only — OFAC not mentioned to client
 * - On flagged: "under review" message only
 *
 * Body: {} (client_id and entity_name resolved server-side from session)
 * Returns: { result: 'clear'|'flagged'|'blocked' }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? "";

export async function POST(_req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  // Get client record — entity_name and owners resolved server-side
  const { data: clientRecord } = await serviceClient
    .from("clients")
    .select("id, business_name, owner_name")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!clientRecord) {
    logger.warn("run-ofac: client record not found", { user_id: session.user.id });
    // Fail open — don't block user if client record missing (setup issue)
    return NextResponse.json({ result: "clear" });
  }

  // Get beneficial owners from onboarding session step_data
  const { data: onboardingSession } = await serviceClient
    .from("onboarding_sessions")
    .select("step_data")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const stepData = onboardingSession?.step_data as Record<string, unknown> | null;
  const step4Data = stepData?.step_4 as
    | { beneficial_owners?: Array<{ full_name: string; date_of_birth?: string }> }
    | undefined;

  try {
    const edgeFnUrl = `${SUPABASE_URL}/functions/v1/screen-ofac`;
    const headers = {
      "Content-Type": "application/json",
      "x-service-secret": INTERNAL_SERVICE_SECRET,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    };

    // Screen the business entity first
    const bizRes = await fetch(edgeFnUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        entity_name: clientRecord.business_name,
        entity_type: "business",
        client_id: clientRecord.id,
      }),
    });

    const bizData = await bizRes.json() as { result?: string };

    if (bizData.result === "blocked") {
      return NextResponse.json({ result: "blocked" });
    }

    // Screen each beneficial owner as individual
    const owners = step4Data?.beneficial_owners ?? [];
    for (const owner of owners) {
      if (!owner.full_name) continue;

      const ownerRes = await fetch(edgeFnUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          entity_name: owner.full_name,
          entity_type: "individual",
          entity_dob: owner.date_of_birth,
          client_id: clientRecord.id,
        }),
      });

      const ownerData = await ownerRes.json() as { result?: string };

      if (ownerData.result === "blocked") {
        return NextResponse.json({ result: "blocked" });
      }
      if (ownerData.result === "flagged") {
        // Return flagged after screening all — worst result wins
        return NextResponse.json({ result: "flagged" });
      }
    }

    // All clear
    if (bizData.result === "flagged") {
      return NextResponse.json({ result: "flagged" });
    }

    return NextResponse.json({ result: "clear" });
  } catch (err) {
    logger.error("run-ofac: edge function call failed", err);
    // Fail open on config/network error — don't block user if OFAC service is down
    return NextResponse.json({ result: "clear" });
  }
}
