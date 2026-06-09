'use strict'
const { createMessage } = require('../lib/anthropic')
const { sanitizeForPrompt, scanOutputConfidentiality } = require('../lib/sanitize')
const { CircuitBreaker } = require('../lib/circuit-breaker')
const { sendAlert } = require('../lib/telegram')
const logger = require('../lib/logger')

const AGENT_NAME = 'capital-lender-matcher'
const breaker = new CircuitBreaker({ threshold: 3, resetTimeoutMs: 120000 })

async function generateLenderMatchReasons(client, topMatches) {
  const top10 = topMatches.slice(0, 10)

  const matchList = top10.map((m, i) =>
    `${i + 1}. ${m.lender.name} (${m.lender.lender_type}) — Score: ${m.score} — Types: ${m.lender.loan_types?.join(', ')}`
  ).join('\n')

  const safeBusinessName = sanitizeForPrompt(client.business_name)
  const safeIndustry = sanitizeForPrompt(client.industry)
  const safeState = sanitizeForPrompt(client.state)
  const safeBusinessType = sanitizeForPrompt(client.business_type)
  const safeFundingGoal = sanitizeForPrompt(client.funding_goal ? `$${client.funding_goal.toLocaleString()}` : 'not specified')
  const safeFlags = sanitizeForPrompt([
    client.is_minority_owned && 'minority-owned',
    client.is_woman_owned && 'woman-owned',
    client.is_veteran_owned && 'veteran-owned',
    client.is_nonprofit && 'nonprofit',
    client.is_rural_business && 'rural',
  ].filter(Boolean).join(', ') || 'none')

  const systemPrompt = `You are a business funding research specialist.
Your role is STRICTLY to explain why a lender is a potential match based on eligibility criteria.
ABSOLUTE PROHIBITIONS — any violation causes immediate system shutdown:
1. NEVER mention interest rates, APR, annual percentage rates, loan rates, points, pricing, or any rate
2. NEVER mention specific loan terms (duration, payment schedule, rate type)
3. NEVER make any guarantees or predictions about approval likelihood
4. NEVER include any financial metrics that could be construed as a loan term
5. ONLY discuss: lender type, loan product types, geographic coverage, special programs, business size fit
Keep each match reason to 1-2 factual sentences about eligibility fit only.`

  const userPrompt = `Client profile:
Business: ${safeBusinessName}
Industry: ${safeIndustry}
State: ${safeState}
Type: ${safeBusinessType}
Funding need: ${safeFundingGoal}
Qualifications: ${safeFlags}

Top lender matches:
${matchList}

For each lender, write one brief reason (1-2 sentences) explaining the eligibility fit — lender type alignment, geographic match, special program availability, or loan product fit. Return as JSON array: [{"lender_name": "...", "reason": "..."}]`

  const response = await breaker.call(() => createMessage({
    systemPrompt,
    userPrompt,
    maxTokens: 1024,
  }))

  const rawText = response.content[0]?.text || '[]'

  // CRITICAL: Scan for loan terms (S14-002) — zero tolerance
  const scan = scanOutputConfidentiality(rawText)
  if (!scan.safe) {
    const alertMsg = `LOAN TERMS DETECTED in capital-lender-matcher output — ABORTED\nFlags: ${JSON.stringify(scan.flags)}`
    await sendAlert(alertMsg, 'error').catch(() => {})
    logger.error(AGENT_NAME, 'CRITICAL: Loan terms in Claude output — aborted', { flags: scan.flags })
    throw new Error('Output failed loan terms scan — communication blocked')
  }

  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : []
  } catch {
    logger.warn(AGENT_NAME, 'Failed to parse match reasons', { raw: rawText.slice(0, 200) })
    return []
  }
}

module.exports = { generateLenderMatchReasons }
