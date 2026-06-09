'use strict'
const { getServiceClient } = require('../../lib/supabase')

// Agents with their expected max interval between runs (ms)
const AGENT_SCHEDULES = {
  'capital-grant-finder': 7 * 24 * 60 * 60 * 1000,    // weekly
  'capital-lender-matcher': 7 * 24 * 60 * 60 * 1000,   // weekly
  'capital-credit-coach': 7 * 24 * 60 * 60 * 1000,     // weekly (on signup)
}

async function checkAgentHealth() {
  const supabase = getServiceClient()
  const results = []

  for (const [agentName, maxIntervalMs] of Object.entries(AGENT_SCHEDULES)) {
    const { data: lastRun } = await supabase
      .from('agent_logs')
      .select('created_at, error')
      .eq('agent_name', agentName)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .catch(() => ({ data: null }))

    if (!lastRun) {
      // Agent has never run — only warn if it's been > 24 hours since deploy
      results.push({ check: `agent_${agentName}`, status: 'warn', error: 'Never run' })
      continue
    }

    const lastRunAge = Date.now() - new Date(lastRun.created_at).getTime()

    if (lastRun.error) {
      results.push({ check: `agent_${agentName}`, status: 'warn', error: `Last run had error: ${lastRun.error}` })
    } else if (lastRunAge > maxIntervalMs * 1.5) {
      results.push({ check: `agent_${agentName}`, status: 'warn', error: `Overdue — last run ${Math.round(lastRunAge / 3600000)}h ago` })
    } else {
      results.push({ check: `agent_${agentName}`, status: 'ok' })
    }
  }

  return results
}

module.exports = { checkAgentHealth }
