'use strict'
const { getServiceClient } = require('../lib/supabase')
const logger = require('../lib/logger')

const AGENT_NAME = 'capital-lender-matcher'
const SCORE_THRESHOLD = 40

async function scoreLendersForClient(clientId) {
  const supabase = getServiceClient()

  const { data: lenders, error: lenderErr } = await supabase
    .from('lenders')
    .select('id, name, lender_type, description, national, states_served, min_loan_amount, max_loan_amount, loan_types, minority_programs, women_programs, veteran_programs, rural_programs, nonprofit_eligible')
    .eq('is_active', true)

  if (lenderErr) throw new Error(`Failed to fetch lenders: ${lenderErr.message}`)
  if (!lenders || lenders.length === 0) return []

  const scoredMatches = []

  for (const lender of lenders) {
    const { data: scoreResult, error: scoreErr } = await supabase
      .rpc('score_lender_match', { p_client_id: clientId, p_lender_id: lender.id })

    if (scoreErr) {
      logger.warn(AGENT_NAME, 'Score error', { lenderId: lender.id, error: scoreErr.message })
      continue
    }

    const score = scoreResult || 0
    if (score >= SCORE_THRESHOLD) {
      scoredMatches.push({ lender, score })
    }
  }

  return scoredMatches.sort((a, b) => b.score - a.score)
}

module.exports = { scoreLendersForClient }
