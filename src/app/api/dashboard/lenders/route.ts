/**
 * GET /api/dashboard/lenders
 *
 * Returns lender matches for the authenticated client, sorted by match_score descending.
 * Also returns existing lender intro requests so the UI can disable already-requested lenders.
 *
 * Threat mitigations:
 *   T-04-03-04: all queries scoped to client_id resolved from auth.uid()
 *
 * Auth required.
 *
 * Returns:
 *   { matches: [...], existing_intros: [...] }
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

  // ── Resolve client record ─────────────────────────────────────────────────
  const serviceClient = createServiceClient()

  const { data: client, error: clientError } = await serviceClient
    .from('clients')
    .select('id, subscription_tier')
    .eq('user_id', userId)
    .maybeSingle()

  if (clientError) {
    logger.error('lenders: failed to fetch client record', clientError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (!client) {
    return NextResponse.json({ error: 'Client profile not found' }, { status: 404 })
  }

  try {
    // ── Fetch lender matches ──────────────────────────────────────────────────
    const { data: matches, error: matchesError } = await serviceClient
      .from('lender_matches')
      .select(
        'id, match_score, match_reasons, disqualifiers, recommended_loan_type, estimated_loan_range_min, estimated_loan_range_max, status, lender_id, lenders(id, name, lender_type, description, website, min_loan_amount, max_loan_amount, min_credit_score, loan_types)'
      )
      .eq('client_id', client.id)
      .order('match_score', { ascending: false })

    if (matchesError) {
      logger.error('lenders: failed to fetch lender_matches', matchesError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // ── Fetch existing intro requests ─────────────────────────────────────────
    const { data: existingIntros, error: introsError } = await serviceClient
      .from('agent_emails')
      .select('id, client_id, email_type')
      .eq('client_id', client.id)
      .eq('email_type', 'lender_intro')
      .eq('requires_admin_approval', true)

    if (introsError) {
      logger.error('lenders: failed to fetch existing intros', introsError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({
      matches: matches ?? [],
      existing_intros: existingIntros ?? [],
    })
  } catch (err) {
    logger.error('lenders: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
