'server-only'

/**
 * Stripe server client — singleton instance with PCI-safe configuration.
 *
 * Security:
 * - 'server-only' import guard prevents client bundle inclusion
 * - STRIPE_SECRET_KEY is never in any NEXT_PUBLIC_ variable
 * - maxNetworkRetries: 3 for transient network failures
 * - API version pinned to '2023-10-16' — never use 'latest'
 *
 * Usage:
 *   import { stripe, PRICE_IDS, getTierFromPriceId } from '@/lib/stripe'
 */

import Stripe from 'stripe'

// ── Singleton Stripe instance ─────────────────────────────────────────────────

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
  maxNetworkRetries: 3,
})

// ── Price ID map — 3 tiers × 2 billing periods = 6 price IDs ─────────────────
// Done For You has no self-service price — handled via sales contact.

export const PRICE_IDS: Record<string, string> = {
  starter_monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID ?? '',
  starter_annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? '',
  growth_monthly: process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID ?? '',
  growth_annual: process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID ?? '',
  capital_partner_monthly: process.env.STRIPE_CAPITAL_PARTNER_MONTHLY_PRICE_ID ?? '',
  capital_partner_annual: process.env.STRIPE_CAPITAL_PARTNER_ANNUAL_PRICE_ID ?? '',
}

// ── Reverse map: price ID → tier name (for webhook processing) ────────────────

export const TIER_NAMES: Record<string, string> = {}

// Build reverse map at module load time — avoids repeated lookups in webhook handler
for (const [key, priceId] of Object.entries(PRICE_IDS)) {
  if (priceId) {
    // key format: "starter_monthly" → tier is "starter"
    const tier = key.replace(/_monthly$|_annual$/, '')
    TIER_NAMES[priceId] = tier
  }
}

/**
 * Returns the subscription tier name for a given Stripe price ID.
 * Returns null if the price ID is not in the known PRICE_IDS map.
 *
 * Used by the webhook handler to map subscription.items.data[0].price.id
 * back to a tier string for storing in clients.subscription_tier.
 */
export function getTierFromPriceId(priceId: string): string | null {
  return TIER_NAMES[priceId] ?? null
}
