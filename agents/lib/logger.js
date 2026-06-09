'use strict'
// S10-001: redact PII from all log output

const REDACT_PATTERNS = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: '[SSN_REDACTED]' },
  { pattern: /\b\d{2}-\d{7}\b/g, label: '[EIN_REDACTED]' },
  { pattern: /\b\d{13,19}\b/g, label: '[CARD_REDACTED]' },
  { pattern: /sk-ant-api[^\s]*/g, label: '[API_KEY_REDACTED]' },
  { pattern: /eyJ[a-zA-Z0-9+/=]{40,}/g, label: '[JWT_REDACTED]' },
]

function sanitizeForLog(value) {
  if (!value) return value
  let str = typeof value === 'string' ? value : JSON.stringify(value)
  for (const { pattern, label } of REDACT_PATTERNS) {
    str = str.replace(pattern, label)
  }
  return str
}

function log(agentName, level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    agent: agentName,
    level,
    msg: sanitizeForLog(message),
    ...Object.fromEntries(
      Object.entries(meta).map(([k, v]) => [k, sanitizeForLog(v)])
    ),
  }
  // Railway logs stdout as structured JSON
  console.log(JSON.stringify(entry))
}

module.exports = {
  sanitizeForLog,
  info: (agent, msg, meta) => log(agent, 'info', msg, meta),
  warn: (agent, msg, meta) => log(agent, 'warn', msg, meta),
  error: (agent, msg, meta) => log(agent, 'error', msg, meta),
}
