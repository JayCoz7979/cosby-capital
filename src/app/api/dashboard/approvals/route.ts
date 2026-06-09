/**
 * GET  /api/dashboard/approvals  — list pending agent email approvals for this client
 * PATCH /api/dashboard/approvals  — approve or reject a specific agent email
 *
 * Auth required. Feature-gated: Growth tier and above only.
 * IDOR-protected: ownership verified server-side via client_id from auth.uid().
 *
 * Threat mitigations:
 *   T-04-05-01 — Session required; client_id from auth.uid() only
 *   T-04-05-02 — Ownership verified before update; 404 on non-matching id
 *   T-04-05-03 — canViewApprovals() enforced server-side; 403 for Starter tier
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { canViewApprovals } from '@/lib/feature-gates'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const supabase = await createServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const serviceClient = createServiceClient()

    // ── Resolve client record ────────────────────────────────────────────────
    const { data: client, error: clientError } = await serviceClient
      .from('clients')
      .select('id, subscription_tier')
      .eq('user_id', userId)
      .maybeSingle()

    if (clientError) {
      logger.error('approvals GET: failed to fetch client record', clientError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // ── Feature gate ────────────────────────────────────────────────────────
    if (!canViewApprovals(client.subscription_tier)) {
      return NextResponse.json(
        { error: 'Upgrade to Growth tier to view approvals' },
        { status: 403 }
      )
    }

    // ── Query pending approvals ─────────────────────────────────────────────
    const { data, error: queryError } = await serviceClient
      .from('agent_emails')
      .select(
        'id, agent_name, email_type, to_name, to_email, subject, body_html, created_at, client_approved, requires_admin_approval'
      )
      .eq('client_id', client.id)
      .eq('requires_client_approval', true)
      .eq('client_approved', false)
      .order('created_at', { ascending: false })

    if (queryError) {
      logger.error('approvals GET: failed to query agent_emails', queryError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ approvals: data ?? [] })
  } catch (err) {
    logger.error('approvals GET: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const supabase = await createServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const serviceClient = createServiceClient()

    // ── Resolve client record ────────────────────────────────────────────────
    const { data: client, error: clientError } = await serviceClient
      .from('clients')
      .select('id, subscription_tier')
      .eq('user_id', userId)
      .maybeSingle()

    if (clientError) {
      logger.error('approvals PATCH: failed to fetch client record', clientError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // ── Feature gate ────────────────────────────────────────────────────────
    if (!canViewApprovals(client.subscription_tier)) {
      return NextResponse.json(
        { error: 'Upgrade to Growth tier to view approvals' },
        { status: 403 }
      )
    }

    // ── Parse + validate body ────────────────────────────────────────────────
    let body: { id?: unknown; action?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'id and action (approve|reject) are required' },
        { status: 400 }
      )
    }

    const { id, action } = body

    if (
      !id ||
      typeof id !== 'string' ||
      id.trim() === '' ||
      (action !== 'approve' && action !== 'reject')
    ) {
      return NextResponse.json(
        { error: 'id and action (approve|reject) are required' },
        { status: 400 }
      )
    }

    // ── Ownership check (IDOR protection) ────────────────────────────────────
    const { data: owned, error: ownerError } = await serviceClient
      .from('agent_emails')
      .select('id')
      .eq('id', id)
      .eq('client_id', client.id)
      .maybeSingle()

    if (ownerError) {
      logger.error('approvals PATCH: ownership check failed', ownerError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!owned) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    // ── Update record ────────────────────────────────────────────────────────
    const updatePayload =
      action === 'approve'
        ? { client_approved: true, client_approved_at: new Date().toISOString() }
        : { client_approved: false, client_approved_at: new Date().toISOString() }

    const { error: updateError } = await serviceClient
      .from('agent_emails')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      logger.error('approvals PATCH: update failed', updateError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ id, action, updated: true })
  } catch (err) {
    logger.error('approvals PATCH: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
