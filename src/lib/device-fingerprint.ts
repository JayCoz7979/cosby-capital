"use client";

/**
 * Client-side device fingerprint generation.
 *
 * Generates a stable, privacy-respecting device fingerprint from browser
 * properties. The fingerprint is SHA-256 hashed via Web Crypto API to produce
 * a 64-character hex string.
 *
 * Security notes:
 * - The fingerprint is used ONLY for device trust lookup — never as an auth token
 * - No PII is stored: only the hash reaches the server
 * - Canvas fingerprint is basic and non-intrusive (no cross-origin data)
 * - This is a client-only module (browser APIs required)
 */

/**
 * Generates a canvas-based fingerprint component.
 * Renders a small canvas with text and returns its data URL hash contribution.
 * Returns empty string if canvas is not available (SSR safety).
 */
function getCanvasFingerprint(): string {
  try {
    if (typeof document === "undefined") return "";

    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;

    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // Render text with specific font — rendering differs subtly across GPU/driver combinations
    ctx.textBaseline = "alphabetic";
    ctx.font = "14px Arial, sans-serif";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("CosbyCapital", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("CosbyCapital", 4, 17);

    return canvas.toDataURL();
  } catch {
    // Canvas may be blocked by privacy settings — return empty gracefully
    return "";
  }
}

/**
 * Collects browser properties for fingerprinting.
 * All values are read-only browser properties — no active tracking.
 */
function collectFingerprintComponents(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    // SSR guard — should not be called server-side
    return "ssr-placeholder";
  }

  const components = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    getCanvasFingerprint(),
  ];

  return components.join("|");
}

/**
 * Generates a SHA-256 fingerprint of the current device/browser.
 * Uses Web Crypto API for hashing (available in all modern browsers).
 *
 * @returns Promise<string> — 64-character hex string (SHA-256 hash)
 */
export async function generateFingerprint(): Promise<string> {
  const raw = collectFingerprintComponents();

  // Use Web Crypto API (SubtleCrypto) — available in all modern browsers and Next.js edge
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hexHash = hashArray
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return hexHash; // 64-character hex string
}
