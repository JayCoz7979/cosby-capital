/**
 * GET /api/dashboard/grants
 *
 * Returns grant matches for the authenticated client, sorted by match_score descending.
 * Supports pagination (10/page) and optional grantor_type filter.
 *
 * Threat mitigations:
 *   T-04-03-01: client_id derived from auth.uid() only — never from request body
 *   T-04-03-04: all queries scoped to client_id resolved from auth.uid()
 *
 * Auth required.
 *
 * Query params:
 *   type    — grantor_type filter (optional; 'all' or specific type like 'federal', 'state', 'SBIR')
 *   sort    — 'score_desc' (default) | 'score_asc' | 'created_desc'
 *   page    — 0-based page index (default 0)
 *
 * Returns:
 *   { matches: [...], total_count: number, page: number, per_page: 10 }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase'
import { logger } from '@/lib/logger'

const PER_PAGE = 10

export async function GET(request: NextRequest): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // ── Resolve client record ─────────────────────────────────────────────────
  const serviceClient = createServiceClient()

  const { data: client, error: clientError } = await serviceClient
    .from('clients')
    .select('id, subscription_tier')
    .eq('user_id', userId)
    .maybeSingle()

  if (clientError) {
    logger.error('grants: failed to fetch client record', clientError)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (!client) {
    return NextResponse.json({ error: 'Client profile not found' }, { status: 404 })
  }

  // ── Parse query params ────────────────────────────────────────────────────
  const { searchParams } = request.nextUrl
  const typeParam = searchParams.get('type') ?? 'all'
  const sortParam = searchParams.get('sort') ?? 'score_desc'
  const pageParam = parseInt(searchParams.get('page') ?? '0', 10)
  const page = isNaN(pageParam) || pageParam < 0 ? 0 : pageParam

  const rangeFrom = page * PER_PAGE
  const rangeTo = rangeFrom + PER_PAGE - 1

  // ── Sort order ────────────────────────────────────────────────────────────
  const ascending = sortParam === 'score_asc'
  const orderColumn = sortParam === 'created_desc' ? 'created_at' : 'match_score'

  // ── Build grant_matches query ─────────────────────────────────────────────
  try {
    let query = serviceClient
      .from('grant_matches')
      .select(
        'id, match_score, match_reasons, eligibility_flags, status, recommended_action, grants!inner(id, name, grantor, grantor_type, description, min_award_amount, max_award_amount, application_deadline, source_url)',
        { count: 'exact' }
      )
      .eq('client_id', client.id)
      .order(orderColumn, { ascending })
      .range(rangeFrom, rangeTo)

    // Apply grantor_type filter when not 'all'.
    // !inner join ensures rows without a matching grant are excluded.
    // .eq() on the joined table works correctly with an inner join (CR-04).
    if (typeParam && typeParam !== 'all') {
      query = query.eq('grants.grantor_type', typeParam)
    }

    const { data: matches, error: matchesError, count } = await query

    if (matchesError) {
      logger.error('grants: failed to fetch grant_matches', matchesError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    return NextResponse.json({
      matches: matches ?? [],
      total_count: count ?? 0,
      page,
      per_page: PER_PAGE,
    })
  } catch (err) {
    logger.error('grants: unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
