/**
 * funding-score.ts — shared funding readiness score helpers.
 *
 * Extracted from src/app/dashboard/page.tsx and
 * src/app/api/dashboard/overview/route.ts (WR-06) to provide a single
 * source of truth. Both files previously contained identical copies —
 * any scoring logic change must now be made only here.
 */

export function scoreTierLabel(score: number): string {
  if (score >= 80) return 'Strong — Ready to Apply'
  if (score >= 60) return 'Good — A Few Items to Address'
  if (score >= 40) return 'Fair — Improvements Recommended'
  return 'Early Stage — Building Your Profile'
}

export function computeScore(client: {
  credit_score_range: string | null
  years_in_business: number | null
  annual_revenue: number | null
  onboarding_completed: boolean | null
}): number {
  let score = 40

  if (client.credit_score_range === '750+') score += 25
  else if (client.credit_score_range === '700-750') score += 20
  else if (client.credit_score_range === '650-700') score += 15
  else if (client.credit_score_range === '600-650') score += 10
  else if (client.credit_score_range === '500-600') score += 5

  if (client.years_in_business != null) {
    if (client.years_in_business >= 5) score += 20
    else if (client.years_in_business >= 2) score += 10
  }

  if (client.annual_revenue != null) {
    if (client.annual_revenue >= 500000) score += 15
    else if (client.annual_revenue >= 100000) score += 10
  }

  if (client.onboarding_completed) score += 5

  return Math.min(score, 100)
}

export function buildScoreFactors(client: {
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
