'use strict'
const https = require('https')
const crypto = require('crypto')

// HMAC-signed Telegram alerts using TELEGRAM_SIGNING_SECRET
function signPayload(payload) {
  const secret = process.env.TELEGRAM_SIGNING_SECRET
  if (!secret) throw new Error('TELEGRAM_SIGNING_SECRET not set')
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

async function sendAlert(message, level = 'info') {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return // silently skip if not configured

  const emoji = { info: 'ℹ️', warn: '⚠️', error: '🚨', success: '✅' }[level] || 'ℹ️'
  const text = `${emoji} ${message}`
  const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  const sig = signPayload(payload)

  return new Promise((resolve, reject) => {
    const req = https.request(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature': sig } },
      (res) => {
        let data = ''
        res.on('data', (chunk) => data += chunk)
        res.on('end', () => resolve(JSON.parse(data)))
      }
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

module.exports = { sendAlert }
