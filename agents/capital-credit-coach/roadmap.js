'use strict'
const { createMessage } = require('../lib/anthropic')
const { sanitizeForPrompt, scanOutputConfidentiality } = require('../lib/sanitize')
const { CircuitBreaker } = require('../lib/circuit-breaker')
const { sendAlert } = require('../lib/telegram')
const logger = require('../lib/logger')

const AGENT_NAME = 'capital-credit-coach'
const breaker = new CircuitBreaker({ threshold: 3, resetTimeoutMs: 120000 })

// Credit score thresholds that unlock lender tiers
const SCORE_THRESHOLDS = {
  580: 'Microloan lenders and CDFIs (SBA Microloans, Accion, LiftFund)',
  600: 'Online lenders (Fundbox, Credibly, Kabbage)',
  625: 'SBA-preferred lenders (OnDeck, Bluevine)',
  650: 'SBA 7(a) program eligibility',
  700: 'Traditional bank loans and best SBA terms',
}

async function generateCreditRoadmap(client) {
  const safeBusinessName = sanitizeForPrompt(client.business_name)
  const safeCreditRange = sanitizeForPrompt(client.credit_score_range || 'unknown')
  const safeIndustry = sanitizeForPrompt(client.industry || 'general business')
  const safeRevenue = sanitizeForPrompt(
    client.annual_revenue ? `$${client.annual_revenue.toLocaleString()}` : 'not provided'
  )
  const safeYears = sanitizeForPrompt(client.years_in_business?.toString() || 'unknown')
  const safeDebt = sanitizeForPrompt(
    client.has_existing_debt
      ? `Yes, approximately $${client.existing_debt_amount?.toLocaleString() || 'unknown'}`
      : 'No existing debt'
  )

  const thresholdList = Object.entries(SCORE_THRESHOLDS)
    .map(([score, unlocks]) => `- Score ${score}+: ${unlocks}`)
    .join('\n')

  const systemPrompt = `You are a business credit education specialist helping entrepreneurs understand how to build business credit.
Your advice is STRICTLY EDUCATIONAL. The client will take these steps themselves.
You are NOT providing credit repair services. You are NOT a licensed financial advisor.
RULES:
1. Never mention specific interest rates, APR, loan rates, or points
2. Never guarantee outcomes or approval chances
3. Never suggest disputing accurate information
4. Focus on credit-building actions: payment history, utilization, age of accounts, trade lines
5. Be specific, actionable, and encouraging
6. Reference the score thresholds provided — they are accurate for this platform's lender database`

  const userPrompt = `Business profile:
Business: ${safeBusinessName}
Current credit range: ${safeCreditRange}
Industry: ${safeIndustry}
Annual revenue: ${safeRevenue}
Years in business: ${safeYears}
Existing debt: ${safeDebt}

Lender unlock thresholds on this platform:
${thresholdList}

Generate a personalized 6-step credit improvement roadmap. For each step:
- Give a specific, actionable title
- Provide 2-3 sentences of guidance
- Include an estimated timeframe
- Note which lender tier they unlock when this step improves their score

Return as JSON:
{
  "current_score_context": "brief assessment of their current position",
  "target_score": 700,
  "estimated_timeline_months": <number>,
  "steps": [
    {
      "step": 1,
      "title": "...",
      "description": "...",
      "timeframe": "...",
      "milestone": "score improvement target or lender tier unlocked"
    }
  ],
  "quick_wins": ["action that could improve score in 30 days or less"]
}`

  const response = await breaker.call(() =>
    createMessage({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
    })
  )

  const rawText = response.content[0]?.text || '{}'

  // Scan output (S14-002)
  const scan = scanOutputConfidentiality(rawText)
  if (!scan.safe) {
    await sendAlert(
      `capital-credit-coach: Loan terms detected in output — ABORTED\nFlags: ${JSON.stringify(scan.flags)}`,
      'error'
    ).catch(() => {})
    logger.error(AGENT_NAME, 'CRITICAL: Loan terms in credit roadmap output', { flags: scan.flags })
    throw new Error('Credit roadmap output failed confidentiality scan')
  }

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null
  } catch {
    logger.warn(AGENT_NAME, 'Failed to parse roadmap JSON', { raw: rawText.slice(0, 200) })
    return null
  }
}

module.exports = { generateCreditRoadmap, SCORE_THRESHOLDS }
