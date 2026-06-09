/**
 * GET /api/stripe/subscription-status
 *
 * Returns the current subscription state for the authenticated user.
 * Used by dashboard components to show tier info and enforce feature gates.
 *
 * Auth required.
 *
 * Returns:
 *   { tier, status, current_period_end, cancel_at_period_end }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // ── Fetch subscription state from clients table ───────────────────────────
  const serviceClient = createServiceClient()

  const { data: clientRecord, error } = await serviceClient
    .from('clients')
    .select(
      'subscription_tier, subscription_status, subscription_current_period_end, subscription_cancel_at_period_end'
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    logger.error('subscription-status: failed to fetch client record', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (!clientRecord) {
    // No client record yet — return default free state
    return NextResponse.json({
      tier: null,
      status: 'inactive',
      current_period_end: null,
      cancel_at_period_end: false,
    })
  }

  return NextResponse.json({
    tier: clientRecord.subscription_tier ?? null,
    status: clientRecord.subscription_status ?? 'inactive',
    current_period_end: clientRecord.subscription_current_period_end ?? null,
    cancel_at_period_end: clientRecord.subscription_cancel_at_period_end ?? false,
  })
}
