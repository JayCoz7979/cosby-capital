/**
 * /dashboard/lenders — Lender Matches page (async server component)
 *
 * Fetches lender matches, existing intro requests, and passes to LenderIntroCard list.
 * Auth is enforced by dashboard/layout.tsx — this component can assume a valid session.
 */

import type { Metadata } from 'next'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { LenderIntroCard } from '@/components/dashboard/LenderIntroCard'
import type { LenderMatch } from '@/components/dashboard/LenderIntroCard'

export const metadata: Metadata = { title: 'Lender Matches' }

export default async function LendersPage() {
  // ── Resolve session + client record ──────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return null
  }

  const serviceClient = createServiceClient()

  const { data: client } = await serviceClient
    .from('clients')
    .select('id, subscription_tier')
    .eq('user_id', session.user.id)
    .maybeSingle()

  const tier = client?.subscription_tier ?? 'starter'

  // ── Fetch lender matches + existing intro requests ────────────────────────
  let lenderMatches: LenderMatch[] = []
  const existingIntroLenderIds = new Set<string>()

  if (client) {
    const { data: matches } = await serviceClient
      .from('lender_matches')
      .select(
        'id, match_score, match_reasons, disqualifiers, recommended_loan_type, estimated_loan_range_min, estimated_loan_range_max, status, lender_id, lenders(id, name, lender_type, description, website, min_loan_amount, max_loan_amount, min_credit_score, loan_types)'
      )
      .eq('client_id', client.id)
      .order('match_score', { ascending: false })

    lenderMatches = (matches as unknown as LenderMatch[]) ?? []

    // Fetch existing intro requests to gate "Request Introduction" button
    const { data: existingIntros } = await serviceClient
      .from('agent_emails')
      .select('id')
      .eq('client_id', client.id)
      .eq('email_type', 'lender_intro')
      .eq('requires_admin_approval', true)

    // Build set of lender_ids that already have a request
    // Note: agent_emails does not store lender_id directly — we track by client-level dedup
    // (one intro per client scoped at POST time). We mark all lenders as requested if any
    // existing intro exists, matching the server-side 409 logic.
    // TODO: store lender_id in agent_emails metadata in a future plan for per-lender dedup.
    if (existingIntros && existingIntros.length > 0) {
      // Mark all lender_ids from this client's matches as having an existing request
      // since the current schema doesn't store lender_id on agent_emails rows
      lenderMatches.forEach((m) => existingIntroLenderIds.add(m.lender_id))
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">Lender Matches</h1>

      {/* Empty state */}
      {lenderMatches.length === 0 && (
        <div className="rounded-lg border border-gray-100 bg-white p-10 text-center space-y-2">
          <h2 className="text-[20px] font-semibold font-heading text-gray-900">
            No Lender Matches Yet
          </h2>
          <p className="text-sm font-body text-gray-500 max-w-md mx-auto">
            We&apos;re identifying lenders aligned to your funding goals. Check back soon.
          </p>
        </div>
      )}

      {/* Lender cards */}
      {lenderMatches.length > 0 && (
        <ul className="space-y-4" aria-label="Lender matches">
          {lenderMatches.map((match) => (
            <li key={match.id}>
              <LenderIntroCard
                match={match}
                hasExistingRequest={existingIntroLenderIds.has(match.lender_id)}
                tier={tier}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
