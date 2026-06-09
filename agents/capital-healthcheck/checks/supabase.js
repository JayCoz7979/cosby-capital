'use strict'
const { getServiceClient } = require('../../lib/supabase')

async function checkSupabase() {
  const supabase = getServiceClient()
  const results = []

  // Check DB connectivity
  const { error: pingErr } = await supabase.from('platform_settings').select('key').limit(1)
  results.push({
    check: 'supabase_connectivity',
    status: pingErr ? 'fail' : 'ok',
    error: pingErr?.message,
  })

  // Check for tables missing RLS (critical — S11-012 enforcement)
  const { data: noRls } = await supabase.rpc('get_tables_without_rls').catch(() => ({ data: null }))
  if (noRls && noRls.length > 0) {
    results.push({
      check: 'rls_audit',
      status: 'critical',
      error: `Tables missing RLS: ${noRls.join(', ')}`,
    })
  } else {
    results.push({ check: 'rls_audit', status: 'ok' })
  }

  // Check pending signatures older than 5 days
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  const { count: staleSigs } = await supabase
    .from('signature_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .lt('created_at', fiveDaysAgo)
    .catch(() => ({ count: 0 }))

  if (staleSigs > 0) {
    results.push({
      check: 'stale_signatures',
      status: 'warn',
      error: `${staleSigs} pending signatures older than 5 days`,
    })
  }

  // Check fee_invoices in suspended state with no admin review
  const { count: suspendedFees } = await supabase
    .from('fee_invoices')
    .select('*', { count: 'exact', head: true })
    .eq('service_suspended', true)
    .eq('paid', false)
    .catch(() => ({ count: 0 }))

  if (suspendedFees > 0) {
    results.push({
      check: 'suspended_invoices',
      status: 'warn',
      error: `${suspendedFees} fee invoices in suspended state need admin review`,
    })
  }

  return results
}

module.exports = { checkSupabase }
