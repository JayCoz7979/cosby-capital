'use strict'
require('dotenv').config()
const cron = require('node-cron')
const { z } = require('zod')
const { getServiceClient } = require('../lib/supabase')
const { logAndSend } = require('../lib/email')
const logger = require('../lib/logger')
const { scoreLendersForClient } = require('./score')
const { generateLenderMatchReasons } = require('./match-reasons')

const AGENT_NAME = 'capital-lender-matcher'

const ClientSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string().min(1),
  owner_name: z.string().min(1),
  email: z.string().email(),
  industry: z.string().nullable(),
  state: z.string().nullable(),
  business_type: z.string().nullable(),
  funding_goal: z.number().nullable(),
  credit_score_range: z.string().nullable(),
  subscription_tier: z.string(),
  subscription_status: z.string(),
  onboarding_completed: z.boolean(),
  is_minority_owned: z.boolean(),
  is_woman_owned: z.boolean(),
  is_veteran_owned: z.boolean(),
  is_nonprofit: z.boolean(),
  is_rural_business: z.boolean(),
  years_in_business: z.number().nullable(),
  annual_revenue: z.number().nullable(),
})

async function runForClient(clientId, triggerType = 'scheduled') {
  const supabase = getServiceClient()
  const startMs = Date.now()

  const { data: rawClient, error: clientErr } = await supabase
    .from('clients').select('*').eq('id', clientId).single()

  if (clientErr || !rawClient) throw new Error(`Client ${clientId} not found`)

  const client = ClientSchema.parse(rawClient)

  if (client.subscription_status !== 'active' || !client.onboarding_completed) {
    logger.info(AGENT_NAME, 'Skipping — client not active/complete', { clientId })
    return
  }

  const scoredMatches = await scoreLendersForClient(clientId)

  if (scoredMatches.length === 0) {
    logger.info(AGENT_NAME, 'No lender matches above threshold', { clientId })
    await supabase.from('agent_logs').insert({
      agent_name: AGENT_NAME,
      client_id: clientId,
      action: 'lender_matcher_run',
      result: 'no_matches',
      duration_ms: Date.now() - startMs,
    })
    return
  }

  // Upsert lender_matches
  const upserts = scoredMatches.map((m) => ({
    client_id: clientId,
    lender_id: m.lender.id,
    match_score: m.score,
    status: 'new',
  }))

  await supabase.from('lender_matches').upsert(upserts, { onConflict: 'client_id,lender_id', ignoreDuplicates: false })

  // Generate reasons for top 10
  try {
    const reasons = await generateLenderMatchReasons(client, scoredMatches)
    for (const r of reasons) {
      const match = scoredMatches.find((m) => m.lender.name === r.lender_name)
      if (match) {
        await supabase.from('lender_matches')
          .update({ match_reasons: [r.reason] })
          .eq('client_id', clientId)
          .eq('lender_id', match.lender.id)
      }
    }
  } catch (err) {
    logger.warn(AGENT_NAME, 'Match reasons generation failed', { clientId, error: err.message })
  }

  // Email the client (FTC disclosure + disclaimer required)
  const top5 = scoredMatches.slice(0, 5)
  const lenderLines = top5.map((m) =>
    `<li><strong>${m.lender.name}</strong> — ${m.lender.lender_type} — ${m.lender.loan_types?.slice(0, 2).join(', ')}</li>`
  ).join('\n')

  const bodyHtml = `
<p>Hi ${client.owner_name},</p>
<p>Cosby Capital has identified <strong>${scoredMatches.length} potential funding sources</strong> for ${client.business_name} based on your business profile.</p>
<p>Your top matches:</p>
<ul>
${lenderLines}
</ul>
<p>Log in to your dashboard to view all matches and request introductions.</p>
<p><a href="https://cosbycapital.com/dashboard/lenders" style="background:#0A1628;color:#C9A84C;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;margin:16px 0">View My Lender Matches &rarr;</a></p>
<p style="font-size:12px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px">
  <strong>Disclosure:</strong> Cosby Capital may receive compensation when clients are connected to lenders through our platform.
  This is a research and introduction service only. We do not negotiate loan terms, rates, or conditions on your behalf.
  All lending decisions are made solely by the lender based on their own underwriting criteria.
</p>`

  await logAndSend(supabase, {
    agentName: AGENT_NAME,
    clientId: client.id,
    emailType: 'lender_matches_ready',
    toEmail: client.email,
    toName: client.owner_name,
    subject: `Your funding matches are ready — ${scoredMatches.length} sources found`,
    bodyHtml,
    requiresClientApproval: false,
  })

  // Compliance log
  await supabase.from('compliance_log').insert({
    agent_name: AGENT_NAME,
    client_id: clientId,
    communication_type: 'lender_match_email',
    recipient_email: client.email,
    subject: `Lender matches ready`,
    content_summary: `Notified client of ${scoredMatches.length} lender matches with FTC disclosure`,
    contained_loan_terms: false,
  }).catch((e) => logger.warn(AGENT_NAME, 'Compliance log failed', { error: e.message }))

  await supabase.from('agent_logs').insert({
    agent_name: AGENT_NAME,
    client_id: clientId,
    action: 'lender_matcher_run',
    result: JSON.stringify({ matches: scoredMatches.length, trigger: triggerType }),
    duration_ms: Date.now() - startMs,
  })

  logger.info(AGENT_NAME, 'Run complete', { clientId, matches: scoredMatches.length })
}

async function runAllClients() {
  const supabase = getServiceClient()
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id')
    .eq('subscription_status', 'active')
    .eq('onboarding_completed', true)
  if (error) throw new Error(`Failed to fetch clients: ${error.message}`)
  for (const { id } of clients || []) {
    await runForClient(id, 'scheduled').catch((err) =>
      logger.error(AGENT_NAME, 'Client run failed', { clientId: id, error: err.message })
    )
  }
}

async function processTriggerQueue() {
  const supabase = getServiceClient()
  const { data: triggers } = await supabase
    .from('agent_trigger_queue')
    .select('*')
    .eq('agent_name', AGENT_NAME)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)
  if (!triggers?.length) return
  for (const trigger of triggers) {
    try {
      await supabase.from('agent_trigger_queue').update({ status: 'processing' }).eq('id', trigger.id)
      await runForClient(trigger.client_id, trigger.trigger_type)
      await supabase.from('agent_trigger_queue').update({
        status: 'done',
        processed_at: new Date().toISOString(),
      }).eq('id', trigger.id)
    } catch (err) {
      const retries = (trigger.retry_count || 0) + 1
      await supabase.from('agent_trigger_queue').update({
        status: retries >= 3 ? 'failed' : 'pending',
        retry_count: retries,
        error: err.message,
      }).eq('id', trigger.id)
    }
  }
}

// Monday 6am UTC
cron.schedule('0 6 * * 1', runAllClients)

// Poll trigger queue every 5 minutes
cron.schedule('*/5 * * * *', processTriggerQueue)

processTriggerQueue().catch((e) =>
  logger.error(AGENT_NAME, 'Startup trigger poll failed', { error: e.message })
)

logger.info(AGENT_NAME, 'capital-lender-matcher started', {
  schedule: 'Monday 6am UTC + trigger queue every 5min',
})
