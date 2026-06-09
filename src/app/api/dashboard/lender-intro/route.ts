/**
 * POST /api/dashboard/lender-intro
 *
 * Submits a lender introduction request for the authenticated client.
 * Inserts a row into agent_emails with requires_admin_approval=true.
 *
 * Threat mitigations:
 *   T-04-03-01: Session required; client_id from auth.uid() only — never from request body
 *   T-04-03-02: canRequestLenderIntro() checked server-side; frontend disable is UX only
 *   T-04-03-03: lender_match_id validated with .eq('client_id', client.id) — 404 if not owned by this client (IDOR prevention)
 *
 * Auth required.
 *
 * Body: { lender_match_id: string }
 *
 * Returns:
 *   201 { id: string, status: 'pending' }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { canRequestLenderIntro } from '@/lib/feature-gates'
import { logger } from '@/lib/logger'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // ── Resolve client record + tier ──────────────────────────────────────────
  const serviceClient = createServiceClient()

  const { data: client, error: clientError } = await serviceClient
    .from('clients')
    .select('id, subscription_tier')
    .eq('user_id', userId)
    .maybeSingle()

  if (clientError) {
    logger.error('lender-intro: failed to fetch client record', clientError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (!client) {
    return NextResponse.json({ error: 'Client profile not found' }, { status: 404 })
  }

  // ── Feature gate check (server-side — T-04-03-02) ─────────────────────────
  if (!canRequestLenderIntro(client.subscription_tier)) {
    return NextResponse.json(
      { error: 'Upgrade to Growth tier to request lender introductions' },
      { status: 403 }
    )
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const lenderMatchId =
    body !== null && typeof body === 'object' && 'lender_match_id' in body
      ? (body as Record<string, unknown>).lender_match_id
      : undefined

  if (!lenderMatchId || typeof lenderMatchId !== 'string' || !UUID_REGEX.test(lenderMatchId)) {
    return NextResponse.json(
      { error: 'lender_match_id must be a valid UUID' },
      { status: 400 }
    )
  }

  try {
    // ── Fetch lender_match (IDOR check — T-04-03-03) ──────────────────────────
    const { data: lenderMatch, error: matchError } = await serviceClient
      .from('lender_matches')
      .select('id, lender_id, lenders(name, email)')
      .eq('id', lenderMatchId)
      .eq('client_id', client.id)
      .maybeSingle()

    if (matchError) {
      logger.error('lender-intro: failed to fetch lender_match', matchError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!lenderMatch) {
      // 404 (not 403) — prevents enumeration of other clients' lender_match IDs
      return NextResponse.json({ error: 'Lender match not found' }, { status: 404 })
    }

    // ── Check for existing intro request for this lender ──────────────────────
    const { data: existingIntro } = await serviceClient
      .from('agent_emails')
      .select('id')
      .eq('client_id', client.id)
      .eq('email_type', 'lender_intro')
      .eq('requires_admin_approval', true)
      .maybeSingle()

    if (existingIntro) {
      return NextResponse.json(
        { error: 'Introduction already requested for this lender' },
        { status: 409 }
      )
    }

    // ── Resolve lender info from join ─────────────────────────────────────────
    const lenderData = Array.isArray(lenderMatch.lenders)
      ? lenderMatch.lenders[0]
      : lenderMatch.lenders

    const lenderName = (lenderData as { name?: string } | null)?.name ?? 'Lender'
    const lenderEmail = (lenderData as { email?: string } | null)?.email ?? 'admin@cosbycapital.com'

    // ── Insert agent_emails row ───────────────────────────────────────────────
    const { data: inserted, error: insertError } = await serviceClient
      .from('agent_emails')
      .insert({
        agent_name: 'capital-dashboard-client',
        client_id: client.id,
        email_type: 'lender_intro',
        to_email: lenderEmail,
        to_name: lenderName,
        subject: `Lender Introduction Request — ${lenderName}`,
        body_html:
          '<p>Client has requested a lender introduction. Admin review required.</p>',
        sent: false,
        requires_client_approval: false,
        requires_admin_approval: true,
        client_approved: false,
      })
      .select('id')
      .single()

    if (insertError) {
      logger.error('lender-intro: failed to insert agent_emails row', insertError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({ id: inserted.id, status: 'pending' }, { status: 201 })
  } catch (err) {
    logger.error('lender-intro: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
