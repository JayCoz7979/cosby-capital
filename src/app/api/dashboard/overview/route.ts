/**
 * GET /api/dashboard/overview
 *
 * Returns the funding readiness score, match counts, and pending approvals
 * for the authenticated client. Score is computed from client profile fields
 * if not stored directly in the clients table.
 *
 * Auth required (T-04-02-01: Session check; 401 on missing session).
 * client_id always resolved from auth.uid() → clients.id join (T-04-02-02).
 *
 * Returns:
 *   {
 *     funding_readiness_score: number,
 *     score_tier_label: string,
 *     score_factors: Array<{ label: string; value: string; positive: boolean }>,
 *     grant_match_count: number,
 *     lender_match_count: number,
 *     pending_approvals: number,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { scoreTierLabel, computeScore, buildScoreFactors } from '@/lib/funding-score'

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const supabase = await createServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const serviceClient = createServiceClient()

    // ── Fetch client record ───────────────────────────────────────────────────
    const { data: clientRecord, error: clientError } = await serviceClient
      .from('clients')
      .select(
        'id, subscription_tier, credit_score_range, years_in_business, annual_revenue, onboarding_completed, funding_goal, funding_purpose'
      )
      .eq('user_id', userId)
      .maybeSingle()

    if (clientError) {
      logger.error('dashboard/overview: failed to fetch client record', clientError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!clientRecord) {
      return NextResponse.json({ error: 'Client profile not found' }, { status: 404 })
    }

    // ── Compute score (no funding_readiness_score column in schema) ───────────
    const funding_readiness_score = computeScore({
      credit_score_range: clientRecord.credit_score_range ?? null,
      years_in_business: clientRecord.years_in_business ?? null,
      annual_revenue: clientRecord.annual_revenue ?? null,
      onboarding_completed: clientRecord.onboarding_completed ?? null,
    })

    const score_tier_label = scoreTierLabel(funding_readiness_score)
    const score_factors = buildScoreFactors({
      credit_score_range: clientRecord.credit_score_range ?? null,
      years_in_business: clientRecord.years_in_business ?? null,
      annual_revenue: clientRecord.annual_revenue ?? null,
      onboarding_completed: clientRecord.onboarding_completed ?? null,
      funding_goal: clientRecord.funding_goal ?? null,
    })

    // ── Parallel match + approval counts ──────────────────────────────────────
    const [grantResult, lenderResult, pendingResult] = await Promise.all([
      serviceClient
        .from('grant_matches')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientRecord.id),
      serviceClient
        .from('lender_matches')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientRecord.id),
      serviceClient
        .from('agent_emails')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientRecord.id)
        .eq('requires_client_approval', true)
        .eq('client_approved', false),
    ])

    if (grantResult.error) {
      logger.error('dashboard/overview: failed to fetch grant_match_count', grantResult.error)
    }
    if (lenderResult.error) {
      logger.error('dashboard/overview: failed to fetch lender_match_count', lenderResult.error)
    }
    if (pendingResult.error) {
      logger.error('dashboard/overview: failed to fetch pending_approvals', pendingResult.error)
    }

    return NextResponse.json({
      funding_readiness_score,
      score_tier_label,
      score_factors,
      grant_match_count: grantResult.count ?? 0,
      lender_match_count: lenderResult.count ?? 0,
      pending_approvals: pendingResult.count ?? 0,
    })
  } catch (err) {
    logger.error('dashboard/overview: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
