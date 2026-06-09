/**
 * DELETE /api/dashboard/documents/[id]
 *
 * Verifies ownership, removes file from Supabase Storage, and deletes DB record.
 *
 * Security:
 *   - Auth required (401 if missing)
 *   - Ownership verified with 50ms minimum delay (T-04-04-03, S16-004)
 *   - Returns 404 on ownership failure (not 403) to prevent enumeration
 *   - Storage file removed before DB record deletion
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

const MIN_RESPONSE_MS = 50

export async function DELETE(
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

    // ── Delete from Supabase Storage ──────────────────────────────────────────
    const filePath = doc.file_path_supabase as string
    if (filePath) {
      const { error: storageError } = await serviceClient.storage
        .from('client-documents')
        .remove([filePath])

      if (storageError) {
        logger.warn('documents/delete: storage removal failed', {
          documentId,
          error: storageError.message,
        })
        // Continue with DB deletion even if storage removal fails
      }
    }

    // ── Delete DB record ──────────────────────────────────────────────────────
    const { error: deleteError } = await serviceClient
      .from('client_documents')
      .delete()
      .eq('id', documentId)

    if (deleteError) {
      logger.error('documents/delete: DB deletion failed', deleteError)
      return NextResponse.json({ error: 'Delete failed. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ deleted: true })
  } catch (err) {
    logger.error('documents/delete: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
