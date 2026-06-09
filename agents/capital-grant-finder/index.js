'use strict'
require('dotenv').config()
const cron = require('node-cron')
const { z } = require('zod')
const { getServiceClient } = require('../lib/supabase')
const { sendAlert } = require('../lib/telegram')
const logger = require('../lib/logger')
const { scoreGrantsForClient } = require('./score')
const { generateMatchReasons } = require('./match-reasons')
const { sendGrantMatchEmail } = require('./email')

const AGENT_NAME = 'capital-grant-finder'

const ClientSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string().min(1),
  owner_name: z.string().min(1),
  email: z.string().email(),
  industry: z.string().nullable(),
  state: z.string().nullable(),
  business_type: z.string().nullable(),
  subscription_tier: z.string(),
  subscription_status: z.string(),
  onboarding_completed: z.boolean(),
  is_minority_owned: z.boolean(),
  is_woman_owned: z.boolean(),
  is_veteran_owned: z.boolean(),
  is_nonprofit: z.boolean(),
  is_rural_business: z.boolean(),
})

async function runForClient(clientId, triggerType = 'scheduled') {
  const supabase = getServiceClient()
  const startMs = Date.now()

  // Fetch and validate client
  const { data: rawClient, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (clientErr || !rawClient) throw new Error(`Client ${clientId} not found`)

  const client = ClientSchema.parse(rawClient)

  // Skip if not active or onboarding incomplete
  if (client.subscription_status !== 'active' || !client.onboarding_completed) {
    logger.info(AGENT_NAME, 'Skipping — client not active/complete', { clientId })
    return
  }

  logger.info(AGENT_NAME, 'Running for client', { clientId, triggerType })

  // Score all grants
  const scoredMatches = await scoreGrantsForClient(clientId)

  if (scoredMatches.length === 0) {
    logger.info(AGENT_NAME, 'No matches above threshold', { clientId })
    await supabase.from('agent_logs').insert({
      agent_name: AGENT_NAME,
      client_id: clientId,
      action: 'grant_finder_run',
      result: 'no_matches',
      duration_ms: Date.now() - startMs,
    })
    return
  }

  // Upsert grant_matches
  const upserts = scoredMatches.map((m) => ({
    client_id: clientId,
    grant_id: m.grant.id,
    match_score: m.score,
    status: 'new',
  }))

  await supabase.from('grant_matches')
    .upsert(upserts, { onConflict: 'client_id,grant_id', ignoreDuplicates: false })

  // Generate Claude reasons for top 10
  let reasonsMap = {}
  try {
    const reasons = await generateMatchReasons(client, scoredMatches)
    for (const r of reasons) {
      const match = scoredMatches.find((m) => m.grant.name === r.grant_name)
      if (match) reasonsMap[match.grant.id] = r.reason
    }

    // Update match_reasons in DB
    for (const [grantId, reason] of Object.entries(reasonsMap)) {
      await supabase.from('grant_matches')
        .update({ match_reasons: [reason] })
        .eq('client_id', clientId)
        .eq('grant_id', grantId)
    }
  } catch (err) {
    logger.warn(AGENT_NAME, 'Match reasons generation failed', { clientId, error: err.message })
    // Continue — matches are saved, just without reasons
  }

  // Email the client
  await sendGrantMatchEmail(client, scoredMatches.length, scoredMatches)

  await supabase.from('agent_logs').insert({
    agent_name: AGENT_NAME,
    client_id: clientId,
    action: 'grant_finder_run',
    result: JSON.stringify({ matches: scoredMatches.length, trigger: triggerType }),
    duration_ms: Date.now() - startMs,
  })

  logger.info(AGENT_NAME, 'Run complete', { clientId, matches: scoredMatches.length })
}

async function runAllClients() {
  const supabase = getServiceClient()
  logger.info(AGENT_NAME, 'Weekly run started')

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id')
    .eq('subscription_status', 'active')
    .eq('onboarding_completed', true)

  if (error) throw new Error(`Failed to fetch clients: ${error.message}`)

  logger.info(AGENT_NAME, `Processing ${clients?.length || 0} clients`)

  for (const { id } of clients || []) {
    await runForClient(id, 'scheduled').catch((err) => {
      logger.error(AGENT_NAME, 'Client run failed', { clientId: id, error: err.message })
    })
  }
}

async function processTriggerQueue() {
  const supabase = getServiceClient()

  const { data: triggers, error } = await supabase
    .from('agent_trigger_queue')
    .select('*')
    .eq('agent_name', AGENT_NAME)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error || !triggers?.length) return

  for (const trigger of triggers) {
    try {
      await supabase.from('agent_trigger_queue')
        .update({ status: 'processing' })
        .eq('id', trigger.id)

      await runForClient(trigger.client_id, trigger.trigger_type)

      await supabase.from('agent_trigger_queue')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('id', trigger.id)
    } catch (err) {
      logger.error(AGENT_NAME, 'Trigger queue error', { triggerId: trigger.id, error: err.message })
      const retries = (trigger.retry_count || 0) + 1
      await supabase.from('agent_trigger_queue').update({
        status: retries >= 3 ? 'failed' : 'pending',
        retry_count: retries,
        error: err.message,
      }).eq('id', trigger.id)
    }
  }
}

// Monday 7am UTC
cron.schedule('0 7 * * 1', runAllClients)

// Poll trigger queue every 5 minutes
cron.schedule('*/5 * * * *', processTriggerQueue)

// Process queue on startup (catch any missed triggers)
processTriggerQueue().catch((e) => logger.error(AGENT_NAME, 'Startup trigger poll failed', { error: e.message }))

logger.info(AGENT_NAME, 'capital-grant-finder started', { schedule: 'Monday 7am UTC + trigger queue every 5min' })
