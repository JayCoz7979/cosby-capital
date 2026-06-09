/**
 * POST /api/signature/execute
 *
 * Server-side signature processing. Validates identity, sets server-side
 * timestamp, computes audit hash, then delegates to the execute-signature
 * Supabase edge function for DB insert, PDF generation, storage, and email.
 *
 * Security:
 * - Auth required (session cookie)
 * - signed_at set HERE — never accepted from client (S16-004 / E-SIGN compliance)
 * - signed_name compared against clients.owner_name after Unicode NFC normalization
 *   on BOTH sides (homograph attack prevention)
 * - audit_hash = SHA-256(document_hash + signed_name + signed_at + client_ip)
 *   computed server-side only
 * - Minimum 50ms response time to prevent timing-based enumeration (S16-004)
 *
 * Body: { document_type, signed_name, document_hash, device_fingerprint_hash, user_agent }
 * Returns: { signature_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const MIN_RESPONSE_MS = 50;

const executeSignatureSchema = z.object({
  document_type: z.enum([
    "consulting_agreement",
    "grant_writing_auth",
    "grant_submission_auth",
    "lender_intro_auth",
    "success_fee_acknowledgment",
    "monthly_report_auth",
    "croa_agreement",
  ]),
  signed_name: z.string().min(1).max(200),
  document_hash: z.string().length(64),
  device_fingerprint_hash: z.string().max(64).optional().default(""),
  user_agent: z.string().max(500).optional().default(""),
});

/** Unicode NFC normalize — prevents homograph attacks */
function normalizeNFC(str: string): string {
  return str.normalize("NFC").trim();
}

/**
 * Computes SHA-256 of a string using the Node.js / Edge crypto API.
 * Returns a 64-character lowercase hex string.
 */
async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Extract client IP from request headers (respects x-forwarded-for) */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may be comma-separated; first is the original client
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const supabase = await createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    await enforceMinTime(startMs);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse + validate body ─────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    await enforceMinTime(startMs);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = executeSignatureSchema.safeParse(rawBody);
  if (!parsed.success) {
    await enforceMinTime(startMs);
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const {
    document_type,
    signed_name,
    document_hash,
    device_fingerprint_hash,
    user_agent,
  } = parsed.data;

  const serviceClient = createServiceClient();

  try {
    // ── Fetch client record ───────────────────────────────────────────────────
    const { data: client, error: clientErr } = await serviceClient
      .from("clients")
      .select("id, owner_name, email, business_name")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (clientErr || !client) {
      logger.warn("execute-signature: client record not found", {
        user_id: session.user.id,
      });
      await enforceMinTime(startMs);
      return NextResponse.json(
        { error: "Client profile not found. Please complete onboarding first." },
        { status: 404 }
      );
    }

    // ── Unicode NFC normalization on BOTH sides (homograph attack prevention) ─
    const normalizedTyped = normalizeNFC(signed_name);
    const normalizedOwner = normalizeNFC(client.owner_name ?? "");

    if (normalizedTyped.toLowerCase() !== normalizedOwner.toLowerCase()) {
      logger.warn("execute-signature: name mismatch", {
        user_id: session.user.id,
        client_id: client.id,
      });
      await enforceMinTime(startMs);
      return NextResponse.json(
        { error: "Signed name does not match account owner name." },
        { status: 422 }
      );
    }

    // ── Server-side timestamp — NEVER from client ─────────────────────────────
    const signed_at = new Date().toISOString();

    // ── Client IP ─────────────────────────────────────────────────────────────
    const client_ip = getClientIp(req);

    // ── Audit hash: SHA-256(document_hash + signed_name + signed_at + client_ip)
    const audit_hash = await sha256(
      document_hash + normalizedTyped + signed_at + client_ip
    );

    // ── Call execute-signature edge function ──────────────────────────────────
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? "";
    const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const edgeFnUrl = `${SUPABASE_URL}/functions/v1/execute-signature`;

    const edgePayload = {
      client_id: client.id,
      document_type,
      document_version: "v1.0",
      signed_by_name: normalizedTyped,
      signed_by_email: client.email ?? session.user.email ?? "",
      signed_at, // server-side only
      signed_ip: client_ip,
      signed_user_agent: user_agent,
      device_fingerprint_hash,
      document_hash,
      audit_hash,
      business_name: client.business_name ?? "",
    };

    const edgeRes = await fetch(edgeFnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "x-service-secret": INTERNAL_SERVICE_SECRET,
      },
      body: JSON.stringify(edgePayload),
    });

    if (!edgeRes.ok) {
      let errBody: { error?: string } = {};
      try {
        errBody = await edgeRes.json() as { error?: string };
      } catch {
        // ignore parse failure
      }
      logger.error("execute-signature: edge function failed", {
        status: edgeRes.status,
        error: errBody.error,
        client_id: client.id,
      });
      await enforceMinTime(startMs);
      return NextResponse.json(
        { error: "Signature processing failed. Please try again." },
        { status: 502 }
      );
    }

    const edgeData = await edgeRes.json() as { signature_id?: string };

    if (!edgeData.signature_id) {
      logger.error("execute-signature: no signature_id in edge response", {
        client_id: client.id,
      });
      await enforceMinTime(startMs);
      return NextResponse.json(
        { error: "Signature processing incomplete. Please contact support." },
        { status: 502 }
      );
    }

    logger.info("execute-signature: completed", {
      client_id: client.id,
      signature_id: edgeData.signature_id,
      document_type,
    });

    await enforceMinTime(startMs);
    return NextResponse.json({ signature_id: edgeData.signature_id });
  } catch (err) {
    logger.error("execute-signature: unexpected error", err);
    await enforceMinTime(startMs);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Enforce minimum response time to prevent timing-based enumeration (S16-004) */
async function enforceMinTime(startMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_RESPONSE_MS - elapsed)
    );
  }
}
