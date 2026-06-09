/**
 * GET  /api/dashboard/notifications
 * PATCH /api/dashboard/notifications
 *
 * GET without params: returns last 50 notifications for authenticated client
 * GET ?unread_count=1: returns { unread_count: number } — used by TopNav bell
 *
 * PATCH body { ids: string[] }: marks specific notifications as read (scoped to client_id)
 * PATCH body { mark_all: true }: marks all unread notifications as read for client
 *
 * Auth required. client_id resolved from auth.uid() (never from request body).
 *
 * Threat mitigations:
 *   T-04-06-02: All PATCH updates scoped to .eq('client_id', client.id) — prevents IDOR
 *   T-04-06-03: Both handlers require valid session; 401 if missing
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

// ── GET /api/dashboard/notifications ─────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth
    const supabase = await createServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const serviceClient = createServiceClient()

    // Resolve client record
    const { data: client, error: clientError } = await serviceClient
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (clientError) {
      logger.error('GET /api/dashboard/notifications: client lookup failed', clientError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client record not found' }, { status: 404 })
    }

    // Check for ?unread_count=1 or ?unread_count=true
    const { searchParams } = new URL(request.url)
    const unreadCountParam = searchParams.get('unread_count')
    if (unreadCountParam === '1' || unreadCountParam === 'true') {
      const { count, error: countError } = await serviceClient
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .eq('read', false)

      if (countError) {
        logger.error('GET /api/dashboard/notifications: unread count query failed', countError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      return NextResponse.json({ unread_count: count ?? 0 })
    }

    // Default: return full notification list (most recent first, limit 50)
    const { data: notifications, error: fetchError } = await serviceClient
      .from('notifications')
      .select('id, type, title, body, read, read_at, action_url, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (fetchError) {
      logger.error('GET /api/dashboard/notifications: fetch failed', fetchError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ notifications: notifications ?? [] })
  } catch (err) {
    logger.error('GET /api/dashboard/notifications: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH /api/dashboard/notifications ───────────────────────────────────────

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth
    const supabase = await createServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const serviceClient = createServiceClient()

    // Resolve client record
    const { data: client, error: clientError } = await serviceClient
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (clientError) {
      logger.error('PATCH /api/dashboard/notifications: client lookup failed', clientError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client record not found' }, { status: 404 })
    }

    // Parse body
    const body = await request.json() as { ids?: unknown; mark_all?: unknown }
    const { ids, mark_all } = body

    const now = new Date().toISOString()

    if (mark_all === true) {
      // Mark all unread notifications for this client as read
      const { error: updateError } = await serviceClient
        .from('notifications')
        .update({ read: true, read_at: now })
        .eq('client_id', client.id)
        .eq('read', false)

      if (updateError) {
        logger.error('PATCH /api/dashboard/notifications: mark_all update failed', updateError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      return NextResponse.json({ updated: true })
    }

    if (ids !== undefined) {
      // Validate ids is a non-empty array
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
      }

      // T-04-06-02: .eq('client_id', client.id) scopes the update to only this client's notifications
      const { error: updateError } = await serviceClient
        .from('notifications')
        .update({ read: true, read_at: now })
        .in('id', ids as string[])
        .eq('client_id', client.id)

      if (updateError) {
        logger.error('PATCH /api/dashboard/notifications: ids update failed', updateError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      return NextResponse.json({ updated: true })
    }

    // Neither ids nor mark_all provided
    return NextResponse.json(
      { error: 'Provide ids array or mark_all=true' },
      { status: 400 }
    )
  } catch (err) {
    logger.error('PATCH /api/dashboard/notifications: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
