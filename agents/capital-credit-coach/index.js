'use strict'
require('dotenv').config()
const cron = require('node-cron')
const { z } = require('zod')
const { getServiceClient } = require('../lib/supabase')
const { logAndSend } = require('../lib/email')
const logger = require('../lib/logger')
const { generateCreditRoadmap } = require('./roadmap')

const AGENT_NAME = 'capital-credit-coach'

const PAID_TIERS = ['starter', 'growth', 'capital_partner', 'done_for_you']

const ClientSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string().min(1),
  owner_name: z.string().min(1),
  email: z.string().email(),
  industry: z.string().nullable(),
  credit_score_range: z.string().nullable(),
  subscription_tier: z.string(),
  subscription_status: z.string(),
  onboarding_completed: z.boolean(),
  annual_revenue: z.number().nullable(),
  years_in_business: z.number().nullable(),
  has_existing_debt: z.boolean(),
  existing_debt_amount: z.number().nullable(),
})

async function runForClient(clientId, triggerType = 'signup') {
  const supabase = getServiceClient()
  const startMs = Date.now()

  const { data: rawClient, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (clientErr || !rawClient) throw new Error(`Client ${clientId} not found`)

  const client = ClientSchema.parse(rawClient)

  // Credit coach runs for all paid tiers with active subscriptions
  if (!PAID_TIERS.includes(client.subscription_tier) || client.subscription_status !== 'active') {
    logger.info(AGENT_NAME, 'Skipping — not a paid active client', {
      clientId,
      tier: client.subscription_tier,
      status: client.subscription_status,
    })
    return
  }

  if (!client.onboarding_completed) {
    logger.info(AGENT_NAME, 'Skipping — onboarding not complete', { clientId })
    return
  }

  // Idempotency check — skip if roadmap already exists for this client
  const existingRoadmap = await supabase
    .from('credit_roadmaps')
    .select('id, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .then((res) => res.data)
    .catch(() => null)

  if (existingRoadmap) {
    logger.info(AGENT_NAME, 'Roadmap already exists — skipping (idempotent)', {
      clientId,
      roadmapId: existingRoadmap.id,
    })
    return
  }

  logger.info(AGENT_NAME, 'Generating credit roadmap', { clientId, triggerType })

  const roadmap = await generateCreditRoadmap(client)

  if (!roadmap) {
    logger.warn(AGENT_NAME, 'Roadmap generation returned null', { clientId })
    await supabase.from('agent_logs').insert({
      agent_name: AGENT_NAME,
      client_id: clientId,
      action: 'credit_roadmap_run',
      result: 'null_response',
      duration_ms: Date.now() - startMs,
    })
    return
  }

  // Save roadmap to DB — steps is jsonb, agent_summary = current_score_context
  const { data: savedRoadmap, error: saveErr } = await supabase
    .from('credit_roadmaps')
    .insert({
      client_id: clientId,
      current_score_range: client.credit_score_range,
      target_score: roadmap.target_score || 700,
      steps: roadmap.steps,
      agent_summary: roadmap.current_score_context,
      last_updated_by: AGENT_NAME,
    })
    .select()
    .single()

  if (saveErr) throw new Error(`Failed to save roadmap: ${saveErr.message}`)

  // Build email body with educational disclaimer (required)
  const firstStep = roadmap.steps?.[0]
  const quickWins = roadmap.quick_wins || []

  const bodyHtml = `
<p>Hi ${client.owner_name},</p>
<p>Your personalized <strong>Business Credit Roadmap</strong> is ready in your Cosby Capital dashboard.</p>
<p>${roadmap.current_score_context || "Based on your current credit profile, here's your path to stronger business credit."}</p>
${firstStep ? `<p><strong>Your first step:</strong> ${firstStep.title} — ${firstStep.description}</p>` : ''}
${
  quickWins.length > 0
    ? `<p><strong>Quick wins (30 days or less):</strong></p><ul>${quickWins.map((w) => `<li>${w}</li>`).join('')}</ul>`
    : ''
}
<p>Your roadmap includes 6 steps with specific actions and the credit score thresholds that unlock new funding opportunities on your dashboard.</p>
<p><a href="https://cosbycapital.com/dashboard/credit" style="background:#0A1628;color:#C9A84C;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;margin:16px 0">View My Credit Roadmap &rarr;</a></p>
<p style="font-size:12px;color:#666;border-top:1px solid #eee;padding-top:16px;margin-top:24px">
  <em>These are educational recommendations. Cosby Capital does not take action on your behalf for credit repair.
  For credit repair services, consult a licensed credit counselor. Credit improvement timelines vary based on
  individual circumstances. This is not a guarantee of any specific outcome.</em>
</p>`

  await logAndSend(supabase, {
    agentName: AGENT_NAME,
    clientId: client.id,
    emailType: 'credit_roadmap_ready',
    toEmail: client.email,
    toName: client.owner_name,
    subject: 'Your Business Credit Roadmap is ready',
    bodyHtml,
    requiresClientApproval: false,
  })

  // Compliance log — every roadmap email must be logged with contained_loan_terms = false
  await supabase
    .from('compliance_log')
    .insert({
      agent_name: AGENT_NAME,
      client_id: clientId,
      communication_type: 'credit_roadmap_email',
      recipient_email: client.email,
      subject: 'Credit roadmap ready',
      content_summary: `Sent educational credit roadmap — ${roadmap.steps?.length || 0} steps, ${roadmap.estimated_timeline_months || '?'} month timeline`,
      contained_loan_terms: false,
    })
    .catch((e) => logger.warn(AGENT_NAME, 'Compliance log insert failed', { error: e.message }))

  // Agent run log
  await supabase.from('agent_logs').insert({
    agent_name: AGENT_NAME,
    client_id: clientId,
    action: 'credit_roadmap_run',
    result: JSON.stringify({
      roadmap_id: savedRoadmap.id,
      steps: roadmap.steps?.length,
      trigger: triggerType,
    }),
    duration_ms: Date.now() - startMs,
  })

  logger.info(AGENT_NAME, 'Credit roadmap generated and sent', {
    clientId,
    roadmapId: savedRoadmap.id,
    steps: roadmap.steps?.length,
    timelineMonths: roadmap.estimated_timeline_months,
  })
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

  logger.info(AGENT_NAME, `Processing ${triggers.length} trigger(s)`)

  for (const trigger of triggers) {
    try {
      await supabase
        .from('agent_trigger_queue')
        .update({ status: 'processing' })
        .eq('id', trigger.id)

      await runForClient(trigger.client_id, trigger.trigger_type)

      await supabase
        .from('agent_trigger_queue')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('id', trigger.id)
    } catch (err) {
      logger.error(AGENT_NAME, 'Trigger processing error', {
        triggerId: trigger.id,
        clientId: trigger.client_id,
        error: err.message,
      })
      const retries = (trigger.retry_count || 0) + 1
      await supabase
        .from('agent_trigger_queue')
        .update({
          status: retries >= 3 ? 'failed' : 'pending',
          retry_count: retries,
          error: err.message,
        })
        .eq('id', trigger.id)
    }
  }
}

// Poll trigger queue every 5 minutes — signup-triggered only, no weekly cron
cron.schedule('*/5 * * * *', processTriggerQueue)

// Run once immediately on startup to catch any pending triggers
processTriggerQueue().catch((e) =>
  logger.error(AGENT_NAME, 'Startup trigger poll failed', { error: e.message })
)

logger.info(AGENT_NAME, 'capital-credit-coach started', {
  schedule: 'trigger queue poll every 5min (signup-based)',
  paidTiers: PAID_TIERS,
})
