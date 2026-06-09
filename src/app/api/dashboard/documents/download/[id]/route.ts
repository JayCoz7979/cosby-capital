/**
 * GET /api/dashboard/documents/download/[id]
 *
 * Returns a time-limited signed URL for an owned document.
 * Raw storage paths are NEVER returned to the browser (T-04-04-04).
 *
 * Security:
 *   - Auth required (401 if missing)
 *   - Ownership verified with 50ms minimum delay (T-04-04-03, S16-004)
 *   - Returns 404 on ownership failure (not 403) to prevent enumeration
 *   - Signed URL expires in 3600 seconds
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

const MIN_RESPONSE_MS = 50

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = await createServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: documentId } = await params
    const userId = session.user.id
    const serviceClient = createServiceClient()

    // ── Ownership check with 50ms minimum delay (T-04-04-03, S16-004) ────────
    // client_documents uses client_id (not user_id) — join through clients table
    const startMs = Date.now()

    const { data: doc } = await serviceClient
      .from('client_documents')
      .select('id, file_path_supabase, clients!inner(user_id)')
      .eq('id', documentId)
      .maybeSingle()

    const owned = doc !== null && (doc.clients as unknown as { user_id: string } | null)?.user_id === userId

    const elapsed = Date.now() - startMs
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed))
    }

    if (!owned || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // ── Generate signed URL ───────────────────────────────────────────────────
    const { data: signed, error: signedErr } = await serviceClient.storage
      .from('client-documents')
      .createSignedUrl(doc.file_path_supabase as string, 3600)

    if (signedErr || !signed) {
      logger.error('documents/download: failed to generate signed URL', signedErr)
      return NextResponse.json(
        { error: 'Failed to generate download link' },
        { status: 500 }
      )
    }

    // Return signed URL only — never the raw storage path
    return NextResponse.json({ url: signed.signedUrl })
  } catch (err) {
    logger.error('documents/download: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
