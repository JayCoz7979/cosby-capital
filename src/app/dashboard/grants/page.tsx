/**
 * /dashboard/grants — Grant Matches page (async server component)
 *
 * Fetches initial grant matches and total count server-side via serviceClient,
 * then passes to GrantMatchList for client-side search/filter/sort/pagination.
 *
 * Auth is enforced by dashboard/layout.tsx — this component can assume a valid session.
 */

import type { Metadata } from 'next'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { GrantMatchList } from '@/components/dashboard/GrantMatchList'
import type { GrantMatch } from '@/components/dashboard/GrantMatchCard'

export const metadata: Metadata = { title: 'Grant Matches' }

export default async function GrantsPage() {
  // ── Resolve session + client record ──────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Layout enforces auth — session should always be present here
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

  // ── Fetch initial grant matches (page 0) ──────────────────────────────────
  let initialMatches: GrantMatch[] = []
  let initialTotal = 0

  if (client) {
    const { data: matches, count } = await serviceClient
      .from('grant_matches')
      .select(
        'id, match_score, match_reasons, eligibility_flags, status, recommended_action, grants(id, name, grantor, grantor_type, description, min_award_amount, max_award_amount, application_deadline, source_url)',
        { count: 'exact' }
      )
      .eq('client_id', client.id)
      .order('match_score', { ascending: false })
      .range(0, 9)

    initialMatches = (matches as unknown as GrantMatch[]) ?? []
    initialTotal = count ?? 0
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-[28px] font-semibold text-gray-900">Grant Matches</h1>
      </div>

      {/* Starter tier info banner */}
      {tier === 'starter' && (
        <div className="rounded-md bg-blue-50 border border-blue-200 p-4 text-sm font-body text-blue-700">
          Grant matches are read-only on Starter. Upgrade to Growth to request grant writing
          services.
        </div>
      )}

      <GrantMatchList
        initialMatches={initialMatches}
        initialTotal={initialTotal}
        tier={tier}
      />
    </div>
  )
}
