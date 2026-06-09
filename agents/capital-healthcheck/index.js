'use strict'
require('dotenv').config()
const cron = require('node-cron')
const { getServiceClient } = require('../lib/supabase')
const { sendAlert } = require('../lib/telegram')
const logger = require('../lib/logger')
const { checkSupabase } = require('./checks/supabase')
const { checkAnthropicApi, checkEmailQueue, checkEnvVars } = require('./checks/services')
const { checkAgentHealth } = require('./checks/agents')

const AGENT_NAME = 'capital-healthcheck'

async function runHealthCheck() {
  const supabase = getServiceClient()
  const startMs = Date.now()
  logger.info(AGENT_NAME, 'Health check started')

  let allResults = []

  try {
    const [supabaseResults, anthropic, emailQueue, envVars, agentResults] = await Promise.allSettled([
      checkSupabase(),
      checkAnthropicApi(),
      checkEmailQueue(),
      checkEnvVars(),
      checkAgentHealth(),
    ])

    const collect = (r) =>
      Array.isArray(r.value)
        ? r.value
        : [r.value || { check: 'unknown', status: r.status === 'fulfilled' ? 'ok' : 'fail', error: r.reason?.message }]

    allResults = [
      ...collect(supabaseResults),
      collect(anthropic)[0],
      collect(emailQueue)[0],
      collect(envVars)[0],
      ...collect(agentResults),
    ]
  } catch (err) {
    logger.error(AGENT_NAME, 'Health check run failed', { error: err.message })
    allResults = [{ check: 'run_error', status: 'fail', error: err.message }]
  }

  // Write all results to platform_health_log
  const inserts = allResults.map((r) => ({
    check_type: r.check,
    service_name: r.check,
    status: r.status,
    error_details: r.error || null,
    alert_sent: false,
  }))

  await supabase.from('platform_health_log').insert(inserts).catch((e) =>
    logger.error(AGENT_NAME, 'Failed to write health log', { error: e.message })
  )

  // Alert on critical/fail
  const critical = allResults.filter((r) => r.status === 'fail' || r.status === 'critical')
  if (critical.length > 0) {
    const msg = `🚨 <b>Cosby Capital Health Alert</b>\n${critical.map((r) => `• ${r.check}: ${r.error}`).join('\n')}`
    await sendAlert(msg, 'error').catch((e) => logger.error(AGENT_NAME, 'Telegram alert failed', { error: e.message }))

    await supabase.from('platform_health_log')
      .update({ alert_sent: true })
      .in('check_type', critical.map((r) => r.check))
      .order('created_at', { ascending: false })
  }

  // Log to agent_logs
  await supabase.from('agent_logs').insert({
    agent_name: AGENT_NAME,
    action: 'health_check',
    result: JSON.stringify({
      total: allResults.length,
      ok: allResults.filter((r) => r.status === 'ok').length,
      issues: critical.length,
    }),
    duration_ms: Date.now() - startMs,
    error: critical.length > 0 ? `${critical.length} issues found` : null,
  })

  logger.info(AGENT_NAME, 'Health check complete', { total: allResults.length, issues: critical.length })
}

async function runDailyReport() {
  const supabase = getServiceClient()
  logger.info(AGENT_NAME, 'Daily report started')

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: issues } = await supabase
    .from('platform_health_log')
    .select('check_type, status, error_details, created_at')
    .neq('status', 'ok')
    .gte('created_at', yesterday)
    .order('created_at', { ascending: false })
    .limit(20)
    .catch(() => ({ data: [] }))

  const { count: totalClients } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .catch(() => ({ count: '?' }))

  const msg = `📊 <b>Cosby Capital Daily Health Report</b>\n${new Date().toUTCString()}\n\nClients: ${totalClients}\nIssues (24h): ${issues?.length || 0}\n${issues?.map((i) => `• ${i.check_type}: ${i.error_details || i.status}`).join('\n') || 'All systems OK ✅'}`
  await sendAlert(msg, 'info').catch((e) => logger.error(AGENT_NAME, 'Daily report alert failed', { error: e.message }))
}

// Every 15 minutes
cron.schedule('*/15 * * * *', runHealthCheck)

// Daily 5am UTC
cron.schedule('0 5 * * *', runDailyReport)

// Run immediately on startup
runHealthCheck().catch((e) => logger.error(AGENT_NAME, 'Startup health check failed', { error: e.message }))

logger.info(AGENT_NAME, 'capital-healthcheck started', { schedule: '*/15 * * * *' })
