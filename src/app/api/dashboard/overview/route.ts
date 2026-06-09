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

// ── Score tier label mapping ──────────────────────────────────────────────────

function scoreTierLabel(score: number): string {
  if (score >= 80) return 'Strong — Ready to Apply'
  if (score >= 60) return 'Good — A Few Items to Address'
  if (score >= 40) return 'Fair — Improvements Recommended'
  return 'Early Stage — Building Your Profile'
}

// ── Score computation from profile fields ────────────────────────────────────

function computeScore(client: {
  credit_score_range: string | null
  years_in_business: number | null
  annual_revenue: number | null
  onboarding_completed: boolean | null
}): number {
  let score = 40

  // Credit score range
  if (client.credit_score_range === '750+') score += 25
  else if (client.credit_score_range === '700-750') score += 20
  else if (client.credit_score_range === '650-700') score += 15
  else if (client.credit_score_range === '600-650') score += 10
  else if (client.credit_score_range === '500-600') score += 5

  // Years in business — take highest bracket only
  if (client.years_in_business != null) {
    if (client.years_in_business >= 5) score += 20
    else if (client.years_in_business >= 2) score += 10
  }

  // Annual revenue — take highest bracket only
  if (client.annual_revenue != null) {
    if (client.annual_revenue >= 500000) score += 15
    else if (client.annual_revenue >= 100000) score += 10
  }

  // Onboarding complete
  if (client.onboarding_completed) score += 5

  return Math.min(score, 100)
}

// ── Score factors array ───────────────────────────────────────────────────────

function buildScoreFactors(client: {
  credit_score_range: string | null
  years_in_business: number | null
  annual_revenue: number | null
  onboarding_completed: boolean | null
  funding_goal: number | null
}): Array<{ label: string; value: string; positive: boolean }> {
  const positiveRanges = new Set(['650-700', '700-750', '750+'])

  return [
    {
      label: 'Credit Score',
      value: client.credit_score_range ?? 'Not provided',
      positive: client.credit_score_range != null && positiveRanges.has(client.credit_score_range),
    },
    {
      label: 'Years in Business',
      value: client.years_in_business != null ? `${client.years_in_business} years` : 'Not provided',
      positive: (client.years_in_business ?? 0) >= 2,
    },
    {
      label: 'Annual Revenue',
      value: client.annual_revenue != null
        ? `$${client.annual_revenue.toLocaleString()}`
        : 'Not provided',
      positive: (client.annual_revenue ?? 0) >= 100000,
    },
    {
      label: 'Onboarding Complete',
      value: client.onboarding_completed ? 'Yes' : 'Incomplete',
      positive: !!client.onboarding_completed,
    },
    {
      label: 'Funding Goal Set',
      value: client.funding_goal != null
        ? `$${client.funding_goal.toLocaleString()}`
        : 'Not set',
      positive: client.funding_goal != null,
    },
  ]
}

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
