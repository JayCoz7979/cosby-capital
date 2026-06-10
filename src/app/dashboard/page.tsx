/**
 * Dashboard home page — SC-4-5: Funding Readiness Score visible above the fold.
 *
 * Async server component. Fetches overview data directly via Supabase
 * (avoids self-fetch pattern which requires cookie forwarding complexity).
 * Layout: FundingReadinessScore hero → 3-stat row → pending approvals banner.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { FundingReadinessScore } from '@/components/dashboard/FundingReadinessScore'
import { logger } from '@/lib/logger'
import { scoreTierLabel, computeScore, buildScoreFactors } from '@/lib/funding-score'

export const metadata: Metadata = { title: 'Dashboard | Cosby Capital' }

// ── Overview data type ────────────────────────────────────────────────────────

interface OverviewData {
  funding_readiness_score: number
  score_tier_label: string
  score_factors: Array<{ label: string; value: string; positive: boolean }>
  grant_match_count: number
  lender_match_count: number
  pending_approvals: number
}

// ── Data fetcher ──────────────────────────────────────────────────────────────

async function getOverviewData(userId: string): Promise<OverviewData | null> {
  try {
    const serviceClient = createServiceClient()

    const { data: clientRecord, error: clientError } = await serviceClient
      .from('clients')
      .select(
        'id, credit_score_range, years_in_business, annual_revenue, onboarding_completed, funding_goal'
      )
      .eq('user_id', userId)
      .maybeSingle()

    if (clientError) {
      logger.error('dashboard/page: failed to fetch client record', clientError)
      return null
    }

    if (!clientRecord) return null

    const funding_readiness_score = computeScore({
      credit_score_range: clientRecord.credit_score_range ?? null,
      years_in_business: clientRecord.years_in_business ?? null,
      annual_revenue: clientRecord.annual_revenue ?? null,
      onboarding_completed: clientRecord.onboarding_completed ?? null,
    })

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

    return {
      funding_readiness_score,
      score_tier_label: scoreTierLabel(funding_readiness_score),
      score_factors: buildScoreFactors({
        credit_score_range: clientRecord.credit_score_range ?? null,
        years_in_business: clientRecord.years_in_business ?? null,
        annual_revenue: clientRecord.annual_revenue ?? null,
        onboarding_completed: clientRecord.onboarding_completed ?? null,
        funding_goal: clientRecord.funding_goal ?? null,
      }),
      grant_match_count: grantResult.count ?? 0,
      lender_match_count: lenderResult.count ?? 0,
      pending_approvals: pendingResult.count ?? 0,
    }
  } catch (err) {
    logger.error('dashboard/page: unexpected error in getOverviewData', err)
    return null
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  // Auth — layout.tsx already guards this route; re-check for userId
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const userId = session?.user?.id
  const data: OverviewData | null = userId ? await getOverviewData(userId) : null

  // ── Error / missing state ──────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-[28px] font-semibold text-gray-900">Dashboard</h1>
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700 font-body">
          Something went wrong. Please refresh the page.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page title */}
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">Dashboard</h1>

      {/* Funding Readiness Score hero — above the fold, max-w-sm centered */}
      <div className="max-w-sm">
        <FundingReadinessScore
          score={data.funding_readiness_score}
          tierLabel={data.score_tier_label}
          factors={data.score_factors}
        />
      </div>

      {/* Pending approvals amber banner (conditional) */}
      {data.pending_approvals > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-body text-amber-800">
            You have {data.pending_approvals} item(s) awaiting your approval.
          </p>
          <Link
            href="/dashboard/approvals"
            className="text-sm font-semibold font-body text-amber-900 hover:underline whitespace-nowrap ml-4"
          >
            Review Now →
          </Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Grant Matches */}
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-body text-gray-500">Grant Matches</p>
          <p className="mt-1 font-heading text-2xl font-semibold text-gray-900">
            {data.grant_match_count}
          </p>
        </div>

        {/* Lender Matches */}
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-body text-gray-500">Lender Matches</p>
          <p className="mt-1 font-heading text-2xl font-semibold text-gray-900">
            {data.lender_match_count}
          </p>
        </div>

        {/* Pending Approvals */}
        <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <p className="text-sm font-body text-gray-500">Pending Approvals</p>
            {data.pending_approvals > 0 && (
              <span
                className="inline-block h-2 w-2 rounded-full bg-amber-400"
                aria-label="Has pending approvals"
              />
            )}
          </div>
          <p className="mt-1 font-heading text-2xl font-semibold text-gray-900">
            {data.pending_approvals}
          </p>
        </div>
      </div>
    </div>
  )
}
