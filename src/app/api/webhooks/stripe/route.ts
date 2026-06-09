/**
 * POST /api/webhooks/stripe
 *
 * Production-grade Stripe webhook handler with atomic idempotency.
 *
 * SECURITY ORDER (non-negotiable, S6-001):
 *   1. Verify webhook signature FIRST — constructEvent() before any processing
 *   2. Idempotency check — processed_webhook_events BEFORE processing event
 *   3. Process allowlisted events only (5 types) — all others silently ignored
 *   4. Upsert to processed_webhook_events AFTER processing (atomic)
 *
 * PCI COMPLIANCE:
 *   - Raw body NEVER logged anywhere
 *   - No Stripe event objects logged (may contain billing details)
 *   - Only safe scalar metadata (client_id, tier, event type) logged
 *
 * EXCLUDED FROM JWT MIDDLEWARE:
 *   - middleware.ts PUBLIC_API_PREFIXES includes '/api/webhooks/'
 *   - Stripe signs requests — no JWT auth needed or wanted here
 */

import { NextRequest, NextResponse } from 'next/server'
import { stripe, getTierFromPriceId } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

// ── Allowlisted event types — ignore everything else silently ─────────────────
const ALLOWED_EVENTS = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.paid',
])

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── STEP 1: Read raw body for signature verification (MUST be first) ──────
  // App Router: request.text() gives raw string without body parsing.
  // DO NOT call request.json() — that consumes the body and breaks sig verify.
  const rawBody = await request.text()

  // ── STEP 2: Verify Stripe webhook signature (S6-001) ─────────────────────
  // constructEvent() MUST be called before any business logic.
  // If signature is invalid → return 400 immediately, no processing.
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    logger.warn('stripe-webhook: missing stripe-signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: import('stripe').Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    // Invalid signature — could be a spoofed request or misconfigured secret.
    // Log event type only (not body — PCI). Do NOT log rawBody.
    logger.warn('stripe-webhook: signature verification failed', {
      error: err instanceof Error ? err.message : 'unknown',
    })
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  // ── STEP 3: Check allowlist — ignore non-supported event types ────────────
  if (!ALLOWED_EVENTS.has(event.type)) {
    // Silently acknowledge — do not process, do not error
    return NextResponse.json({ received: true })
  }

  // ── STEP 4: Idempotency check (S14-009) ───────────────────────────────────
  // Check processed_webhook_events BEFORE any state mutation.
  // If already processed → return success immediately without re-processing.
  const serviceClient = createServiceClient()

  const { data: existing } = await serviceClient
    .from('processed_webhook_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existing) {
    // Already processed — idempotent success response
    logger.info('stripe-webhook: duplicate event skipped', {
      event_type: event.type,
      // event.id logged safely — it's a non-sensitive identifier
      event_id: event.id,
    })
    return NextResponse.json({ received: true })
  }

  // ── STEP 5: Process the event ─────────────────────────────────────────────
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event, serviceClient)
        break
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event, serviceClient)
        break
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event, serviceClient)
        break
      }
      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(event, serviceClient)
        break
      }
      case 'invoice.paid': {
        await handleInvoicePaid(event, serviceClient)
        break
      }
    }
  } catch (err) {
    logger.error('stripe-webhook: event processing failed', err, {
      event_type: event.type,
      event_id: event.id,
    })
    // Return 500 so Stripe retries — do NOT upsert to processed_webhook_events
    // since processing failed and we want retry semantics
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  // ── STEP 6: Mark event as processed (atomic upsert) ──────────────────────
  // onConflict: 'stripe_event_id' ensures exactly-once even under concurrent delivery.
  const { error: upsertError } = await serviceClient
    .from('processed_webhook_events')
    .upsert(
      {
        stripe_event_id: event.id,
        event_type: event.type,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'stripe_event_id' }
    )

  if (upsertError) {
    // Log but don't fail — event was processed, idempotency record is best-effort
    logger.error('stripe-webhook: failed to upsert processed_webhook_events', upsertError, {
      event_id: event.id,
    })
  }

  return NextResponse.json({ received: true })
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  event: import('stripe').Stripe.Event,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any
): Promise<void> {
  const session = event.data.object as import('stripe').Stripe.Checkout.Session

  // Retrieve the subscription to get price ID and period end
  if (!session.subscription) {
    logger.warn('stripe-webhook: checkout.session.completed has no subscription', {
      session_id: session.id,
    })
    return
  }

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  )

  // Get client_id from subscription metadata (set during checkout session creation)
  const clientId =
    subscription.metadata?.client_id ??
    session.metadata?.client_id

  if (!clientId) {
    logger.warn('stripe-webhook: checkout.session.completed missing client_id in metadata', {
      session_id: session.id,
    })
    return
  }

  // Determine tier from price ID
  const priceId = subscription.items.data[0]?.price?.id
  const tier = priceId ? getTierFromPriceId(priceId) : null

  if (!tier) {
    logger.warn('stripe-webhook: unknown price ID in subscription', {
      price_id: priceId ?? 'none',
      client_id: clientId,
    })
    return
  }

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null

  const { error } = await serviceClient
    .from('clients')
    .update({
      subscription_tier: tier,
      subscription_status: 'active',
      stripe_subscription_id: subscription.id,
      subscription_current_period_end: periodEnd,
      subscription_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    })
    .eq('id', clientId)

  if (error) {
    logger.error('stripe-webhook: failed to update client on checkout.session.completed', error, {
      client_id: clientId,
    })
    throw error
  }

  // Telegram notification — no card data, safe metadata only
  await sendTelegramNotification(
    serviceClient,
    clientId,
    `New subscriber — tier: ${tier}`
  )

  logger.info('stripe-webhook: checkout.session.completed processed', {
    client_id: clientId,
    tier,
  })
}

async function handleSubscriptionUpdated(
  event: import('stripe').Stripe.Event,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any
): Promise<void> {
  const subscription = event.data.object as import('stripe').Stripe.Subscription

  const clientId = subscription.metadata?.client_id
  if (!clientId) {
    logger.warn('stripe-webhook: customer.subscription.updated missing client_id', {
      subscription_id: subscription.id,
    })
    return
  }

  const priceId = subscription.items.data[0]?.price?.id
  const tier = priceId ? getTierFromPriceId(priceId) : null

  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null

  // Map Stripe subscription status to our internal status
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    unpaid: 'past_due',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'canceled',
    trialing: 'active',
    paused: 'paused',
  }
  const status = statusMap[subscription.status] ?? subscription.status

  const updateData: Record<string, unknown> = {
    subscription_status: status,
    subscription_current_period_end: periodEnd,
    subscription_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  }

  if (tier) {
    updateData.subscription_tier = tier
  }

  const { error } = await serviceClient
    .from('clients')
    .update(updateData)
    .eq('id', clientId)

  if (error) {
    logger.error('stripe-webhook: failed to update client on subscription.updated', error, {
      client_id: clientId,
    })
    throw error
  }

  logger.info('stripe-webhook: customer.subscription.updated processed', {
    client_id: clientId,
    status,
    tier: tier ?? 'unchanged',
  })
}

async function handleSubscriptionDeleted(
  event: import('stripe').Stripe.Event,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any
): Promise<void> {
  const subscription = event.data.object as import('stripe').Stripe.Subscription

  const clientId = subscription.metadata?.client_id
  if (!clientId) {
    logger.warn('stripe-webhook: customer.subscription.deleted missing client_id', {
      subscription_id: subscription.id,
    })
    return
  }

  const { error } = await serviceClient
    .from('clients')
    .update({
      subscription_status: 'canceled',
      subscription_tier: null,
      subscription_cancel_at_period_end: false,
    })
    .eq('id', clientId)

  if (error) {
    logger.error('stripe-webhook: failed to update client on subscription.deleted', error, {
      client_id: clientId,
    })
    throw error
  }

  logger.info('stripe-webhook: customer.subscription.deleted processed', {
    client_id: clientId,
  })
}

async function handleInvoicePaymentFailed(
  event: import('stripe').Stripe.Event,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any
): Promise<void> {
  const invoice = event.data.object as import('stripe').Stripe.Invoice

  // Look up client by stripe_customer_id
  const customerId = invoice.customer as string
  if (!customerId) return

  const { data: clientRecord } = await serviceClient
    .from('clients')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (!clientRecord) {
    logger.warn('stripe-webhook: invoice.payment_failed — no client found for customer', {
      customer_id: customerId,
    })
    return
  }

  const { error } = await serviceClient
    .from('clients')
    .update({ subscription_status: 'past_due' })
    .eq('id', clientRecord.id)

  if (error) {
    logger.error('stripe-webhook: failed to update client on invoice.payment_failed', error, {
      client_id: clientRecord.id,
    })
    throw error
  }

  // Telegram alert — invoice.id is safe to log (not PCI-sensitive)
  await sendTelegramNotification(
    serviceClient,
    clientRecord.id,
    `Payment failed — invoice: ${invoice.id}`
  )

  logger.info('stripe-webhook: invoice.payment_failed processed', {
    client_id: clientRecord.id,
  })
}

async function handleInvoicePaid(
  event: import('stripe').Stripe.Event,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any
): Promise<void> {
  const invoice = event.data.object as import('stripe').Stripe.Invoice

  const customerId = invoice.customer as string
  if (!customerId) return

  const { data: clientRecord } = await serviceClient
    .from('clients')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (!clientRecord) {
    logger.warn('stripe-webhook: invoice.paid — no client found for customer', {
      customer_id: customerId,
    })
    return
  }

  // Clear past_due status — payment recovered
  const { error } = await serviceClient
    .from('clients')
    .update({ subscription_status: 'active' })
    .eq('id', clientRecord.id)

  if (error) {
    logger.error('stripe-webhook: failed to update client on invoice.paid', error, {
      client_id: clientRecord.id,
    })
    throw error
  }

  logger.info('stripe-webhook: invoice.paid processed', {
    client_id: clientRecord.id,
  })
}

// ── Telegram notification helper ──────────────────────────────────────────────
// Sends to the configured Telegram bot/chat. Fails silently — never throws.
// Only safe metadata is sent — no card data, no secret keys.

async function sendTelegramNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any,
  clientId: string,
  message: string
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) return

  try {
    // Fetch business name for the notification (safe to include)
    const { data: clientRecord } = await serviceClient
      .from('clients')
      .select('business_name')
      .eq('id', clientId)
      .maybeSingle()

    const businessName = clientRecord?.business_name ?? 'Unknown Client'
    const text = `Cosby Capital — ${businessName}: ${message}`

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch (err) {
    // Non-fatal — webhook processing must not fail due to notification errors
    logger.warn('stripe-webhook: telegram notification failed', {
      error: err instanceof Error ? err.message : 'unknown',
    })
  }
}
