/**
 * Prompt injection defense + output confidentiality scanning (S9-003, S9-005, S10-002, S8-011)
 * Server-side only — never import in client components.
 */

import DOMPurify from "isomorphic-dompurify";

// ── Injection patterns to strip from user input before AI prompts ──────────────
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|context)/gi,
  /disregard\s+(previous|all|above|prior)\s+(instructions?|prompts?|context)/gi,
  /forget\s+(everything|all|previous|prior)/gi,
  /you\s+are\s+now\s+/gi,
  /act\s+as\s+(?:an?\s+)?(?:unrestricted|jailbroken|DAN|evil|harmful)/gi,
  /SYSTEM\s*:/g,
  /###\s*(?:Instruction|System|Override|Prompt)\s*:/gi,
  /<\s*(?:system|assistant|human|user|prompt|context|instruction)[^>]*>/gi,
  /<\/\s*(?:system|assistant|human|user|prompt|context|instruction)\s*>/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<<SYS>>/gi,
  /<\/SYS>>/gi,
];

// ── PII / confidentiality patterns for output scanning ────────────────────────
const CONFIDENTIALITY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g, label: "SSN" },
  { pattern: /\b\d{2}-?\d{7}\b/g, label: "EIN" },
  {
    pattern: /sk-ant-api[0-9]{2}-[a-zA-Z0-9\-_]{93}AA/g,
    label: "ANTHROPIC_API_KEY",
  },
  {
    pattern: /sk_(live|test)_[a-zA-Z0-9]{24,}/g,
    label: "STRIPE_SECRET_KEY",
  },
  {
    pattern: /rk_(live|test)_[a-zA-Z0-9]{24,}/g,
    label: "STRIPE_RESTRICTED_KEY",
  },
  { pattern: /re_[a-zA-Z0-9]{30,}/g, label: "RESEND_API_KEY" },
  { pattern: /eyJ[a-zA-Z0-9+/=]{100,}/g, label: "JWT_TOKEN" },
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, label: "CARD_NUMBER" },
];

/** Maximum character length for user content before truncation (S9-006 ~8000 tokens ≈ 32000 chars) */
const MAX_PROMPT_CHARS = 32000;

/**
 * Sanitizes user input before inclusion in AI prompts.
 * - Removes XML override tags and injection keywords
 * - Truncates to MAX_PROMPT_CHARS
 * - Wraps in <user_content> XML delimiters (S10-002)
 */
export function sanitizeForPrompt(input: string): string {
  if (typeof input !== "string") return "<user_content></user_content>";

  let sanitized = input;

  // Strip injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, "");
  }

  // Truncate to token budget
  if (sanitized.length > MAX_PROMPT_CHARS) {
    sanitized = sanitized.slice(0, MAX_PROMPT_CHARS);
  }

  // Wrap in XML delimiters (S10-002)
  return `<user_content>${sanitized}</user_content>`;
}

/**
 * Scans AI output for confidential data before returning to client (S9-005).
 * Returns safe=false if any PII or credentials detected.
 */
export function scanOutputConfidentiality(output: string): {
  safe: boolean;
  violations: string[];
} {
  if (typeof output !== "string") return { safe: true, violations: [] };

  const violations: string[] = [];

  for (const { pattern, label } of CONFIDENTIALITY_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(output)) {
      violations.push(label);
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Sanitizes HTML for safe email rendering using DOMPurify server-side (S8-011).
 * Strips all script tags, event handlers, and javascript: URLs.
 */
export function sanitizeForEmail(html: string): string {
  if (typeof html !== "string") return "";

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a",
      "b",
      "br",
      "div",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "i",
      "img",
      "li",
      "ol",
      "p",
      "span",
      "strong",
      "table",
      "tbody",
      "td",
      "th",
      "thead",
      "tr",
      "ul",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "style", "class", "target", "rel"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    FORBID_TAGS: ["script", "object", "embed", "form", "input", "iframe"],
    ALLOW_DATA_ATTR: false,
    // Strip javascript: and data: URIs
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
