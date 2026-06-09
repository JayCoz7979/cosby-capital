'use strict'
const { createMessage } = require('../lib/anthropic')
const { sanitizeForPrompt, scanOutputConfidentiality } = require('../lib/sanitize')
const { CircuitBreaker } = require('../lib/circuit-breaker')
const logger = require('../lib/logger')

const AGENT_NAME = 'capital-grant-finder'
const breaker = new CircuitBreaker({ threshold: 3, resetTimeoutMs: 120000 })

async function generateMatchReasons(client, topMatches) {
  // Only generate reasons for top 10 matches
  const top10 = topMatches.slice(0, 10)

  const matchList = top10.map((m, i) =>
    `${i + 1}. ${m.grant.name} (${m.grant.grantor}) — Score: ${m.score} — Max: $${m.grant.max_award_amount?.toLocaleString() || 'varies'}`
  ).join('\n')

  // All client data wrapped in XML delimiters (S10-002)
  const safeBusinessName = sanitizeForPrompt(client.business_name)
  const safeIndustry = sanitizeForPrompt(client.industry)
  const safeState = sanitizeForPrompt(client.state)
  const safeBusinessType = sanitizeForPrompt(client.business_type)
  const safeFlags = sanitizeForPrompt([
    client.is_minority_owned && 'minority-owned',
    client.is_woman_owned && 'woman-owned',
    client.is_veteran_owned && 'veteran-owned',
    client.is_nonprofit && 'nonprofit',
    client.is_rural_business && 'rural',
  ].filter(Boolean).join(', ') || 'none')

  const systemPrompt = `You are a grant research specialist helping small businesses find funding.
Your role is STRICTLY EDUCATIONAL. You explain grant eligibility and match quality.
CRITICAL RULES — violation results in immediate termination of this agent:
1. NEVER mention interest rates, APR, loan terms, points, or any loan pricing in any form
2. NEVER make guarantees about award likelihood
3. Use professional, encouraging, factual language only
4. Each reason must be 1-2 sentences maximum
5. Focus on eligibility fit, not financial projections`

  const userPrompt = `Client profile:
Business name: ${safeBusinessName}
Industry: ${safeIndustry}
State: ${safeState}
Business type: ${safeBusinessType}
Special qualifications: ${safeFlags}

Top grant matches:
${matchList}

For each grant, write one brief reason why this client is a strong match. Focus on eligibility criteria (location, business type, size, special status). Keep each reason under 2 sentences. Return as JSON array: [{"grant_name": "...", "reason": "..."}]`

  const response = await breaker.call(() => createMessage({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
  }))

  const rawText = response.content[0]?.text || '[]'

  // CRITICAL: Scan for loan terms before using output (S14-002)
  const scan = scanOutputConfidentiality(rawText)
  if (!scan.safe) {
    logger.error(AGENT_NAME, 'LOAN TERMS DETECTED in Claude output — aborting', { flags: scan.flags })
    throw new Error('Output failed confidentiality scan — loan terms detected')
  }

  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : []
  } catch {
    logger.warn(AGENT_NAME, 'Failed to parse match reasons JSON', { raw: rawText.slice(0, 200) })
    return []
  }
}

module.exports = { generateMatchReasons }
