# PCI DSS SAQ A Compliance Notes

## Overview

Cosby Capital uses Stripe-hosted Checkout for all payment processing. We never handle,
store, or transmit cardholder data (card numbers, CVV, expiry dates).

## Compliance Classification

- **SAQ type:** SAQ A (card-not-present, fully outsourced to Stripe)
- **Card data handled by:** Stripe only
- **Cosby Capital scope:** Out of scope for PCI DSS cardholder data environment

## What We Do NOT Store

- Card numbers (PAN)
- CVV / CVC codes
- Card expiry dates
- Full magnetic stripe data
- PIN data

## What We Do Store (Non-PCI)

- `stripe_customer_id` — Stripe-generated opaque identifier (not card data)
- `stripe_subscription_id` — Stripe-generated opaque identifier (not card data)
- Subscription tier and status (metadata only)

## Script Inventory

- No Stripe.js loaded on Cosby Capital pages
- Checkout redirect goes to Stripe-hosted page (stripe.com domain)
- No external payment scripts on any Cosby Capital origin

## Webhook Security

- `stripe.webhooks.constructEvent()` verifies every webhook signature before processing
- Raw webhook body is never logged (PCI requirement)
- No Stripe event objects logged (may contain billing details)
- Only safe scalar metadata (client_id, tier, event type) is logged

## Pre-Go-Live Checklist

- [ ] Complete SAQ A self-assessment (see `/admin/runbooks/pci/saq-a-self-assessment.md`)
- [ ] Run Qualys FreeScan on staging environment
- [ ] Switch Stripe keys from test mode to live mode
- [ ] Verify STRIPE_WEBHOOK_SECRET is live mode webhook secret
- [ ] Confirm Stripe Radar fraud rules are enabled
- [ ] Verify Stripe Billing Portal cancellation flow is configured

## References

- Stripe SAQ A guidance: https://stripe.com/guides/pci-compliance
- PCI DSS SAQ A: https://www.pcisecuritystandards.org/document_library
