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

// ── Onboarding step schemas ───────────────────────────────────────────────────

export const onboardingStep1Schema = z.object({
  business_name: z.string().min(1).max(200),
  owner_name: z.string().min(1).max(100),
  email: emailField,
  phone: phoneField,
  business_type: z.enum([
    "LLC",
    "Corporation",
    "Sole Proprietor",
    "Partnership",
    "Nonprofit",
    "Church",
    "Other",
  ]),
  industry: z.string().max(100).optional(),
  naics_code: z.string().max(10).optional(),
  years_in_business: z.number().int().min(0).max(100).optional(),
  employees: z.number().int().min(0).max(99999).optional(),
  annual_revenue: z.number().min(0).max(9_999_999_999).optional(),
  state: z.string().length(2).optional(),
  county: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  zip: z
    .string()
    .length(5)
    .regex(/^\d{5}$/, "ZIP must be 5 digits")
    .optional(),
});

export type OnboardingStep1 = z.infer<typeof onboardingStep1Schema>;

export const onboardingStep2Schema = z.object({
  funding_goal_amount: z.number().min(0).max(9_999_999_999).optional(),
  funding_purpose: z.string().max(500).optional(),
  urgency: z
    .enum([
      "Immediate",
      "Next 30 days",
      "Next 90 days",
      "Next 6 months",
      "Next 12 months",
      "Planning ahead",
    ])
    .optional(),
  credit_score_range: z
    .enum([
      "Under 500",
      "500-579",
      "580-619",
      "620-679",
      "680-719",
      "720-779",
      "780+",
      "Not sure",
    ])
    .optional(),
  has_collateral: z.boolean().optional(),
  has_existing_debt: z.boolean().optional(),
  current_monthly_revenue: z.number().min(0).max(9_999_999_999).optional(),
  desired_funding_amount: z.number().min(0).max(9_999_999_999).optional(),
  primary_obstacle: z
    .enum(["credit", "collateral", "documentation", "time", "other"])
    .optional(),
  previous_funding_attempts: z.boolean().optional(),
});

export type OnboardingStep2 = z.infer<typeof onboardingStep2Schema>;

export const onboardingStep3Schema = z.object({
  is_minority_owned: z.boolean().optional(),
  is_woman_owned: z.boolean().optional(),
  is_veteran_owned: z.boolean().optional(),
  is_rural: z.boolean().optional(),
  is_nonprofit: z.boolean().optional(),
  is_church: z.boolean().optional(),
  // Nonprofit/church branch fields
  org_type: z
    .enum(["501(c)(3)", "501(c)(6)", "Church", "Other"])
    .optional(),
  nonprofit_ein: z
    .string()
    .max(10)
    .regex(/^\d{2}-\d{7}$/, "Invalid EIN format")
    .optional(),
  mission_statement: z.string().max(300).optional(),
  annual_operating_budget: z.string().max(50).optional(),
  primary_funding_need: z
    .enum([
      "Program expansion",
      "Facilities",
      "Equipment",
      "Capacity building",
      "Other",
    ])
    .optional(),
});

export type OnboardingStep3 = z.infer<typeof onboardingStep3Schema>;

export const beneficialOwnerSchema = z.object({
  full_name: z.string().min(1).max(200),
  date_of_birth: z.string().max(10).optional(),
  ssn_last4: z
    .string()
    .length(4)
    .regex(/^\d{4}$/, "SSN last 4 must be 4 digits")
    .optional(),
  address: z.string().max(500).optional(),
  ownership_percentage: z.number().min(0).max(100),
});

export type BeneficialOwner = z.infer<typeof beneficialOwnerSchema>;

export const onboardingStep4Schema = z.object({
  ein: z
    .string()
    .max(10)
    .regex(/^\d{2}-\d{7}$/, "EIN must be in format XX-XXXXXXX"),
  beneficial_owners: z.array(beneficialOwnerSchema).max(4).optional(),
});

export type OnboardingStep4 = z.infer<typeof onboardingStep4Schema>;

export const onboardingStep5Schema = z.object({
  // Step 5 records that the step was reached; signature handled by execute-signature edge function
  step_reached: z.boolean().optional(),
  signature_request_id: z.string().uuid().optional(),
});

export type OnboardingStep5 = z.infer<typeof onboardingStep5Schema>;

export const onboardingStep6Schema = z.object({
  selected_tier: z.enum(["starter", "growth", "capital_partner", "done_for_you"]),
  billing_period: z.enum(["monthly", "annual"]),
});

export type OnboardingStep6 = z.infer<typeof onboardingStep6Schema>;

export const saveStepSchema = z.object({
  step: z.number().int().min(1).max(6),
  data: z.record(z.string(), z.unknown()),
});

export type SaveStep = z.infer<typeof saveStepSchema>;
