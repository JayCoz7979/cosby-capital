/**
 * /dashboard/approvals — Agent email approval queue.
 *
 * Server component. Fetches initial approvals directly via Supabase
 * (avoids self-fetch complexity). Renders upgrade prompt for Starter tier.
 * Passes initial data to ApprovalsPageClient for interactive approve/reject.
 */

import type { Metadata } from 'next'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { canViewApprovals } from '@/lib/feature-gates'
import { ApprovalsPageClient } from './ApprovalsPageClient'
import type { ApprovalItem } from './ApprovalsPageClient'
import { logger } from '@/lib/logger'

export const metadata: Metadata = { title: 'Approvals | Cosby Capital' }

export default async function ApprovalsPage() {
  // ── Auth ────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const userId = session?.user?.id

  if (!userId) {
    // layout.tsx guards this; this is a safety net
    return null
  }

  const serviceClient = createServiceClient()

  // ── Resolve client record ────────────────────────────────────────────────
  const { data: client, error: clientError } = await serviceClient
    .from('clients')
    .select('id, subscription_tier')
    .eq('user_id', userId)
    .maybeSingle()

  if (clientError) {
    logger.error('approvals/page: failed to fetch client record', clientError)
  }

  // ── Feature gate — Starter tier sees upgrade prompt ──────────────────────
  if (!client || !canViewApprovals(client.subscription_tier)) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-[28px] font-semibold text-gray-900">Approvals</h1>
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-6">
          <h2 className="font-heading text-[20px] font-semibold text-gray-900 mb-2">
            Upgrade Required
          </h2>
          <p className="text-sm font-body text-gray-600">
            The approvals queue is available on Growth tier and above.
          </p>
        </div>
      </div>
    )
  }

  // ── Fetch initial approvals ──────────────────────────────────────────────
  const { data: approvalsData, error: approvalsError } = await serviceClient
    .from('agent_emails')
    .select(
      'id, agent_name, email_type, to_name, to_email, subject, body_html, created_at, client_approved, requires_admin_approval'
    )
    .eq('client_id', client.id)
    .eq('requires_client_approval', true)
    .eq('client_approved', false)
    .order('created_at', { ascending: false })

  if (approvalsError) {
    logger.error('approvals/page: failed to fetch approvals', approvalsError)
  }

  const approvals: ApprovalItem[] = (approvalsData ?? []) as ApprovalItem[]

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">Approvals</h1>
      <ApprovalsPageClient initialApprovals={approvals} />
    </div>
  )
}
