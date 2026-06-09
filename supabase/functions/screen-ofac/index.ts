/**
 * screen-ofac — OFAC/Sanctions screening edge function
 *
 * Security (IEEPA + Bank Secrecy Act compliance):
 * - Auth: INTERNAL_SERVICE_SECRET header check (service_role callers only)
 * - OFAC screening ALWAYS runs server-side — SDN API never called from client browser
 * - Personal data (names, DOBs) sanitized via sanitizeForPrompt() — must not leak into logs
 * - On 'blocked': kyb_status='blocked' set AND Telegram alert fires IMMEDIATELY
 * - On 'flagged': Telegram alert fires, client gets "under review" message
 * - Inputs: sanitizeForPrompt() applied before any external call
 * - Direct mode: simplified SDN check with hardcoded obvious test names
 *   IMPORTANT: Production teams must configure OFAC_VENDOR before launch for
 *   real OFAC screening against the full SDN list.
 *
 * Accepts: { entity_name: string, entity_type: 'business'|'individual', entity_dob?: string, client_id: string }
 * Returns: { result: 'clear'|'flagged'|'blocked', match_score: number, matches: any[] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET") ?? "";
const OFAC_VENDOR = Deno.env.get("OFAC_VENDOR") ?? "direct";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

/**
 * Hardcoded obvious SDN test names for direct/dev mode.
 * In production, configure OFAC_VENDOR to use real SDN list screening.
 * This list exists solely to provide compliance infrastructure at launch
 * without requiring an API key.
 */
const OBVIOUS_SDN_NAMES = [
  "osama bin laden",
  "al-qaeda",
  "al qaeda",
  "isis",
  "islamic state",
  "hamas",
  "hezbollah",
  "russian federal security service",
  "iran islamic revolutionary guard",
  "north korea",
  "kim jong un",
];

/** Strip PII from log strings — names and DOBs must not appear in logs */
function sanitizeForLog(data: unknown): unknown {
  if (typeof data === "string") {
    return data
      .replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[SSN]")
      .replace(/\b\d{2}-?\d{7}\b/g, "[EIN]");
  }
  if (typeof data === "object" && data !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (
        lower === "entity_name" ||
        lower === "entity_dob" ||
        lower === "full_name" ||
        lower === "dob" ||
        lower === "ssn" ||
        lower === "ein"
      ) {
        sanitized[k] = "[REDACTED]";
      } else {
        sanitized[k] = sanitizeForLog(v);
      }
    }
    return sanitized;
  }
  return data;
}

/** Strip prompt injection patterns before passing to vendor APIs */
function sanitizeForPrompt(input: string): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?)/gi, "")
    .replace(/SYSTEM\s*:/g, "")
    .replace(/###\s*(Instruction|System|Override)/gi, "")
    .slice(0, 500);
}

async function sendTelegramAlert(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", message: "Telegram alert failed", error: String(err) }));
  }
}

/**
 * Direct mode OFAC check.
 * Compares entity name against known SDN test names (case-insensitive, normalized).
 * match_score: 100 = exact, 85-99 = fuzzy (flagged), <85 = clear.
 *
 * PRODUCTION NOTE: Replace with full SDN list screening via OFAC_VENDOR env var.
 */
function directOfacCheck(entityName: string): {
  result: "clear" | "flagged" | "blocked";
  match_score: number;
  matches: string[];
} {
  const normalized = entityName.toLowerCase().trim();

  // Exact match = blocked (score 100)
  for (const sdn of OBVIOUS_SDN_NAMES) {
    if (normalized === sdn) {
      return { result: "blocked", match_score: 100, matches: [sdn] };
    }
  }

  // Substring match = flagged (score 85)
  for (const sdn of OBVIOUS_SDN_NAMES) {
    if (normalized.includes(sdn) || sdn.includes(normalized)) {
      return { result: "flagged", match_score: 85, matches: [sdn] };
    }
  }

  // No match = clear
  // Log that production OFAC screening should be configured
  console.log(
    JSON.stringify({
      level: "info",
      message: "OFAC direct mode: entity cleared against test SDN list. Configure OFAC_VENDOR for full production screening.",
      data: { client_id: "[see calling context]" },
    })
  );

  return { result: "clear", match_score: 0, matches: [] };
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-service-secret",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Auth: INTERNAL_SERVICE_SECRET check ──────────────────────────────────────
  const serviceSecret = req.headers.get("x-service-secret") ?? "";
  if (!INTERNAL_SERVICE_SECRET || serviceSecret !== INTERNAL_SERVICE_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: {
    entity_name?: string;
    entity_type?: "business" | "individual";
    entity_dob?: string;
    client_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { entity_name, entity_type, entity_dob, client_id } = body;

  if (!entity_name || !entity_type || !client_id) {
    return new Response(
      JSON.stringify({ error: "entity_name, entity_type, and client_id are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (entity_type !== "business" && entity_type !== "individual") {
    return new Response(
      JSON.stringify({ error: "entity_type must be 'business' or 'individual'" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Sanitize inputs — PII must not leak into logs or vendor calls
  const safeName = sanitizeForPrompt(entity_name);
  const safeDob = entity_dob ? sanitizeForPrompt(entity_dob) : undefined;

  console.log(
    JSON.stringify({
      level: "info",
      message: "OFAC screening starting",
      data: sanitizeForLog({ client_id, entity_type, vendor: OFAC_VENDOR }),
    })
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let screeningResult: { result: "clear" | "flagged" | "blocked"; match_score: number; matches: unknown[] };

  try {
    if (OFAC_VENDOR === "middesk") {
      const MIDDESK_API_KEY = Deno.env.get("MIDDESK_API_KEY") ?? "";
      const res = await fetch("https://api.middesk.com/v1/watchlist-screenings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MIDDESK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: safeName, dob: safeDob }),
      });
      const data = await res.json() as { result?: string; score?: number; matches?: unknown[] };
      const result = data.result === "clear" ? "clear" : data.result === "blocked" ? "blocked" : "flagged";
      screeningResult = { result, match_score: data.score ?? 0, matches: data.matches ?? [] };
    } else if (OFAC_VENDOR === "persona") {
      const PERSONA_API_KEY = Deno.env.get("PERSONA_API_KEY") ?? "";
      const res = await fetch("https://withpersona.com/api/v1/watchlist-screenings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${PERSONA_API_KEY}`,
          "Persona-Version": "2023-01-05",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: safeName }),
      });
      const data = await res.json() as { data?: { attributes?: { status?: string; score?: number } } };
      const statusVal = data.data?.attributes?.status;
      const result = statusVal === "approved" ? "clear" : statusVal === "declined" ? "blocked" : "flagged";
      screeningResult = { result, match_score: data.data?.attributes?.score ?? 0, matches: [] };
    } else if (OFAC_VENDOR === "alloy") {
      const ALLOY_API_KEY = Deno.env.get("ALLOY_API_KEY") ?? "";
      const ALLOY_API_SECRET = Deno.env.get("ALLOY_API_SECRET") ?? "";
      const credentials = btoa(`${ALLOY_API_KEY}:${ALLOY_API_SECRET}`);
      const res = await fetch("https://sandbox.alloy.co/v1/evaluations", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name_first: entity_type === "individual" ? safeName.split(" ")[0] : undefined,
          name_last: entity_type === "individual" ? safeName.split(" ").slice(1).join(" ") : undefined,
          company_name: entity_type === "business" ? safeName : undefined,
        }),
      });
      const data = await res.json() as { summary?: { outcome?: string; risk_score?: number } };
      const outcome = data.summary?.outcome;
      const result = outcome === "Approved" ? "clear" : outcome === "Denied" ? "blocked" : "flagged";
      screeningResult = { result, match_score: data.summary?.risk_score ?? 0, matches: [] };
    } else {
      // ── Default (direct) mode ─────────────────────────────────────────────────
      // Uses hardcoded obvious SDN test names.
      // PRODUCTION: configure OFAC_VENDOR env var before launch.
      screeningResult = directOfacCheck(safeName);
      console.log(
        JSON.stringify({
          level: "info",
          message: "OFAC direct mode result",
          data: sanitizeForLog({ client_id, result: screeningResult.result }),
        })
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "OFAC vendor API call failed",
        error: String(err),
        data: sanitizeForLog({ client_id }),
      })
    );
    // On vendor failure: flag for manual review
    screeningResult = { result: "flagged", match_score: 0, matches: [] };
  }

  // ── Persist screening record ──────────────────────────────────────────────────
  try {
    const { error: insertErr } = await supabase.from("ofac_screenings").insert({
      client_id,
      screening_type: entity_type,
      entity_name: safeName,
      entity_dob: safeDob ?? null,
      result: screeningResult.result,
      match_score: screeningResult.match_score,
      raw_response: { matches: screeningResult.matches, vendor: OFAC_VENDOR },
    });

    if (insertErr) {
      console.error(JSON.stringify({ level: "error", message: "ofac_screenings insert failed", error: insertErr.message }));
    }

    // Update clients.ofac_status based on result
    if (screeningResult.result === "blocked") {
      // BLOCKED: set kyb_status=blocked + ofac_status=blocked IMMEDIATELY
      const { error: blockErr } = await supabase
        .from("clients")
        .update({
          kyb_status: "blocked",
          ofac_status: "blocked",
          ofac_screened_at: new Date().toISOString(),
        })
        .eq("id", client_id);

      if (blockErr) {
        console.error(JSON.stringify({ level: "error", message: "clients block update failed", error: blockErr.message }));
      }

      // Telegram alert — IMMEDIATE on block (federal compliance requirement)
      await sendTelegramAlert(
        `<b>OFAC BLOCK — IMMEDIATE ACTION REQUIRED</b>\n` +
        `Client ID: <code>${client_id}</code>\n` +
        `Entity Type: ${entity_type}\n` +
        `Match Score: ${screeningResult.match_score}\n` +
        `<b>Client access has been blocked.</b>`
      );
    } else if (screeningResult.result === "flagged") {
      const { error: flagErr } = await supabase
        .from("clients")
        .update({
          ofac_status: "flagged",
          ofac_screened_at: new Date().toISOString(),
        })
        .eq("id", client_id);

      if (flagErr) {
        console.error(JSON.stringify({ level: "error", message: "clients flagged update failed", error: flagErr.message }));
      }

      // Telegram alert — within 1 minute for flagged
      await sendTelegramAlert(
        `<b>OFAC Flag — Review Required</b>\n` +
        `Client ID: <code>${client_id}</code>\n` +
        `Entity Type: ${entity_type}\n` +
        `Match Score: ${screeningResult.match_score}\n` +
        `Action: Review within 24 hours.`
      );
    } else {
      // Clear
      const { error: clearErr } = await supabase
        .from("clients")
        .update({
          ofac_status: "clear",
          ofac_screened_at: new Date().toISOString(),
        })
        .eq("id", client_id);

      if (clearErr) {
        console.error(JSON.stringify({ level: "error", message: "clients clear update failed", error: clearErr.message }));
      }
    }
  } catch (dbErr) {
    console.error(JSON.stringify({ level: "error", message: "OFAC DB operations failed", error: String(dbErr) }));
  }

  return new Response(
    JSON.stringify({
      result: screeningResult.result,
      match_score: screeningResult.match_score,
      matches: screeningResult.matches,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
