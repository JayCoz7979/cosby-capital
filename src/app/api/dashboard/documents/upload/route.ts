/**
 * POST /api/dashboard/documents/upload
 *
 * Accepts multipart/form-data with a single 'file' field.
 * Validates MIME type, file size, and optionally scans with ClamAV.
 * Uploads to Supabase Storage and inserts a row into client_documents.
 *
 * Security:
 *   - Auth required (401 if missing)
 *   - canUploadDocuments() feature gate (403 if tier too low)
 *   - Server-side MIME type + extension check (T-04-04-01)
 *   - 10 MB file size limit enforced before storage upload (T-04-04-02)
 *   - ClamAV webhook scan if CLAMAV_WEBHOOK_URL is set
 *   - SHA-256 hash computed server-side for integrity (T-04-04-01)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { canUploadDocuments } from '@/lib/feature-gates'
import type { SubscriptionTier } from '@/lib/feature-gates'
import { logger } from '@/lib/logger'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
]

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg']

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = await createServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    // ── Resolve client_id and subscription tier ───────────────────────────────
    const serviceClient = createServiceClient()

    const { data: client, error: clientError } = await serviceClient
      .from('clients')
      .select('id, subscription_tier')
      .eq('user_id', userId)
      .maybeSingle()

    if (clientError) {
      logger.error('documents/upload: failed to fetch client record', clientError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client record not found' }, { status: 404 })
    }

    // ── Feature gate ─────────────────────────────────────────────────────────
    if (!canUploadDocuments(client.subscription_tier as SubscriptionTier)) {
      return NextResponse.json(
        { error: 'Document portal requires Growth tier or above' },
        { status: 403 }
      )
    }

    // ── Parse form data ───────────────────────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // ── File size check ───────────────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 })
    }

    // ── MIME type check (T-04-04-01) ──────────────────────────────────────────
    // Primary: check Content-Type header from multipart
    if (!ALLOWED_MIMES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Accepted: PDF, DOCX, XLSX, PNG, JPG' },
        { status: 400 }
      )
    }

    // Secondary: check file extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Accepted: PDF, DOCX, XLSX, PNG, JPG' },
        { status: 400 }
      )
    }

    // ── Compute SHA-256 hash ──────────────────────────────────────────────────
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    // ── Generate storage path ─────────────────────────────────────────────────
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `clients/${client.id}/${Date.now()}_${safeName}`

    // ── Upload to Supabase Storage ────────────────────────────────────────────
    const { data: storageData, error: storageError } = await serviceClient.storage
      .from('client-documents')
      .upload(storagePath, buffer, { contentType: file.type, upsert: false })

    if (storageError) {
      logger.error('documents/upload: storage upload failed', storageError)
      return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
    }

    // ── ClamAV virus scan (optional — skipped in dev if env var not set) ──────
    if (process.env.CLAMAV_WEBHOOK_URL) {
      try {
        const scanRes = await fetch(process.env.CLAMAV_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buffer,
        })
        const scanResult = (await scanRes.json()) as { clean: boolean }

        if (scanResult.clean === false) {
          // Remove infected file from storage
          await serviceClient.storage.from('client-documents').remove([storageData.path])
          return NextResponse.json(
            {
              error:
                'This file was blocked by our security scanner. Please verify the file and try uploading again.',
            },
            { status: 422 }
          )
        }
      } catch (scanErr) {
        logger.error('documents/upload: ClamAV scan request failed', scanErr)
        // If scan fails, remove file from storage and return error
        await serviceClient.storage.from('client-documents').remove([storageData.path])
        return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
      }
    }

    // ── Insert into client_documents ──────────────────────────────────────────
    const { data: insertedRow, error: insertError } = await serviceClient
      .from('client_documents')
      .insert({
        client_id: client.id,
        document_type: 'user_upload',
        document_category: 'other',
        file_name: file.name,
        folder_path: `clients/${client.id}/`,
        file_path_supabase: storageData.path,
        file_size_bytes: file.size,
        file_hash: hashHex,
        uploaded_by: 'client',
        storage_supabase_verified: true,
      })
      .select('id, created_at')
      .single()

    if (insertError) {
      logger.error('documents/upload: DB insert failed', insertError)
      // Clean up orphaned storage file
      await serviceClient.storage.from('client-documents').remove([storageData.path])
      return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
    }

    return NextResponse.json(
      {
        id: insertedRow.id,
        file_name: file.name,
        file_size_bytes: file.size,
        created_at: insertedRow.created_at,
      },
      { status: 201 }
    )
  } catch (err) {
    logger.error('documents/upload: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
