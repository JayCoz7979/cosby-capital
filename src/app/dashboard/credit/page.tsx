/**
 * /dashboard/credit — Credit roadmap display.
 *
 * Async server component. Fetches client credit roadmap directly via Supabase.
 * Renders EmptyState when no roadmap exists.
 * Renders 6-step vertical stepper when roadmap.steps is populated.
 */

import type { Metadata } from 'next'
import { CheckCircle2, Clock, Circle } from 'lucide-react'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { EmptyState } from '@/components/ui/EmptyState'
import { ApprovalStatusPill } from '@/components/dashboard/ApprovalStatusPill'
import type { ApprovalStatus } from '@/components/dashboard/ApprovalStatusPill'
import { logger } from '@/lib/logger'

export const metadata: Metadata = { title: 'Credit Roadmap | Cosby Capital' }

interface RoadmapStep {
  step: number
  action: string
  timeline: string
  status: string
}

interface CreditRoadmap {
  id: string
  current_score_range: string | null
  target_score: number | null
  target_date: string | null
  steps: RoadmapStep[] | null
  agent_summary: string | null
  updated_at: string
}

/**
 * Maps a roadmap step status to an ApprovalStatus for the pill display.
 * complete → approved, in_progress → in_progress, anything else → pending
 */
function toApprovalStatus(status: string): ApprovalStatus {
  if (status === 'complete') return 'approved'
  if (status === 'in_progress') return 'in_progress'
  return 'pending'
}

export default async function CreditPage() {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const userId = session?.user?.id

  if (!userId) {
    return null
  }

  const serviceClient = createServiceClient()

  // ── Resolve client record ────────────────────────────────────────────────
  const { data: client, error: clientError } = await serviceClient
    .from('clients')
    .select('id, credit_score_range')
    .eq('user_id', userId)
    .maybeSingle()

  if (clientError) {
    logger.error('credit/page: failed to fetch client record', clientError)
  }

  // ── Fetch credit roadmap ─────────────────────────────────────────────────
  let roadmap: CreditRoadmap | null = null

  if (client) {
    const { data: roadmapData, error: roadmapError } = await serviceClient
      .from('credit_roadmaps')
      .select(
        'id, current_score_range, target_score, target_date, steps, agent_summary, updated_at'
      )
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (roadmapError) {
      logger.error('credit/page: failed to fetch credit roadmap', roadmapError)
    }

    roadmap = roadmapData as CreditRoadmap | null
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">Credit Roadmap</h1>

      {!roadmap ? (
        <EmptyState
          heading="Credit Roadmap Pending"
          body="Your 6-step credit roadmap is being generated. This typically takes a few minutes."
        />
      ) : (
        <div className="space-y-6">
          {/* Info stat row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-body text-gray-500">Current Score Range</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-gray-900">
                {roadmap.current_score_range ?? '—'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-body text-gray-500">Target Score</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-gray-900">
                {roadmap.target_score ?? '—'}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-body text-gray-500">Target Date</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-gray-900">
                {roadmap.target_date
                  ? new Date(roadmap.target_date).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })
                  : '—'}
              </p>
            </div>
          </div>

          {/* Agent summary blockquote */}
          {roadmap.agent_summary && (
            <blockquote className="border-l-4 border-[#C9A84C] pl-4 italic text-sm font-body text-gray-600">
              {roadmap.agent_summary}
            </blockquote>
          )}

          {/* Roadmap steps vertical stepper */}
          {roadmap.steps && roadmap.steps.length > 0 && (
            <div className="rounded-lg border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="font-heading text-[20px] font-semibold text-gray-900 mb-6">
                Your 6-Step Roadmap
              </h2>
              <ol className="space-y-0">
                {roadmap.steps.map((step, index) => {
                  const isLast = index === roadmap!.steps!.length - 1
                  const stepStatus = toApprovalStatus(step.status)

                  return (
                    <li key={step.step}>
                      <div className="flex items-start gap-4">
                        {/* Step number circle */}
                        <div className="flex flex-col items-center shrink-0">
                          <div className="w-8 h-8 rounded-full bg-[#2D5016] text-white text-sm flex items-center justify-center font-semibold font-body">
                            {step.step}
                          </div>
                          {/* Connecting line */}
                          {!isLast && (
                            <div className="border-l-2 border-gray-200 h-6 mt-1" />
                          )}
                        </div>

                        {/* Step content */}
                        <div className="flex-1 pb-4">
                          {/* Status icon + action */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {step.status === 'complete' ? (
                              <CheckCircle2
                                className="h-4 w-4 text-green-600 shrink-0"
                                aria-hidden="true"
                              />
                            ) : step.status === 'in_progress' ? (
                              <Clock
                                className="h-4 w-4 text-amber-500 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <Circle
                                className="h-4 w-4 text-gray-300 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            <p className="text-sm font-semibold font-body text-gray-900">
                              {step.action}
                            </p>
                          </div>

                          {/* Timeline + status pill */}
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-gray-500 font-body">{step.timeline}</p>
                            <ApprovalStatusPill status={stepStatus} />
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          {/* Last updated footer */}
          <p className="text-xs text-gray-400 font-body">
            Last updated:{' '}
            {new Date(roadmap.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
      )}
    </div>
  )
}
