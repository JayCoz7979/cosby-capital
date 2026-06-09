'use client'

/**
 * LenderIntroCard — displays a lender match with intro request button state machine.
 *
 * FTC disclosure text is ALWAYS rendered below card body — never conditionally hidden.
 * Button states: idle → loading → success (pill) | error (inline message + retry).
 * Feature gate: canRequestLenderIntro() checked client-side for UX; server enforces via 403.
 */

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApprovalStatusPill } from './ApprovalStatusPill'
import { canRequestLenderIntro, SubscriptionTier } from '@/lib/feature-gates'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LenderData {
  id: string
  name: string
  lender_type: string | null
  description: string | null
  website: string | null
  min_loan_amount: number | null
  max_loan_amount: number | null
  min_credit_score: number | null
  loan_types: string[] | null
}

export interface LenderMatch {
  id: string
  lender_id: string
  match_score: number
  match_reasons: string[] | null
  disqualifiers: string[] | null
  recommended_loan_type: string | null
  estimated_loan_range_min: number | null
  estimated_loan_range_max: number | null
  status: string | null
  lenders: LenderData | null
}

interface LenderIntroCardProps {
  match: LenderMatch
  hasExistingRequest: boolean
  tier: string
}

type IntroStatus = 'idle' | 'loading' | 'success' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatLoanRange(min: number | null, max: number | null): string {
  if (min && max) return `${formatCurrency(min)} – ${formatCurrency(max)}`
  if (max) return `Up to ${formatCurrency(max)}`
  if (min) return `From ${formatCurrency(min)}`
  return 'Variable'
}

function getScoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-[#C9A84C] text-white'
  if (score >= 50) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

function formatLenderType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LenderIntroCard({ match, hasExistingRequest, tier }: LenderIntroCardProps) {
  const [introStatus, setIntroStatus] = useState<IntroStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const lender = match.lenders
  const score = Math.round(match.match_score ?? 0)
  const scoreBadgeClass = getScoreBadgeClass(score)
  const canRequest = canRequestLenderIntro(tier as SubscriptionTier)

  const loanRange = formatLoanRange(
    match.estimated_loan_range_min ?? lender?.min_loan_amount ?? null,
    match.estimated_loan_range_max ?? lender?.max_loan_amount ?? null
  )

  async function handleRequestIntro() {
    setIntroStatus('loading')
    setErrorMessage(null)
    try {
      const res = await fetch('/api/dashboard/lender-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lender_match_id: match.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Request failed')
      }
      setIntroStatus('success')
    } catch (err) {
      setIntroStatus('error')
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : 'Introduction request failed. Please try again or contact support if this continues.'
      )
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-[20px]">
              {lender?.name ?? 'Unknown Lender'}
            </CardTitle>
            {lender?.lender_type && (
              <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-body font-medium bg-gray-100 text-gray-600">
                {formatLenderType(lender.lender_type)}
              </span>
            )}
          </div>

          {/* Score badge */}
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold font-body shrink-0 ${scoreBadgeClass}`}
            aria-label={`Match score: ${score}%`}
          >
            {score}%
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Description */}
        {lender?.description && (
          <p className="text-sm font-body text-gray-600">{lender.description}</p>
        )}

        {/* Loan details */}
        <div className="flex flex-wrap gap-4 text-sm font-body">
          <span>
            <span className="font-medium text-gray-900">Loan Range:</span>{' '}
            <span className="text-gray-700">{loanRange}</span>
          </span>
          {lender?.min_credit_score && (
            <span>
              <span className="font-medium text-gray-900">Min. Credit Score:</span>{' '}
              <span className="text-gray-700">{lender.min_credit_score}</span>
            </span>
          )}
          {match.recommended_loan_type && (
            <span>
              <span className="font-medium text-gray-900">Recommended:</span>{' '}
              <span className="text-gray-700">{match.recommended_loan_type}</span>
            </span>
          )}
        </div>

        {/* Match reasons */}
        {match.match_reasons && match.match_reasons.length > 0 && (
          <div>
            <p className="text-xs font-semibold font-body text-gray-500 uppercase tracking-wide mb-1.5">
              Why This Lender
            </p>
            <ul className="space-y-1 pl-4 list-disc text-sm font-body text-gray-700">
              {match.match_reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* FTC disclosure — ALWAYS rendered, never conditional (UI-SPEC requirement) */}
        <p className="text-xs text-gray-400 font-body mt-3 border-t border-gray-100 pt-3">
          Cosby Capital may receive compensation for facilitating this introduction. This does not
          affect our matching criteria. All introductions require admin review before proceeding.
        </p>
      </CardContent>

      <CardFooter className="flex-col items-start gap-2">
        {/* Button state machine */}
        {!canRequest ? (
          <Button
            variant="secondary"
            disabled
            className="focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2"
          >
            Upgrade to Request
          </Button>
        ) : hasExistingRequest || introStatus === 'success' ? (
          <ApprovalStatusPill status="pending" />
        ) : introStatus === 'loading' ? (
          <Button
            variant="primary"
            loading={true}
            className="focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2"
          >
            Requesting…
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleRequestIntro}
            className="focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2"
          >
            {introStatus === 'error' ? 'Try Again' : 'Request Introduction'}
          </Button>
        )}

        {/* Inline error message */}
        {introStatus === 'error' && errorMessage && (
          <p role="alert" className="text-xs font-body text-red-600 mt-1">
            {errorMessage}
          </p>
        )}
      </CardFooter>
    </Card>
  )
}
