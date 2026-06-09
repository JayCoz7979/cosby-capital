/**
 * POST /api/onboarding/complete
 *
 * Marks onboarding as complete. Auth required.
 * - Sets onboarding_sessions.completed=true, completed_at=now()
 * - Sets clients.onboarding_complete=true
 * - Queues agent triggers (agents 1, 5, 8) via agent_queue if table exists
 * - Sends welcome email via Resend
 *
 * Returns: { completed: true, redirect: '/dashboard' }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "welcome@cosbycapital.com";

async function sendWelcomeEmail(toEmail: string, ownerName: string): Promise<void> {
  if (!RESEND_API_KEY) {
    logger.warn("onboarding/complete: RESEND_API_KEY not set — skipping welcome email");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        subject: "Welcome to Cosby Capital — your matches are being prepared",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
            <div style="background: #0A1628; padding: 32px 24px; text-align: center;">
              <h1 style="color: #C9A84C; margin: 0; font-size: 24px;">Cosby Capital</h1>
              <p style="color: #9ca3af; margin: 8px 0 0; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;">
                Your Capital. Your Future. Unlocked.
              </p>
            </div>
            <div style="padding: 32px 24px;">
              <h2 style="color: #0A1628; margin: 0 0 16px;">Welcome, ${ownerName}!</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 16px;">
                Your onboarding is complete. Our team is now analyzing your business profile
                to identify the best funding opportunities, grants, and lender matches for you.
              </p>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
                You'll receive your personalized matches within 24 hours. In the meantime,
                your dashboard is ready for you to explore.
              </p>
              <a
                href="https://app.cosbycapital.com/dashboard"
                style="display: inline-block; background: #C9A84C; color: #0A1628; padding: 12px 28px;
                       text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;"
              >
                Go to Dashboard
              </a>
            </div>
            <div style="padding: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Powered by <a href="https://cosbyaisolutions.com" style="color: #C9A84C;">Cosby AI Solutions</a>
              </p>
            </div>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn("onboarding/complete: Resend email failed", { status: res.status, body });
    }
  } catch (err) {
    logger.error("onboarding/complete: Resend unexpected error", err);
  }
}

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

  try {
    // ── Mark onboarding_sessions complete ─────────────────────────────────────
    const { error: sessionErr } = await serviceClient
      .from("onboarding_sessions")
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
        last_completed_step: 6,
      })
      .eq("user_id", session.user.id);

    if (sessionErr) {
      logger.error("onboarding/complete: session update failed", sessionErr);
      return NextResponse.json({ error: "Failed to complete onboarding" }, { status: 500 });
    }

    // ── Update clients.onboarding_complete ────────────────────────────────────
    const { data: clientRecord, error: clientErr } = await serviceClient
      .from("clients")
      .update({
        onboarding_complete: true,
        onboarding_completed: true,
        onboarding_step: 6,
      })
      .eq("user_id", session.user.id)
      .select("id, email, owner_name")
      .maybeSingle();

    if (clientErr) {
      logger.error("onboarding/complete: client update failed", clientErr);
      // Non-fatal — continue
    }

    // ── Fire post-onboarding agent triggers ───────────────────────────────────
    // Queue agents 1 (Capital Finder), 5 (Grant Finder), 8 (Credit Roadmap)
    // agent_queue table may not exist yet in early phases — fail gracefully
    if (clientRecord?.id) {
      const agentTriggers = [1, 5, 8].map((agentId) => ({
        client_id: clientRecord.id,
        agent_id: agentId,
        trigger: "onboarding_complete",
        status: "queued",
        created_at: new Date().toISOString(),
      }));

      const { error: queueErr } = await serviceClient
        .from("agent_queue")
        .insert(agentTriggers);

      if (queueErr) {
        // Table may not exist yet — log but don't fail the response
        logger.warn("onboarding/complete: agent_queue insert failed (table may not exist yet)", {
          error: queueErr.message,
        });
      }
    }

    // ── Send welcome email ────────────────────────────────────────────────────
    if (clientRecord?.email) {
      await sendWelcomeEmail(
        clientRecord.email,
        clientRecord.owner_name ?? "there"
      );
    }

    logger.info("onboarding/complete: onboarding completed", {
      user_id: session.user.id,
      client_id: clientRecord?.id,
    });

    return NextResponse.json({ completed: true, redirect: "/dashboard" });
  } catch (err) {
    logger.error("onboarding/complete: unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
