'use strict'
const { createClient } = require('@supabase/supabase-js')

let _client = null

function getServiceClient() {
  if (_client) return _client

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY

  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_KEY required')

  // Verify this is service_role key (JWT 'role' claim = 'service_role')
  // Do not use anon key — agents must bypass RLS
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}

module.exports = { getServiceClient }
