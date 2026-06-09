'use strict'
// S10-002: wraps ALL user-supplied data in XML delimiters before including in prompts
// This prevents prompt injection by making user content structurally distinct

const LOAN_TERM_PATTERNS = [
  /\b\d+(\.\d+)?%\s*(APR|interest|annual|rate)/i,
  /\b(APR|annual percentage rate|interest rate)\b/i,
  /\bpoints?\b/i,
  /\b\d+(\.\d+)?\s*points?\s*(origination|discount)/i,
]

function sanitizeForPrompt(value) {
  if (value === null || value === undefined) return '<user_content></user_content>'
  const str = String(value)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
  return `<user_content>${str}</user_content>`
}

function scanOutputConfidentiality(text) {
  if (!text || typeof text !== 'string') return { safe: true, flags: [] }
  const flags = []

  // Check for loan terms (zero tolerance)
  for (const pattern of LOAN_TERM_PATTERNS) {
    if (pattern.test(text)) {
      flags.push({ type: 'loan_term', pattern: pattern.toString(), matched: text.match(pattern)?.[0] })
    }
  }

  // Check for SSN patterns
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) flags.push({ type: 'ssn' })

  // Check for EIN patterns
  if (/\b\d{2}-\d{7}\b/.test(text)) flags.push({ type: 'ein' })

  // Check for credit score leak
  if (/\bcredit score[:\s]+\d{3}\b/i.test(text)) flags.push({ type: 'credit_score' })

  return { safe: flags.length === 0, flags }
}

module.exports = { sanitizeForPrompt, scanOutputConfidentiality }
