/**
 * GET /api/onboarding/profile
 *
 * Returns the current user's owner_name and email from their client record.
 * Used by SignatureModal (Step 3 — identity verification) to pre-fill the
 * email field and validate the typed name against the stored owner_name.
 *
 * Auth required. Returns only the fields needed for identity verification —
 * no PII beyond what the user already knows about themselves.
 *
 * Returns: { owner_name: string, email: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export async function GET(_req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  try {
    const { data: client, error } = await serviceClient
      .from("clients")
      .select("owner_name, email")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      logger.warn("profile: client lookup error", { error: error.message });
      return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
    }

    if (!client) {
      // Client record not yet created (unlikely mid-onboarding, but handle gracefully)
      return NextResponse.json({
        owner_name: null,
        email: session.user.email ?? null,
      });
    }

    return NextResponse.json({
      owner_name: client.owner_name ?? null,
      email: client.email ?? session.user.email ?? null,
    });
  } catch (err) {
    logger.error("profile: unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
