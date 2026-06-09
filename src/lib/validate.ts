/**
 * Zod schemas with .max() on every string field (GAP-255)
 * Central validation layer for all API routes.
 * validateRedirect() uses an allowlist to prevent open-redirect attacks (GAP-258/259).
 */

import { z } from "zod";

// ── Allowlisted redirect paths (GAP-258/259) ─────────────────────────────────
const REDIRECT_ALLOWLIST: string[] = [
  "/dashboard",
  "/dashboard/profile",
  "/dashboard/documents",
  "/dashboard/applications",
  "/dashboard/credit",
  "/dashboard/grants",
  "/dashboard/funding",
  "/dashboard/consulting",
  "/dashboard/signatures",
  "/auth/login",
  "/auth/signup",
  "/auth/reset-password",
  "/auth/verify",
  "/auth/callback",
  "/onboarding",
];

/**
 * Validates a redirect URL against the allowlist.
 * Returns the validated path or '/dashboard' as safe fallback.
 * Never allows external URLs or protocol-relative URLs (GAP-258/259).
 */
export function validateRedirect(url: string): string {
  if (typeof url !== "string" || url.length === 0) return "/dashboard";

  // Reject anything with a protocol (http://, https://, javascript:, data:, //)
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(url)) return "/dashboard";
  if (url.startsWith("//")) return "/dashboard";

  // Must start with /
  if (!url.startsWith("/")) return "/dashboard";

  // Strip query string and hash for allowlist check
  const pathOnly = url.split("?")[0].split("#")[0];

  // Exact match or prefix match against allowlist
  const allowed = REDIRECT_ALLOWLIST.some(
    (allowed) => pathOnly === allowed || pathOnly.startsWith(allowed + "/")
  );

  return allowed ? url : "/dashboard";
}

// ── Reusable field definitions ────────────────────────────────────────────────

const emailField = z.string().email().max(254);
const nameField = z.string().min(1).max(200);
const shortTextField = z.string().max(500);
const longTextField = z.string().max(5000);
const urlField = z.string().url().max(2048).optional();
const phoneField = z
  .string()
  .max(20)
  .regex(/^\+?[\d\s\-().]{7,20}$/, "Invalid phone number")
  .optional();
const uuidField = z.string().uuid();

// ── Client profile schema ─────────────────────────────────────────────────────

export const clientProfileSchema = z.object({
  business_name: nameField,
  owner_name: nameField,
  email: emailField,
  phone: phoneField,
  business_type: z.string().min(1).max(100),
  industry: z.string().max(100).optional(),
  years_in_business: z.number().int().min(0).max(200).optional(),
  annual_revenue: z.number().min(0).max(1_000_000_000).optional(),
  employee_count: z.number().int().min(0).max(1_000_000).optional(),
  ein: z
    .string()
    .max(10)
    .regex(/^\d{2}-?\d{7}$/, "Invalid EIN format")
    .optional(),
  business_address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip: z
    .string()
    .max(10)
    .regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code")
    .optional(),
  website: urlField,
  notes: longTextField.optional(),
});

export type ClientProfile = z.infer<typeof clientProfileSchema>;

// ── Document upload schema ────────────────────────────────────────────────────

export const documentUploadSchema = z.object({
  file_name: z.string().min(1).max(255),
  file_size: z.number().int().min(1).max(52_428_800), // 50 MB max
  content_type: z.string().max(100),
  document_type: z
    .enum([
      "tax_return",
      "bank_statement",
      "profit_loss",
      "balance_sheet",
      "articles_of_incorporation",
      "ein_letter",
      "id_document",
      "other",
    ])
    .optional(),
  client_id: uuidField,
});

export type DocumentUpload = z.infer<typeof documentUploadSchema>;

// ── Application schema ────────────────────────────────────────────────────────

export const applicationSchema = z.object({
  client_id: uuidField,
  opportunity_id: uuidField,
  opportunity_type: z.enum(["lender", "grant"]),
  notes: longTextField.optional(),
  requested_amount: z.number().min(0).max(100_000_000).optional(),
});

export type Application = z.infer<typeof applicationSchema>;

// ── Auth schemas ──────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(8).max(128),
});

export const signupSchema = z.object({
  email: emailField,
  password: z.string().min(8).max(128),
  full_name: nameField,
  business_name: nameField,
});

export const resetPasswordSchema = z.object({
  email: emailField,
});

export const newPasswordSchema = z.object({
  password: z.string().min(8).max(128),
  confirm_password: z.string().min(8).max(128),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

// ── Contact / support schema ──────────────────────────────────────────────────

export const contactSchema = z.object({
  name: nameField,
  email: emailField,
  subject: z.string().min(1).max(200),
  message: longTextField,
});

// ── Signature request schema ──────────────────────────────────────────────────

export const signatureRequestSchema = z.object({
  client_id: uuidField,
  document_id: uuidField,
  signer_name: nameField,
  signer_email: emailField,
  notes: shortTextField.optional(),
});

// ── Credit roadmap schema ─────────────────────────────────────────────────────

export const creditRoadmapSchema = z.object({
  client_id: uuidField,
  current_score: z.number().int().min(300).max(850).optional(),
  target_score: z.number().int().min(300).max(850).optional(),
  notes: longTextField.optional(),
});

// ── Pagination / filter schema ────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  sort_by: z.string().max(50).optional(),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});
