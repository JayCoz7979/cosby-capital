/**
 * FundingReadinessScore — arc progress visualization with gold fill.
 *
 * Display-only component (T-04-02-03: no mutations exposed).
 * Uses SVG semi-arc for the visual ring and a sr-only @radix-ui/react-progress
 * element for accessibility.
 */

import * as Progress from '@radix-ui/react-progress'
import { CheckCircle, XCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoreFactor {
  label: string
  value: string
  positive: boolean
}

export interface FundingReadinessScoreProps {
  score: number
  tierLabel: string
  factors: ScoreFactor[]
}

// ── Arc constants ─────────────────────────────────────────────────────────────
// Semi-circle from 180° to 360°, centre (60,60), radius 50.
// Circumference of half-circle = π × r

const CX = 60
const CY = 60
const R = 50
const CIRCUMFERENCE = Math.PI * R // ≈ 157.08

// Starting point for the arc (left end of the semi-circle, 9 o'clock position)
const ARC_START_X = CX - R  // 10
const ARC_START_Y = CY       // 60

// Ending point (right end, 3 o'clock position)
const ARC_END_X = CX + R    // 110
const ARC_END_Y = CY         // 60

// SVG path for the upper semi-circle (180° → 360°, i.e. the bottom half is cut off)
// We draw the arc going clockwise from the left point to the right point via the top.
const ARC_PATH = `M ${ARC_START_X} ${ARC_START_Y} A ${R} ${R} 0 0 1 ${ARC_END_X} ${ARC_END_Y}`

// ── Component ─────────────────────────────────────────────────────────────────

export function FundingReadinessScore({
  score,
  tierLabel,
  factors,
}: FundingReadinessScoreProps) {
  const clampedScore = Math.max(0, Math.min(100, score))
  const dashOffset = CIRCUMFERENCE * (1 - clampedScore / 100)

  return (
    <Card className="p-6">
      {/* Heading */}
      <h2 className="text-[20px] font-semibold font-heading text-gray-900 mb-4">
        Funding Readiness Score
      </h2>

      {/* SVG Arc */}
      <div className="flex flex-col items-center">
        <svg
          viewBox="0 0 120 70"
          className="w-[180px] h-[110px]"
          aria-hidden="true"
          focusable="false"
        >
          {/* Track arc — gray */}
          <path
            d={ARC_PATH}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={10}
            strokeLinecap="round"
          />

          {/* Progress arc — gold */}
          <path
            d={ARC_PATH}
            fill="none"
            stroke="#C9A84C"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />

          {/* Score number */}
          <text
            x={CX}
            y={CY - 4}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-heading"
            style={{
              fontSize: '22px',
              fontWeight: 600,
              fill: '#111827',
              fontFamily: 'var(--font-playfair, serif)',
            }}
          >
            {clampedScore}
          </text>
        </svg>

        {/* Tier label below arc */}
        <p className="text-[14px] text-gray-500 font-body text-center mt-1">
          {tierLabel}
        </p>
      </div>

      {/* Accessible sr-only progress element (Radix UI) */}
      <Progress.Root
        value={clampedScore}
        max={100}
        className="sr-only"
        aria-label="Funding readiness score"
      >
        <Progress.Indicator style={{ transform: `translateX(-${100 - clampedScore}%)` }} />
      </Progress.Root>

      {/* Score factors */}
      {factors.length > 0 && (
        <ul className="mt-4 space-y-2">
          {factors.map((factor) => (
            <li key={factor.label} className="flex items-center justify-between">
              <span className="text-sm font-body text-gray-600">{factor.label}</span>
              <span className="flex items-center gap-1.5 text-sm font-body font-semibold text-gray-900">
                {factor.value}
                {factor.positive ? (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" aria-hidden="true" />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
