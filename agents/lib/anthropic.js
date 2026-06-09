'use strict'
const Anthropic = require('@anthropic-ai/sdk')

// Verify we're calling the real Anthropic endpoint (endpoint lock)
const EXPECTED_BASE_URL = 'https://api.anthropic.com'
const PINNED_MODEL = 'claude-sonnet-4-6'

let _client = null

function getClient() {
  if (_client) return _client

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  _client = new Anthropic({ apiKey, baseURL: EXPECTED_BASE_URL, maxRetries: 2, timeout: 60000 })
  return _client
}

// Always use pinned model — never accept 'latest' or arbitrary model strings
async function createMessage({ systemPrompt, userPrompt, maxTokens = 2048 }) {
  const client = getClient()
  return client.messages.create({
    model: PINNED_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
}

module.exports = { getClient, createMessage, PINNED_MODEL }
