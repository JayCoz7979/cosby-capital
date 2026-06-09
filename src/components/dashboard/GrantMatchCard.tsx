/**
 * GrantMatchCard — displays a single grant match with score badge,
 * match reasons (expandable), award range, deadline, and status.
 *
 * No 'use client' — all interactivity delegated to parent GrantMatchList.
 * Exception: expand toggle state is local; uses 'use client' for useState.
 */

'use client'

import { useState } from 'react'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GrantData {
  id: string
  name: string
  grantor: string
  grantor_type: string | null
  description: string | null
  min_award_amount: number | null
  max_award_amount: number | null
  application_deadline: string | null
  source_url: string | null
}

export interface GrantMatch {
  id: string
  match_score: number
  match_reasons: string[] | null
  eligibility_flags: string[] | null
  status: string | null
  recommended_action: string | null
  grants: GrantData | null
}

interface GrantMatchCardProps {
  match: GrantMatch
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatAwardRange(min: number | null, max: number | null): string {
  if (min && max) return `${formatCurrency(min)} – ${formatCurrency(max)}`
  if (max) return `Up to ${formatCurrency(max)}`
  if (min) return `From ${formatCurrency(min)}`
  return 'Variable'
}

function isClosingSoon(deadline: string): boolean {
  const deadlineDate = new Date(deadline)
  const now = new Date()
  const diffDays = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays < 7
}

function getScoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-[#C9A84C] text-white'
  if (score >= 50) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GrantMatchCard({ match }: GrantMatchCardProps) {
  const [expanded, setExpanded] = useState(false)
  const grant = match.grants

  const score = Math.round(match.match_score ?? 0)
  const scoreBadgeClass = getScoreBadgeClass(score)

  const awardRange = grant
    ? formatAwardRange(grant.min_award_amount, grant.max_award_amount)
    : 'Variable'

  const closingSoon =
    grant?.application_deadline ? isClosingSoon(grant.application_deadline) : false

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        {/* Top row: score badge + status chip */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-[20px] font-semibold font-heading text-gray-900 leading-tight">
              {grant?.name ?? 'Unknown Grant'}
            </h3>
            {grant?.grantor && (
              <p className="text-sm font-body text-gray-500 mt-0.5">{grant.grantor}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status chip */}
            {match.status && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-body font-medium bg-gray-100 text-gray-600">
                {match.status}
              </span>
            )}
            {/* Score badge */}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold font-body ${scoreBadgeClass}`}
              aria-label={`Match score: ${score}%`}
            >
              {score}%
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Description */}
        {grant?.description && (
          <p className="text-sm font-body text-gray-600 line-clamp-2">{grant.description}</p>
        )}

        {/* Award range + deadline row */}
        <div className="flex flex-wrap gap-4 text-sm font-body">
          <span className="text-gray-700">
            <span className="font-medium text-gray-900">Award:</span> {awardRange}
          </span>

          {grant?.application_deadline && (
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-gray-900">Deadline:</span>{' '}
              <span className="text-gray-700">
                {new Date(grant.application_deadline).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              {closingSoon && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold font-body bg-amber-100 text-amber-700">
                  Closing Soon
                </span>
              )}
            </span>
          )}
        </div>

        {/* Recommended action */}
        {match.recommended_action && (
          <p className="text-sm font-body text-gray-500 italic">{match.recommended_action}</p>
        )}

        {/* Expandable match reasons */}
        {expanded && match.match_reasons && match.match_reasons.length > 0 && (
          <ul className="mt-2 space-y-1 pl-4 list-disc text-sm font-body text-gray-700">
            {match.match_reasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        )}

        {/* Eligibility flags (if any) */}
        {expanded && match.eligibility_flags && match.eligibility_flags.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-semibold font-body text-gray-500 uppercase tracking-wide mb-1">
              Eligibility Notes
            </p>
            <ul className="space-y-1 pl-4 list-disc text-sm font-body text-gray-600">
              {match.eligibility_flags.map((flag, i) => (
                <li key={i}>{flag}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-3 flex-wrap">
        {/* Toggle match details */}
        {(match.match_reasons?.length ?? 0) > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="text-[#2D5016] hover:text-[#2D5016] focus:ring-[#C9A84C]"
          >
            {expanded ? 'Hide Match Details' : 'View Match Details'}
          </Button>
        )}

        {/* External link to source */}
        {grant?.source_url && (
          <a
            href={grant.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-body text-gray-600
              hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 rounded"
          >
            View Grant
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </CardFooter>
    </Card>
  )
}
