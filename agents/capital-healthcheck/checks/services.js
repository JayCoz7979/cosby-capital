'use strict'
const https = require('https')
const { getServiceClient } = require('../../lib/supabase')

async function checkAnthropicApi() {
  return new Promise((resolve) => {
    const req = https.request(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'content-type': 'application/json',
        },
      },
      (res) => {
        // 400 = valid auth, bad request body = API is UP
        // 401 = API key issue
        if (res.statusCode === 400) resolve({ check: 'anthropic_api', status: 'ok' })
        else if (res.statusCode === 401) resolve({ check: 'anthropic_api', status: 'fail', error: 'Invalid API key' })
        else resolve({ check: 'anthropic_api', status: 'warn', error: `Unexpected status ${res.statusCode}` })
      }
    )
    req.on('error', (e) => resolve({ check: 'anthropic_api', status: 'fail', error: e.message }))
    req.write(JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1, messages: [] }))
    req.end()
  })
}

async function checkEmailQueue() {
  const supabase = getServiceClient()

  // Check for stuck emails (sent=false, not requiring approval, older than 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: stuckEmails } = await supabase
    .from('agent_emails')
    .select('*', { count: 'exact', head: true })
    .eq('sent', false)
    .eq('requires_client_approval', false)
    .eq('requires_admin_approval', false)
    .lt('created_at', oneHourAgo)
    .catch(() => ({ count: 0 }))

  return {
    check: 'email_queue',
    status: stuckEmails > 0 ? 'warn' : 'ok',
    error: stuckEmails > 0 ? `${stuckEmails} emails stuck in queue` : undefined,
  }
}

async function checkEnvVars() {
  const required = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY',
    'RESEND_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
    'TELEGRAM_SIGNING_SECRET', 'INTERNAL_SERVICE_SECRET',
  ]
  const missing = required.filter((k) => !process.env[k])
  return {
    check: 'env_vars',
    status: missing.length > 0 ? 'fail' : 'ok',
    error: missing.length > 0 ? `Missing: ${missing.join(', ')}` : undefined,
  }
}

module.exports = { checkAnthropicApi, checkEmailQueue, checkEnvVars }
