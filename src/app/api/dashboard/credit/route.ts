/**
 * GET /api/dashboard/credit — fetch credit roadmap for the current client
 *
 * Returns the most recent credit_roadmap row for the authenticated client.
 * Returns { roadmap: null } if no roadmap has been generated yet.
 *
 * Auth required.
 *
 * Threat mitigations:
 *   T-04-05-04 — Data scoped to client_id from auth.uid(); RLS on credit_roadmaps provides defense-in-depth
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
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
      .select('id, subscription_tier, credit_score_range')
      .eq('user_id', userId)
      .maybeSingle()

    if (clientError) {
      logger.error('credit GET: failed to fetch client record', clientError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // ── Query credit roadmap ─────────────────────────────────────────────────
    const { data: roadmap, error: roadmapError } = await serviceClient
      .from('credit_roadmaps')
      .select(
        'id, current_score_range, target_score, target_date, steps, agent_summary, updated_at'
      )
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (roadmapError) {
      logger.error('credit GET: failed to query credit_roadmaps', roadmapError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({
      roadmap: roadmap ?? null,
      credit_score_range: client.credit_score_range ?? null,
    })
  } catch (err) {
    logger.error('credit GET: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
