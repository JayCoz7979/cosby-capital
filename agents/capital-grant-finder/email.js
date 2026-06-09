'use strict'
const { logAndSend } = require('../lib/email')
const { getServiceClient } = require('../lib/supabase')
const logger = require('../lib/logger')

const AGENT_NAME = 'capital-grant-finder'

async function sendGrantMatchEmail(client, matchCount, topMatches) {
  const supabase = getServiceClient()

  const topGrantLines = topMatches.slice(0, 5).map((m) =>
    `<li><strong>${m.grant.name}</strong> — Up to $${m.grant.max_award_amount?.toLocaleString() || 'varies'} from ${m.grant.grantor}</li>`
  ).join('\n')

  const bodyHtml = `
<p>Hi ${client.owner_name},</p>
<p>Great news! Cosby Capital's AI has identified <strong>${matchCount} grant opportunities</strong> for ${client.business_name}.</p>
<p>Here are your top matches:</p>
<ul>
${topGrantLines}
</ul>
<p>Log in to your dashboard to view all matches, eligibility details, and next steps.</p>
<p><a href="https://cosbycapital.com/dashboard/grants" style="background:#0A1628;color:#C9A84C;padding:12px 24px;text-decoration:none;border-radius:4px;display:inline-block;margin:16px 0">View My Grant Matches &#x2192;</a></p>
<p><em>Cosby Capital provides grant research and advisory services. We do not guarantee award outcomes.
All grant applications are submitted by the client or on the client's behalf with explicit written authorization.</em></p>`

  await logAndSend(supabase, {
    agentName: AGENT_NAME,
    clientId: client.id,
    emailType: 'grant_matches_ready',
    toEmail: client.email,
    toName: client.owner_name,
    subject: `Your grant matches are ready — ${matchCount} opportunities found`,
    bodyHtml,
    requiresClientApproval: false,
  })

  // Compliance log — confirm no loan terms
  await supabase.from('compliance_log').insert({
    agent_name: AGENT_NAME,
    client_id: client.id,
    communication_type: 'grant_match_email',
    recipient_email: client.email,
    subject: `Grant matches ready — ${matchCount} opportunities`,
    content_summary: `Notified client of ${matchCount} grant matches`,
    contained_loan_terms: false,
  }).catch((e) => logger.warn(AGENT_NAME, 'Compliance log failed', { error: e.message }))
}

module.exports = { sendGrantMatchEmail }
