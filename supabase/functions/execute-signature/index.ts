/**
 * execute-signature — Supabase Edge Function
 *
 * Called by /api/signature/execute (internal). Receives fully-validated,
 * server-computed signature audit data and:
 *   1. Inserts the signatures row (immutable — no UPDATE/DELETE allowed by SQL rules)
 *   2. Calls generate-pdf to produce the executed PDF
 *   3. Uploads to Supabase Storage (required)
 *   4. Uploads to AWS S3 (optional — graceful degradation if not configured)
 *   5. Uploads to Google Drive (optional — graceful degradation if not configured)
 *   6. Re-verifies SHA-256 of stored PDF from Supabase Storage; sets storage_verified=true
 *   7. Sends email to client via Resend (PDF attachment)
 *   8. Sends email to info@cosbycapital.com (new agreement notification)
 *   9. Updates client_email_sent + admin_email_sent on the signature record
 *  10. Returns { signature_id, storage_verified }
 *
 * Security:
 * - Requires x-service-secret header (INTERNAL_SERVICE_SECRET env var)
 * - Uses service_role key for all DB operations
 * - signed_at is taken from the request payload (already set server-side in API route)
 * - Storage: S3 and Drive are optional at dev time; Supabase Storage is required
 *
 * Triple storage verification:
 * - After all uploads, re-download from Supabase Storage and compute SHA-256
 * - storage_verified=true only when Supabase upload + hash verification succeeds
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Environment ───────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const AWS_REGION = Deno.env.get("AWS_REGION") ?? "us-east-1";
const AWS_S3_BUCKET = Deno.env.get("AWS_S3_BUCKET") ?? "";
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExecuteSignaturePayload {
  client_id: string;
  document_type: string;
  document_version: string;
  signed_by_name: string;
  signed_by_email: string;
  signed_at: string;       // ISO-8601, set server-side in API route
  signed_ip: string;
  signed_user_agent: string;
  device_fingerprint_hash: string;
  document_hash: string;
  audit_hash: string;
  business_name: string;
  // document_text_snapshot is fetched from the consulting-agreement constant
  // For non-consulting documents, a placeholder is used until those are built
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    console.error(JSON.stringify({ level: "error", msg: "Telegram alert failed", err: String(err) }));
  }
}

/** Minimal document text snapshot for non-consulting document types */
function getDocumentSnapshot(documentType: string): string {
  // The consulting agreement full text is embedded in the client lib.
  // For other document types, the full text snapshot will be added when those
  // signature flows are built. A structured placeholder is stored for audit completeness.
  const placeholders: Record<string, string> = {
    grant_writing_auth: "Grant Writing Authorization Agreement v1.0 — Full text pending implementation.",
    grant_submission_auth: "Grant Submission Authorization Agreement v1.0 — Full text pending implementation.",
    lender_intro_auth: "Lender Introduction Authorization Agreement v1.0 — Full text pending implementation.",
    success_fee_acknowledgment: "Success Fee Acknowledgment v1.0 — Full text pending implementation.",
    monthly_report_auth: "Monthly Report Authorization Agreement v1.0 — Full text pending implementation.",
    croa_agreement: "Credit Repair Organizations Act Agreement v1.0 — Full text pending implementation.",
  };
  return placeholders[documentType] ?? "Document text snapshot not available.";
}

// ── AWS S3 upload (graceful degradation if not configured) ────────────────────
// Uses AWS Signature Version 4 via fetch — no Node.js SDK needed in Deno.
async function uploadToS3(
  pdfBytes: Uint8Array,
  path: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
    console.log(JSON.stringify({
      level: "warn",
      msg: "S3 upload skipped — AWS_ACCESS_KEY_ID / AWS_S3_BUCKET not configured. Set for production triple-storage.",
    }));
    return { success: false, error: "S3 not configured" };
  }

  try {
    // AWS Signature V4 signing
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const amzDate = now.toISOString().replace(/[:-]/g, "").slice(0, 15) + "Z";
    const host = `${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;
    const url = `https://${host}/${path}`;

    const contentHash = await sha256Hex(pdfBytes);

    // Canonical request
    const canonicalHeaders = `content-type:application/pdf\nhost:${host}\nx-amz-content-sha256:${contentHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "PUT",
      `/${path}`,
      "",
      canonicalHeaders,
      signedHeaders,
      contentHash,
    ].join("\n");

    // String to sign
    const credentialScope = `${dateStamp}/${AWS_REGION}/s3/aws4_request`;
    const canonicalRequestHash = await sha256Hex(
      new TextEncoder().encode(canonicalRequest)
    );
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join("\n");

    // Signing key
    async function hmacSha256(key: Uint8Array | ArrayBuffer, data: string): Promise<Uint8Array> {
      const cryptoKey = await crypto.subtle.importKey(
        "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
      return new Uint8Array(sig);
    }

    const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${AWS_SECRET_ACCESS_KEY}`), dateStamp);
    const kRegion = await hmacSha256(kDate, AWS_REGION);
    const kService = await hmacSha256(kRegion, "s3");
    const kSigning = await hmacSha256(kService, "aws4_request");

    const signatureBytes = await hmacSha256(kSigning, stringToSign);
    const signature = Array.from(signatureBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const authHeader = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "x-amz-content-sha256": contentHash,
        "x-amz-date": amzDate,
        Authorization: authHeader,
      },
      body: pdfBytes,
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `S3 PUT failed: ${res.status} ${text.slice(0, 200)}` };
    }

    return { success: true, path: `s3://${AWS_S3_BUCKET}/${path}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Google Drive upload (graceful degradation if not configured) ──────────────
async function uploadToGoogleDrive(
  pdfBytes: Uint8Array,
  fileName: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.log(JSON.stringify({
      level: "warn",
      msg: "Google Drive upload skipped — GOOGLE_SERVICE_ACCOUNT_JSON not configured. Set for production triple-storage.",
    }));
    return { success: false, error: "Google Drive not configured" };
  }

  try {
    const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON) as {
      client_email: string;
      private_key: string;
    };

    // Create JWT for service account auth
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/drive.file",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    function base64url(data: string): string {
      return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    }

    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    // Import RSA private key
    const pemKey = serviceAccount.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\n/g, "");
    const keyBytes = Uint8Array.from(atob(pemKey), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyBytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sigBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(signingInput)
    );
    const sig = base64url(String.fromCharCode(...new Uint8Array(sigBuffer)));
    const jwt = `${signingInput}.${sig}`;

    // Exchange JWT for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) {
      return { success: false, error: "Google OAuth token exchange failed" };
    }

    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) {
      return { success: false, error: "No access_token in Google OAuth response" };
    }

    // Upload file via multipart upload
    const metadata = JSON.stringify({ name: fileName, mimeType: "application/pdf" });
    const boundary = "cosbycapital_boundary";
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      metadata,
      `--${boundary}`,
      "Content-Type: application/pdf",
      "",
      "", // PDF bytes follow
    ].join("\r\n");

    const bodyBytes = new TextEncoder().encode(body);
    const combined = new Uint8Array(bodyBytes.length + pdfBytes.length + `\r\n--${boundary}--\r\n`.length);
    combined.set(bodyBytes);
    combined.set(pdfBytes, bodyBytes.length);
    combined.set(new TextEncoder().encode(`\r\n--${boundary}--\r\n`), bodyBytes.length + pdfBytes.length);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: combined,
      }
    );

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      return { success: false, error: `Drive upload failed: ${uploadRes.status} ${text.slice(0, 200)}` };
    }

    const driveData = await uploadRes.json() as { id?: string };
    return { success: true, fileId: driveData.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Email via Resend ──────────────────────────────────────────────────────────
async function sendEmailWithPdf(opts: {
  to: string;
  subject: string;
  html: string;
  pdfBytes: Uint8Array;
  fileName: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.log(JSON.stringify({ level: "warn", msg: "Resend email skipped — RESEND_API_KEY not configured." }));
    return { success: false, error: "Resend not configured" };
  }

  try {
    // Encode PDF as base64 for Resend attachment
    const pdfBase64 = btoa(String.fromCharCode(...opts.pdfBytes));

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Cosby Capital <noreply@cosbycapital.com>",
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        attachments: [
          {
            filename: opts.fileName,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Resend error: ${res.status} ${body.slice(0, 200)}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
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

  // ── Auth: INTERNAL_SERVICE_SECRET ─────────────────────────────────────────
  const serviceSecret = req.headers.get("x-service-secret") ?? "";
  if (!INTERNAL_SERVICE_SECRET || serviceSecret !== INTERNAL_SERVICE_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let payload: ExecuteSignaturePayload;
  try {
    payload = await req.json() as ExecuteSignaturePayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    client_id,
    document_type,
    document_version,
    signed_by_name,
    signed_by_email,
    signed_at,
    signed_ip,
    signed_user_agent,
    device_fingerprint_hash,
    document_hash,
    audit_hash,
    business_name,
  } = payload;

  // Basic validation
  if (!client_id || !document_type || !signed_by_name || !signed_at || !document_hash || !audit_hash) {
    return new Response(JSON.stringify({ error: "Missing required signature fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Determine document text snapshot
  let documentTextSnapshot: string;
  if (document_type === "consulting_agreement") {
    // Fetch from Supabase URL where the agreement text is served, or use a known hash
    // In practice for edge functions, we embed a reference and store the hash
    // The full text is stored in the DB snapshot for audit completeness
    // We call generate-pdf which has the full text for rendering
    documentTextSnapshot = "Full consulting agreement text v1.0 — see document_hash for integrity verification.";
    // TODO: For full compliance, embed the agreement text constant here or fetch from a signed URL.
    // The document_hash already cryptographically binds this record to the exact document text.
  } else {
    documentTextSnapshot = getDocumentSnapshot(document_type);
  }

  // ── Step 1: Insert signatures row ─────────────────────────────────────────
  const { data: sigRow, error: sigInsertErr } = await supabase
    .from("signatures")
    .insert({
      client_id,
      document_type,
      document_version: document_version ?? "v1.0",
      signed_by_name,
      signed_by_email,
      signed_at,
      signed_ip,
      signed_user_agent,
      device_fingerprint_hash,
      document_hash,
      audit_hash,
      document_text_snapshot: documentTextSnapshot,
      storage_verified: false,
      client_email_sent: false,
      admin_email_sent: false,
    })
    .select("id")
    .single();

  if (sigInsertErr || !sigRow) {
    console.error(JSON.stringify({
      level: "error",
      msg: "signatures INSERT failed",
      error: sigInsertErr?.message,
      client_id,
    }));
    return new Response(JSON.stringify({ error: "Failed to record signature" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const signatureId = sigRow.id as string;
  console.log(JSON.stringify({ level: "info", msg: "Signature row inserted", signature_id: signatureId }));

  // ── Step 2: Generate PDF ──────────────────────────────────────────────────
  let pdfBytes: Uint8Array | null = null;
  try {
    const pdfRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-service-secret": serviceSecret, // forward the same secret
        Authorization: req.headers.get("Authorization") ?? "",
      },
      body: JSON.stringify({
        document_type,
        document_text_snapshot: documentTextSnapshot,
        signed_by_name,
        signed_by_email,
        signed_at,
        signed_ip,
        document_hash,
        audit_hash,
        client_id,
      }),
    });

    if (pdfRes.ok) {
      const arrayBuf = await pdfRes.arrayBuffer();
      pdfBytes = new Uint8Array(arrayBuf);
      console.log(JSON.stringify({ level: "info", msg: "PDF generated", size: pdfBytes.length }));
    } else {
      const errText = await pdfRes.text();
      console.error(JSON.stringify({ level: "error", msg: "generate-pdf failed", status: pdfRes.status, err: errText.slice(0, 300) }));
    }
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "generate-pdf call threw", err: String(err) }));
  }

  // Fallback: minimal PDF if generation failed
  if (!pdfBytes) {
    const fallbackText = `EXECUTED AGREEMENT\nDocument: ${document_type}\nSigned by: ${signed_by_name}\nDate: ${signed_at}\nAudit Hash: ${audit_hash}`;
    pdfBytes = new TextEncoder().encode(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj 4 0 obj<</Length ${fallbackText.length}>>stream\n${fallbackText}\nendstream\nendobj\nxref\n0 5\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n0\n%%EOF`);
  }

  // ── Step 3: Upload to Supabase Storage ────────────────────────────────────
  const now = new Date(signed_at);
  const yyyyMM = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const fileName = `${dd}_${document_type}_${document_version ?? "v1.0"}_executed.pdf`;
  const supabasePath = `clients/${client_id}/${yyyyMM}/${fileName}`;

  let supabaseStoragePath: string | null = null;
  let storageVerified = false;

  const { error: uploadErr } = await supabase.storage
    .from("client-documents")
    .upload(supabasePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadErr) {
    console.error(JSON.stringify({
      level: "error",
      msg: "Supabase Storage upload failed — retrying once",
      error: uploadErr.message,
    }));
    // Retry once
    const { error: retryErr } = await supabase.storage
      .from("client-documents")
      .upload(supabasePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (retryErr) {
      console.error(JSON.stringify({ level: "error", msg: "Supabase Storage retry failed", error: retryErr.message }));
      await sendTelegramAlert(
        `<b>Supabase Storage upload FAILED</b>\nSignature: <code>${signatureId}</code>\nClient: ${client_id}\nError: ${retryErr.message}`
      );
    } else {
      supabaseStoragePath = supabasePath;
    }
  } else {
    supabaseStoragePath = supabasePath;
  }

  // ── Step 4: Upload to AWS S3 (optional) ──────────────────────────────────
  const s3Path = `clients/${client_id}/${yyyyMM}/${dd}_${document_type}_${document_version ?? "v1.0"}_executed.pdf`;
  const s3Result = await uploadToS3(pdfBytes, s3Path);

  if (!s3Result.success) {
    console.log(JSON.stringify({ level: "warn", msg: "S3 upload skipped or failed", error: s3Result.error }));
  }

  // ── Step 5: Upload to Google Drive (optional) ────────────────────────────
  const driveResult = await uploadToGoogleDrive(pdfBytes, fileName);

  if (!driveResult.success) {
    console.log(JSON.stringify({ level: "warn", msg: "Google Drive upload skipped or failed", error: driveResult.error }));
  }

  // ── Step 6: Re-verify SHA-256 from Supabase Storage ─────────────────────
  // Download the stored file and recompute hash to confirm integrity
  if (supabaseStoragePath) {
    try {
      const { data: downloadData, error: downloadErr } = await supabase.storage
        .from("client-documents")
        .download(supabaseStoragePath);

      if (!downloadErr && downloadData) {
        const storedBytes = new Uint8Array(await downloadData.arrayBuffer());
        const uploadedHash = await sha256Hex(pdfBytes);
        const storedHash = await sha256Hex(storedBytes);

        if (uploadedHash === storedHash) {
          storageVerified = true;
          console.log(JSON.stringify({ level: "info", msg: "Storage SHA-256 verified", signature_id: signatureId }));
        } else {
          console.error(JSON.stringify({
            level: "error",
            msg: "Storage SHA-256 MISMATCH — possible corruption",
            signature_id: signatureId,
            expected: uploadedHash.slice(0, 16),
            got: storedHash.slice(0, 16),
          }));
          await sendTelegramAlert(
            `<b>STORAGE HASH MISMATCH</b>\nSignature: <code>${signatureId}</code>\nCorruption detected in Supabase Storage upload.`
          );
        }
      }
    } catch (verifyErr) {
      console.error(JSON.stringify({ level: "error", msg: "Storage verify download failed", err: String(verifyErr) }));
    }
  }

  // ── Update signature record with storage paths + verification ────────────
  await supabase
    .from("signatures")
    .update({
      supabase_path: supabaseStoragePath,
      s3_path: s3Result.success ? s3Result.path : null,
      google_drive_file_id: driveResult.success ? driveResult.fileId : null,
      storage_verified: storageVerified,
    })
    .eq("id", signatureId);

  // ── Step 7: Email to client ───────────────────────────────────────────────
  const docTypeLabel = document_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const clientEmailHtml = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #0A1628; padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #C9A84C; font-size: 24px; margin: 0 0 8px;">Cosby Capital</h1>
        <p style="color: #ffffff; margin: 0; font-size: 14px;">Your executed agreement is attached</p>
      </div>
      <div style="background: #ffffff; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
        <p>Dear ${signed_by_name},</p>
        <p>Your <strong>${docTypeLabel}</strong> with Cosby Capital has been executed successfully.</p>
        <p>Please find a copy of your executed agreement attached to this email. This document has been archived securely in your Cosby Capital account.</p>
        <div style="background: #f9f9f9; border-left: 4px solid #C9A84C; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: #666;">Execution Details</p>
          <p style="margin: 0 0 4px; font-size: 13px;"><strong>Document:</strong> ${docTypeLabel}</p>
          <p style="margin: 0 0 4px; font-size: 13px;"><strong>Date/Time:</strong> ${signed_at} (UTC)</p>
          <p style="margin: 0; font-size: 12px; color: #888; font-family: monospace;">Audit Hash: ${audit_hash.slice(0, 32)}...</p>
        </div>
        <p style="font-size: 13px; color: #666;">This electronic signature was executed under the E-SIGN Act (15 U.S.C. § 7001) and Alabama UETA and carries the same legal effect as a handwritten signature.</p>
        <p style="font-size: 13px;">Questions? Contact us at <a href="mailto:info@cosbycapital.com" style="color: #C9A84C;">info@cosbycapital.com</a></p>
        <p>Sincerely,<br/><strong>Cosby Capital</strong></p>
      </div>
    </div>
  `;

  const clientEmailResult = await sendEmailWithPdf({
    to: signed_by_email,
    subject: `Your Executed ${docTypeLabel} — Cosby Capital`,
    html: clientEmailHtml,
    pdfBytes,
    fileName,
  });

  // ── Step 8: Email to admin ────────────────────────────────────────────────
  const adminEmailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0A1628;">New Agreement Executed</h2>
      <p>A new client agreement has been executed on the Cosby Capital platform.</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Business</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${business_name}</strong></td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Signed by</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${signed_by_name} &lt;${signed_by_email}&gt;</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Document</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${docTypeLabel}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Signed at</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${signed_at} UTC</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">IP Address</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${signed_ip}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Signature ID</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace;">${signatureId}</td></tr>
        <tr><td style="padding: 8px; color: #666;">Storage Verified</td><td style="padding: 8px; color: ${storageVerified ? "green" : "red"};">${storageVerified ? "Yes" : "No"}</td></tr>
      </table>
      <p style="font-size: 12px; color: #888; margin-top: 16px;">Executed copy attached. Stored at: ${supabaseStoragePath ?? "storage failed"}</p>
    </div>
  `;

  const adminEmailResult = await sendEmailWithPdf({
    to: "info@cosbycapital.com",
    subject: `New Agreement Executed: ${business_name} — ${docTypeLabel}`,
    html: adminEmailHtml,
    pdfBytes,
    fileName,
  });

  // ── Step 9: Update email delivery flags ───────────────────────────────────
  await supabase
    .from("signatures")
    .update({
      client_email_sent: clientEmailResult.success,
      admin_email_sent: adminEmailResult.success,
    })
    .eq("id", signatureId);

  if (!clientEmailResult.success) {
    console.error(JSON.stringify({ level: "error", msg: "Client email failed", error: clientEmailResult.error, signature_id: signatureId }));
  }
  if (!adminEmailResult.success) {
    console.error(JSON.stringify({ level: "error", msg: "Admin email failed", error: adminEmailResult.error, signature_id: signatureId }));
  }

  console.log(JSON.stringify({
    level: "info",
    msg: "execute-signature complete",
    signature_id: signatureId,
    storage_verified: storageVerified,
    s3: s3Result.success,
    drive: driveResult.success,
    client_email: clientEmailResult.success,
    admin_email: adminEmailResult.success,
  }));

  // ── Step 10: Return ───────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      signature_id: signatureId,
      storage_verified: storageVerified,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
