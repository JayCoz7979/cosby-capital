/**
 * /dashboard/documents — Document portal page (server component)
 *
 * Fetches session + client record server-side, resolves initial documents,
 * then passes them to DocumentsPageClient for client-side state management.
 *
 * Feature gate: canUploadDocuments() — shows upgrade prompt for Starter tier.
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { canUploadDocuments } from '@/lib/feature-gates'
import type { SubscriptionTier } from '@/lib/feature-gates'
import { DocumentsPageClient } from './DocumentsPageClient'
import type { DocumentDoc } from '@/components/dashboard/DocumentRow'

export const metadata: Metadata = { title: 'Documents' }

export default async function DocumentsPage() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/auth/login?redirect=/dashboard/documents')
  }

  const userId = session.user.id
  const serviceClient = createServiceClient()

  // ── Resolve client record ───────────────────────────────────────────────────
  const { data: client } = await serviceClient
    .from('clients')
    .select('id, subscription_tier')
    .eq('user_id', userId)
    .maybeSingle()

  if (!client) {
    redirect('/onboarding')
  }

  // ── Feature gate ────────────────────────────────────────────────────────────
  const canUpload = canUploadDocuments(client.subscription_tier as SubscriptionTier)

  if (!canUpload) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-[28px] font-semibold text-gray-900">Documents</h1>
        <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-8 text-center">
          <h2 className="text-[20px] font-semibold font-heading text-gray-700 mb-2">
            Upgrade to Access Document Portal
          </h2>
          <p className="text-sm font-body text-gray-500 max-w-sm mx-auto mb-4">
            The document portal is available on Growth tier and above. Upload financial
            statements, business plans, and other supporting materials.
          </p>
          <p className="text-sm font-body text-[#C9A84C] font-semibold">
            Current tier: {client.subscription_tier ?? 'Starter'}
          </p>
        </div>
      </div>
    )
  }

  // ── Fetch initial documents ─────────────────────────────────────────────────
  const { data: rawDocs } = await serviceClient
    .from('client_documents')
    .select('id, file_name, document_type, document_category, file_size_bytes, created_at')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  const initialDocs: DocumentDoc[] = (rawDocs ?? []).map((d) => ({
    id: d.id as string,
    file_name: d.file_name as string,
    document_type: d.document_type as string,
    document_category: d.document_category as string | undefined,
    file_size_bytes: (d.file_size_bytes ?? 0) as number,
    created_at: d.created_at as string,
  }))

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] font-semibold text-gray-900">Documents</h1>
      <DocumentsPageClient initialDocs={initialDocs} />
    </div>
  )
}
