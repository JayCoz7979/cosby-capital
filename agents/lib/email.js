'use strict'
const { Resend } = require('resend')

let _resend = null

function getResend() {
  if (_resend) return _resend
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not set')
  _resend = new Resend(apiKey)
  return _resend
}

const EMAIL_FOOTER = `
<br><br>
<hr style="border:0;border-top:1px solid #eee;margin:24px 0">
<p style="font-size:12px;color:#666;margin:0">
  Cosby Capital | cosbycapital.com<br>
  Powered by Cosby AI Solutions | cosbyaisolutions.com<br>
  This email was sent on behalf of your business by Cosby Capital's AI consulting system.
  Cosby Capital is a business consulting platform, not a licensed financial advisor or loan broker.
  Questions? <a href="mailto:support@cosbycapital.com">support@cosbycapital.com</a>
</p>`

// Log to agent_emails BEFORE sending (rule 1 for every agent email)
async function logAndSend(supabase, { agentName, clientId, emailType, toEmail, toName, subject, bodyHtml, requiresClientApproval = false }) {
  // Log first — always
  const { data: logged, error: logErr } = await supabase
    .from('agent_emails')
    .insert({
      agent_name: agentName,
      client_id: clientId,
      email_type: emailType,
      to_email: toEmail,
      to_name: toName,
      subject,
      body_html: bodyHtml,
      requires_client_approval: requiresClientApproval,
      client_approved: !requiresClientApproval, // auto-approved if no approval needed
    })
    .select()
    .single()

  if (logErr) throw new Error(`Failed to log email: ${logErr.message}`)

  // Only send if no approval needed
  if (requiresClientApproval) {
    return { queued: true, emailId: logged.id }
  }

  const resend = getResend()
  const fullHtml = bodyHtml + EMAIL_FOOTER

  const { data: sent, error: sendErr } = await resend.emails.send({
    from: 'Cosby Capital <info@cosbycapital.com>',
    to: [toEmail],
    subject,
    html: fullHtml,
  })

  if (sendErr) {
    await supabase.from('agent_emails').update({ error: sendErr.message }).eq('id', logged.id)
    throw new Error(`Email send failed: ${sendErr.message}`)
  }

  await supabase.from('agent_emails').update({
    sent: true,
    sent_at: new Date().toISOString(),
    resend_message_id: sent.id,
  }).eq('id', logged.id)

  return { sent: true, emailId: logged.id, messageId: sent.id }
}

module.exports = { logAndSend, EMAIL_FOOTER }
