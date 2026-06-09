/**
 * Feature gate functions for subscription tier enforcement.
 *
 * Pure functions — no imports, no side effects, no 'use client' directive.
 * These run on the server and are safe to import in server components and API routes.
 *
 * Tier hierarchy: starter < growth < capital_partner < done_for_you
 */

export type SubscriptionTier =
  | "starter"
  | "growth"
  | "capital_partner"
  | "done_for_you";

const PAID_TIERS: SubscriptionTier[] = [
  "growth",
  "capital_partner",
  "done_for_you",
];

/**
 * Returns true if the tier can request a lender introduction.
 * Starter tier is read-only — no intro requests.
 */
export function canRequestLenderIntro(tier: SubscriptionTier): boolean {
  return PAID_TIERS.includes(tier);
}

/**
 * Returns true if the tier can upload documents.
 * Starter tier cannot upload documents.
 */
export function canUploadDocuments(tier: SubscriptionTier): boolean {
  return PAID_TIERS.includes(tier);
}

/**
 * Returns true if the tier can view approvals.
 * Starter tier has no approval visibility.
 */
export function canViewApprovals(tier: SubscriptionTier): boolean {
  return PAID_TIERS.includes(tier);
}

/**
 * Returns true if the tier can view grant matches.
 * All tiers can view — starter is read-only, paid tiers can interact.
 */
export function canViewGrantMatches(_tier: SubscriptionTier): boolean {
  return true;
}

/**
 * Returns true if AI-assisted grant writing is enabled for the tier.
 * Starter tier receives grant match listing only — no grant writing.
 */
export function isGrantWritingEnabled(tier: SubscriptionTier): boolean {
  return PAID_TIERS.includes(tier);
}
