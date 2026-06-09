/**
 * POST /api/stripe/create-portal-session
 *
 * Creates a Stripe Billing Portal session for subscription management.
 * Auth required. Client must have an active Stripe customer ID.
 *
 * Returns: { url: string } — client redirects to Stripe-hosted portal.
 *
 * Portal is configured in Stripe Dashboard to:
 *   - Allow: subscription changes, payment method updates
 *   - Disable: self-service cancellation (handled by our churn flow)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'
import { logger } from '@/lib/logger'

export async function POST(_request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // ── Look up Stripe customer ID ────────────────────────────────────────────
  const serviceClient = createServiceClient()

  const { data: clientRecord, error: clientError } = await serviceClient
    .from('clients')
    .select('id, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (clientError) {
    logger.error('create-portal-session: failed to fetch client record', clientError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (!clientRecord?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No active subscription found.' },
      { status: 400 }
    )
  }

  // ── Create Stripe Billing Portal session ──────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cosbycapital.com'

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: clientRecord.stripe_customer_id,
      return_url: `${siteUrl}/dashboard/settings`,
    })

    logger.info('create-portal-session: portal session created', {
      client_id: clientRecord.id,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    logger.error('create-portal-session: Stripe portal session creation failed', err)
    return NextResponse.json(
      { error: 'Failed to open billing portal. Please try again.' },
      { status: 500 }
    )
  }
}
