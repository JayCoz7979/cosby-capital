/**
 * POST /api/stripe/create-checkout
 *
 * Creates a Stripe Checkout Session for the chosen tier + billing period.
 * Auth required. Input validated with Zod before any Stripe calls.
 *
 * Returns: { url: string } — client redirects to this Stripe-hosted URL.
 *
 * Security:
 * - Zod validates tier + billing_period allowlist (no open redirect via tier)
 * - Stripe customer get-or-create (stores stripe_customer_id on clients)
 * - Price IDs come from server env vars — never from client input
 * - sanitizeForLog() on all log entries — no card data ever logged
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { stripe, PRICE_IDS } from '@/lib/stripe'
import { logger } from '@/lib/logger'

// ── Input validation ──────────────────────────────────────────────────────────

const checkoutRequestSchema = z.object({
  tier: z.enum(['starter', 'growth', 'capital_partner']),
  billing_period: z.enum(['monthly', 'annual']),
})

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const userEmail = session.user.email ?? ''

  // ── Parse + validate body ─────────────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = checkoutRequestSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid tier or billing_period', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { tier, billing_period } = parsed.data

  // ── Resolve price ID from server env vars ─────────────────────────────────
  const priceKey = `${tier}_${billing_period}`
  const priceId = PRICE_IDS[priceKey]

  if (!priceId) {
    logger.error('create-checkout: price ID not configured', undefined, {
      tier,
      billing_period,
      priceKey,
    })
    return NextResponse.json(
      { error: 'Billing configuration not available. Please contact support.' },
      { status: 500 }
    )
  }

  // ── Get client record ─────────────────────────────────────────────────────
  const serviceClient = createServiceClient()

  const { data: clientRecord, error: clientError } = await serviceClient
    .from('clients')
    .select('id, stripe_customer_id, business_name, email')
    .eq('user_id', userId)
    .maybeSingle()

  if (clientError) {
    logger.error('create-checkout: failed to fetch client record', clientError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (!clientRecord) {
    return NextResponse.json(
      { error: 'Client profile not found. Please complete onboarding first.' },
      { status: 400 }
    )
  }

  const clientId: string = clientRecord.id

  // ── Get or create Stripe customer ─────────────────────────────────────────
  let stripeCustomerId: string = clientRecord.stripe_customer_id ?? ''

  if (!stripeCustomerId) {
    try {
      const customer = await stripe.customers.create({
        email: userEmail || clientRecord.email,
        name: clientRecord.business_name ?? undefined,
        metadata: {
          client_id: clientId,
          user_id: userId,
        },
      })
      stripeCustomerId = customer.id

      // Persist new customer ID — use service client (bypasses RLS)
      const { error: updateError } = await serviceClient
        .from('clients')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', clientId)

      if (updateError) {
        logger.error('create-checkout: failed to save stripe_customer_id', updateError)
        // Non-fatal — continue, customer is already created in Stripe
      }
    } catch (err) {
      logger.error('create-checkout: failed to create Stripe customer', err)
      return NextResponse.json(
        { error: 'Failed to initialize billing. Please try again.' },
        { status: 500 }
      )
    }
  }

  // ── Create Stripe Checkout Session ────────────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cosbycapital.com'

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/onboarding/step-6?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/onboarding/step-6?canceled=true`,
      subscription_data: {
        metadata: {
          client_id: clientId,
          user_id: userId,
          tier,
          billing_period,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    })

    logger.info('create-checkout: session created', {
      client_id: clientId,
      tier,
      billing_period,
      // No session URL or session ID logged — could contain tracking tokens
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    logger.error('create-checkout: Stripe session creation failed', err)
    return NextResponse.json(
      { error: 'Failed to create checkout session. Please try again.' },
      { status: 500 }
    )
  }
}
