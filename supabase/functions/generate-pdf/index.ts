/**
 * generate-pdf — Supabase Edge Function
 *
 * Generates an executed PDF for a signed agreement.
 * Called internally by execute-signature.
 *
 * Input: {
 *   document_type, document_text_snapshot, signed_by_name, signed_by_email,
 *   signed_at, signed_ip, document_hash, audit_hash, client_id
 * }
 * Returns: PDF as binary (application/pdf)
 *
 * PDF structure:
 *   - Header: "EXECUTED ELECTRONIC AGREEMENT" + Cosby Capital
 *   - Body: full document_text_snapshot
 *   - Signature block (styled name line)
 *   - Footer: ELECTRONIC SIGNATURE EXECUTION RECORD with all audit fields
 *   - Output watermark: diagonal "EXECUTED COPY — [client_id]" (S14-002)
 *
 * Implementation note:
 *   Uses pdf-lib from esm.sh (Deno-compatible). pdf-lib is a pure JS library
 *   that works in Deno without Node.js APIs.
 *
 *   Dancing Script font: approximated with Helvetica-Oblique (standard PDF font)
 *   in the signature block. TODO(production): embed Dancing Script OTF via
 *   PDFDocument.embedFont() with the actual font bytes for authentic cursive rendering.
 *
 * Security:
 *   - Requires x-service-secret header (same INTERNAL_SERVICE_SECRET)
 *   - client_id embedded in watermark (output marking, S14-002)
 */

// @ts-ignore — Deno ESM import
import { PDFDocument, rgb, StandardFonts, degrees } from "https://esm.sh/pdf-lib@1.17.1";

const INTERNAL_SERVICE_SECRET = Deno.env.get("INTERNAL_SERVICE_SECRET") ?? "";

interface GeneratePdfPayload {
  document_type: string;
  document_text_snapshot: string;
  signed_by_name: string;
  signed_by_email: string;
  signed_at: string;
  signed_ip: string;
  document_hash: string;
  audit_hash: string;
  client_id: string;
}

/** Wrap text to fit within a given character width */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    if (paragraph.length <= maxChars) {
      lines.push(paragraph);
      continue;
    }
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > maxChars) {
        if (current) lines.push(current.trim());
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(current.trim());
  }
  return lines;
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

  // ── Auth ──────────────────────────────────────────────────────────────────
  const serviceSecret = req.headers.get("x-service-secret") ?? "";
  if (!INTERNAL_SERVICE_SECRET || serviceSecret !== INTERNAL_SERVICE_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let payload: GeneratePdfPayload;
  try {
    payload = await req.json() as GeneratePdfPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    document_type,
    document_text_snapshot,
    signed_by_name,
    signed_by_email,
    signed_at,
    signed_ip,
    document_hash,
    audit_hash,
    client_id,
  } = payload;

  try {
    // ── Create PDF document ───────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();

    // Embed standard fonts
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // Oblique approximates cursive for signature block
    // TODO(production): embed Dancing Script OTF bytes via pdfDoc.embedFont()
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Navy and gold brand colors (RGB normalized 0–1)
    const navyRgb = rgb(0.039, 0.086, 0.157);   // #0A1628
    const goldRgb = rgb(0.788, 0.659, 0.298);    // #C9A84C
    const blackRgb = rgb(0, 0, 0);
    const grayRgb = rgb(0.4, 0.4, 0.4);
    const lightGrayRgb = rgb(0.85, 0.85, 0.85);

    // Page dimensions (US Letter: 8.5 × 11 inches = 612 × 792 pt)
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 60;
    const contentWidth = pageWidth - margin * 2;

    // Document body text — split into lines
    const docTypeLabel = document_type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    // Use document_text_snapshot if it has real content; otherwise use the type label
    const bodyText = document_text_snapshot && document_text_snapshot.length > 100
      ? document_text_snapshot
      : `${docTypeLabel}\n\nDocument type: ${document_type}\nVersion: v1.0\n\nFull text available in the signed document archive.`;

    const bodyLines = wrapText(bodyText, 90);

    // ── Layout: multi-page rendering ─────────────────────────────────────
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPos = pageHeight - margin;
    const lineHeight = 14;
    const smallLineHeight = 12;

    function ensureSpace(needed: number): void {
      if (yPos - needed < margin + 60) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        yPos = pageHeight - margin;
        // Watermark on each page
        addWatermark(page);
      }
    }

    function addWatermark(p: ReturnType<typeof pdfDoc.addPage>): void {
      // Diagonal "EXECUTED COPY — [client_id]" watermark (S14-002)
      const watermarkText = `EXECUTED COPY — ${client_id}`;
      p.drawText(watermarkText, {
        x: 80,
        y: 380,
        size: 32,
        font: helveticaBold,
        color: rgb(0.88, 0.88, 0.88),
        opacity: 0.18,
        rotate: degrees(35),
      });
    }

    // Add watermark to first page
    addWatermark(page);

    // ── Header ────────────────────────────────────────────────────────────
    // Navy header bar
    page.drawRectangle({
      x: 0,
      y: pageHeight - 70,
      width: pageWidth,
      height: 70,
      color: navyRgb,
    });

    page.drawText("COSBY CAPITAL", {
      x: margin,
      y: pageHeight - 32,
      size: 16,
      font: helveticaBold,
      color: goldRgb,
    });

    page.drawText("EXECUTED ELECTRONIC AGREEMENT", {
      x: margin,
      y: pageHeight - 52,
      size: 10,
      font: helvetica,
      color: rgb(0.9, 0.9, 0.9),
    });

    page.drawText(`cosbycapital.com`, {
      x: pageWidth - margin - 100,
      y: pageHeight - 42,
      size: 9,
      font: helvetica,
      color: goldRgb,
    });

    yPos = pageHeight - 90;

    // ── Document title ────────────────────────────────────────────────────
    page.drawText(docTypeLabel, {
      x: margin,
      y: yPos,
      size: 14,
      font: helveticaBold,
      color: navyRgb,
    });
    yPos -= 8;

    // Gold underline
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: pageWidth - margin, y: yPos },
      thickness: 1.5,
      color: goldRgb,
    });
    yPos -= 20;

    // ── Body text ─────────────────────────────────────────────────────────
    for (const line of bodyLines) {
      ensureSpace(lineHeight + 2);

      if (line === "") {
        yPos -= lineHeight * 0.5;
        continue;
      }

      // Section headings (all-caps lines that aren't dividers)
      const isSectionHeading =
        line === line.toUpperCase() &&
        line.length > 4 &&
        !line.match(/^[━─=]+$/) &&
        !line.match(/^\d/) &&
        line.trim() !== "";

      if (isSectionHeading) {
        yPos -= 4;
        page.drawText(line.slice(0, 100), {
          x: margin,
          y: yPos,
          size: 9,
          font: helveticaBold,
          color: goldRgb,
        });
        yPos -= lineHeight;
      } else if (line.match(/^[━─=]+$/)) {
        // Divider line
        page.drawLine({
          start: { x: margin, y: yPos + 4 },
          end: { x: pageWidth - margin, y: yPos + 4 },
          thickness: 0.5,
          color: lightGrayRgb,
        });
        yPos -= lineHeight * 0.6;
      } else {
        page.drawText(line.slice(0, 110), {
          x: margin,
          y: yPos,
          size: 8.5,
          font: helvetica,
          color: blackRgb,
        });
        yPos -= smallLineHeight;
      }
    }

    // ── Signature block ───────────────────────────────────────────────────
    ensureSpace(160);
    yPos -= 20;

    // Separator
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: pageWidth - margin, y: yPos },
      thickness: 1,
      color: navyRgb,
    });
    yPos -= 16;

    page.drawText("ELECTRONIC SIGNATURE", {
      x: margin,
      y: yPos,
      size: 11,
      font: helveticaBold,
      color: navyRgb,
    });
    yPos -= 20;

    // Signature in oblique (approximating Dancing Script)
    // TODO(production): replace with embedded Dancing Script OTF for authentic cursive
    page.drawText(signed_by_name, {
      x: margin,
      y: yPos,
      size: 24,
      font: helveticaOblique,
      color: navyRgb,
    });
    yPos -= 8;

    // Signature underline
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: margin + 280, y: yPos },
      thickness: 0.75,
      color: grayRgb,
    });
    yPos -= 14;

    page.drawText(`Electronically signed by: ${signed_by_name}`, {
      x: margin,
      y: yPos,
      size: 8,
      font: helvetica,
      color: grayRgb,
    });
    yPos -= smallLineHeight;

    page.drawText(`Email: ${signed_by_email}`, {
      x: margin,
      y: yPos,
      size: 8,
      font: helvetica,
      color: grayRgb,
    });
    yPos -= smallLineHeight;

    // ── Footer: ELECTRONIC SIGNATURE EXECUTION RECORD ────────────────────
    ensureSpace(120);
    yPos -= 20;

    // Footer box
    const footerHeight = 100;
    const footerY = yPos - footerHeight;
    page.drawRectangle({
      x: margin - 4,
      y: footerY,
      width: contentWidth + 8,
      height: footerHeight,
      color: rgb(0.97, 0.97, 0.97),
      borderColor: navyRgb,
      borderWidth: 0.5,
    });

    const footerLines = [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "ELECTRONIC SIGNATURE EXECUTION RECORD",
      `Document: ${docTypeLabel} v1.0`,
      `Signed by: ${signed_by_name}`,
      `Email: ${signed_by_email}  |  Date/Time: ${signed_at} UTC`,
      `IP: ${signed_ip}`,
      `Document Hash: ${document_hash.slice(0, 32)}...`,
      `Audit Hash: ${audit_hash.slice(0, 32)}...`,
      "Executed under E-SIGN Act (15 U.S.C. § 7001) and Alabama UETA.",
      "Cosby Capital  |  cosbycapital.com",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ];

    let footerLineY = yPos - 10;
    for (const line of footerLines) {
      if (line.match(/^━+$/)) {
        page.drawLine({
          start: { x: margin, y: footerLineY + 4 },
          end: { x: pageWidth - margin, y: footerLineY + 4 },
          thickness: 0.5,
          color: navyRgb,
        });
        footerLineY -= 8;
        continue;
      }

      const isBold =
        line === "ELECTRONIC SIGNATURE EXECUTION RECORD" ||
        line.startsWith("Document:") ||
        line === "Cosby Capital  |  cosbycapital.com";

      page.drawText(line.slice(0, 100), {
        x: margin,
        y: footerLineY,
        size: 7.5,
        font: isBold ? helveticaBold : helvetica,
        color: line === "ELECTRONIC SIGNATURE EXECUTION RECORD" ? navyRgb : grayRgb,
      });
      footerLineY -= 9;
    }

    // ── Serialize PDF ─────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();

    console.log(JSON.stringify({
      level: "info",
      msg: "PDF generated",
      size: pdfBytes.length,
      document_type,
      client_id,
    }));

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${document_type}_executed.pdf"`,
      },
    });
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      msg: "generate-pdf failed",
      error: String(err),
      client_id,
    }));

    return new Response(JSON.stringify({ error: "PDF generation failed", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
