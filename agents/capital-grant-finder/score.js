'use strict'
const { getServiceClient } = require('../lib/supabase')
const logger = require('../lib/logger')

const AGENT_NAME = 'capital-grant-finder'
const SCORE_THRESHOLD = 35

async function scoreGrantsForClient(clientId) {
  const supabase = getServiceClient()

  // Get all active grants
  const { data: grants, error: grantErr } = await supabase
    .from('grants')
    .select('id, name, grantor, max_award_amount, available_to_tiers')
    .eq('is_active', true)

  if (grantErr) throw new Error(`Failed to fetch grants: ${grantErr.message}`)
  if (!grants || grants.length === 0) return []

  // Get client subscription tier for tier filtering
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('subscription_tier')
    .eq('id', clientId)
    .single()

  if (clientErr) throw new Error(`Client not found: ${clientErr.message}`)

  const scoredMatches = []

  for (const grant of grants) {
    // Skip if grant not available to client's tier
    if (grant.available_to_tiers && !grant.available_to_tiers.includes(client.subscription_tier)) {
      continue
    }

    // Use DB function for scoring (keeps scoring logic in DB, not agent)
    const { data: scoreResult, error: scoreErr } = await supabase
      .rpc('score_grant_match', { p_client_id: clientId, p_grant_id: grant.id })

    if (scoreErr) {
      logger.warn(AGENT_NAME, 'Score error', { grantId: grant.id, error: scoreErr.message })
      continue
    }

    const score = scoreResult || 0
    if (score >= SCORE_THRESHOLD) {
      scoredMatches.push({ grant, score })
    }
  }

  // Sort by score desc
  return scoredMatches.sort((a, b) => b.score - a.score)
}

module.exports = { scoreGrantsForClient }
