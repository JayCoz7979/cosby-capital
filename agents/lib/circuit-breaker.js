'use strict'
// Tracks Claude API failures and opens circuit to prevent cascade

class CircuitBreaker {
  constructor({ threshold = 3, resetTimeoutMs = 60000 } = {}) {
    this.threshold = threshold
    this.resetTimeoutMs = resetTimeoutMs
    this.failures = 0
    this.state = 'closed' // closed | open | half-open
    this.openedAt = null
  }

  async call(fn) {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt
      if (elapsed > this.resetTimeoutMs) {
        this.state = 'half-open'
      } else {
        throw new Error(`Circuit breaker OPEN — retry in ${Math.ceil((this.resetTimeoutMs - elapsed) / 1000)}s`)
      }
    }
    try {
      const result = await fn()
      if (this.state === 'half-open') {
        this.failures = 0
        this.state = 'closed'
      }
      return result
    } catch (err) {
      this.failures++
      if (this.failures >= this.threshold) {
        this.state = 'open'
        this.openedAt = Date.now()
      }
      throw err
    }
  }

  get isOpen() { return this.state === 'open' }
}

module.exports = { CircuitBreaker }
