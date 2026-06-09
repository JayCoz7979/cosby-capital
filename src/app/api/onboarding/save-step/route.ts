/**
 * POST /api/onboarding/save-step
 *
 * Saves onboarding step data to onboarding_sessions.
 * Auth required. Input validated with Zod per-step schema.
 *
 * Body: { step: 1-6, data: object }
 * Returns: { saved: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import {
  saveStepSchema,
  onboardingStep1Schema,
  onboardingStep2Schema,
  onboardingStep3Schema,
  onboardingStep4Schema,
  onboardingStep5Schema,
  onboardingStep6Schema,
} from "@/lib/validate";
import { z } from "zod";

/** Per-step Zod schema map */
const STEP_SCHEMAS: Record<number, z.ZodTypeAny> = {
  1: onboardingStep1Schema,
  2: onboardingStep2Schema,
  3: onboardingStep3Schema,
  4: onboardingStep4Schema,
  5: onboardingStep5Schema,
  6: onboardingStep6Schema,
};

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse + envelope validation ───────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const envelopeResult = saveStepSchema.safeParse(rawBody);
  if (!envelopeResult.success) {
    return NextResponse.json(
      { error: "Invalid request", details: envelopeResult.error.flatten() },
      { status: 422 }
    );
  }

  const { step, data } = envelopeResult.data;

  // ── Per-step data validation ───────────────────────────────────────────────────
  const stepSchema = STEP_SCHEMAS[step];
  if (!stepSchema) {
    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  }

  const stepResult = stepSchema.safeParse(data);
  if (!stepResult.success) {
    return NextResponse.json(
      { error: "Step data validation failed", details: stepResult.error.flatten() },
      { status: 422 }
    );
  }

  const serviceClient = createServiceClient();

  try {
    // ── Get or create client record for step 1 ────────────────────────────────
    let clientId: string | null = null;

    // Check if client record already exists
    const { data: existingClient } = await serviceClient
      .from("clients")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (step === 1) {
      const stepData = stepResult.data as {
        business_name: string;
        owner_name: string;
        email: string;
        phone?: string;
        business_type: string;
        industry?: string;
        naics_code?: string;
        years_in_business?: number;
        employees?: number;
        annual_revenue?: number;
        state?: string;
        county?: string;
        city?: string;
        zip?: string;
      };

      if (existingClient) {
        // UPDATE existing client record
        const { data: updatedClient, error: updateErr } = await serviceClient
          .from("clients")
          .update({
            business_name: stepData.business_name,
            owner_name: stepData.owner_name,
            email: stepData.email,
            phone: stepData.phone ?? null,
            business_type: stepData.business_type,
            industry: stepData.industry ?? null,
            naics_code: stepData.naics_code ?? null,
            years_in_business: stepData.years_in_business ?? null,
            num_employees: stepData.employees ?? null,
            annual_revenue: stepData.annual_revenue ?? null,
            state: stepData.state ?? null,
            county: stepData.county ?? null,
            city: stepData.city ?? null,
            zip: stepData.zip ?? null,
          })
          .eq("user_id", session.user.id)
          .select("id")
          .single();

        if (updateErr) {
          logger.error("save-step: client UPDATE failed", updateErr);
          return NextResponse.json({ error: "Failed to save business info" }, { status: 500 });
        }
        clientId = updatedClient.id;
      } else {
        // INSERT new client record
        const { data: newClient, error: insertErr } = await serviceClient
          .from("clients")
          .insert({
            user_id: session.user.id,
            business_name: stepData.business_name,
            owner_name: stepData.owner_name,
            email: stepData.email,
            phone: stepData.phone ?? null,
            business_type: stepData.business_type,
            industry: stepData.industry ?? null,
            naics_code: stepData.naics_code ?? null,
            years_in_business: stepData.years_in_business ?? null,
            num_employees: stepData.employees ?? null,
            annual_revenue: stepData.annual_revenue ?? null,
            state: stepData.state ?? null,
            county: stepData.county ?? null,
            city: stepData.city ?? null,
            zip: stepData.zip ?? null,
          })
          .select("id")
          .single();

        if (insertErr) {
          logger.error("save-step: client INSERT failed", insertErr);
          return NextResponse.json({ error: "Failed to create client record" }, { status: 500 });
        }
        clientId = newClient.id;
      }
    } else {
      clientId = existingClient?.id ?? null;
    }

    // ── Upsert onboarding_sessions ────────────────────────────────────────────
    // Merge new step data into existing step_data JSONB
    const { data: existingSession } = await serviceClient
      .from("onboarding_sessions")
      .select("id, step_data, last_completed_step")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const existingStepData = (existingSession?.step_data as Record<string, unknown>) ?? {};
    const mergedStepData = {
      ...existingStepData,
      [`step_${step}`]: stepResult.data,
    };

    const newLastStep = Math.max(
      existingSession?.last_completed_step ?? 0,
      step
    );

    const { error: upsertErr } = await serviceClient
      .from("onboarding_sessions")
      .upsert(
        {
          user_id: session.user.id,
          client_id: clientId,
          last_completed_step: newLastStep,
          step_data: mergedStepData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertErr) {
      logger.error("save-step: onboarding_sessions upsert failed", upsertErr);
      return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
    }

    logger.info("save-step: step saved", { user_id: session.user.id, step });

    return NextResponse.json({ saved: true });
  } catch (err) {
    logger.error("save-step: unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
