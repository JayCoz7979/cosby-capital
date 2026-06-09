# Cosby Capital

**Product:** Cosby Capital — AI-powered capital solutions platform  
**Domain:** cosbycapital.com  
**Tagline:** "Your Capital. Your Future. Unlocked."  
**Founder:** Jason L. Cosby  
**Legal entity:** Cosby Global Enterprises (Delaware LLC)  
**Parent brand:** Cosby AI Solutions LLC (cosbyaisolutions.com)  
**GitHub:** JayCoz7979/cosby-capital  

## What We're Building

A full-stack SaaS platform connecting businesses to grants, funding, lending, credit repair, and credit coaching. 18 autonomous AI agents power matching, outreach, monitoring, and compliance workflows.

## Stack

- **Frontend:** Next.js 15.5.18 (App Router) → Vercel
- **Backend/DB:** Supabase (Postgres + Auth + Storage + RLS)
- **Agents:** 18 Railway services (Node.js + Anthropic Claude)
- **Payments:** Stripe (monthly + annual tiers)
- **Email:** Resend (info@cosbycapital.com)
- **Voice:** VAPI (Rachel agent)
- **Analytics:** PostHog (Railway-hosted) + Microsoft Clarity
- **Monitoring:** Sentry + Agent 14
- **Security:** Cloudflare (WAF + Zero Trust) + Upstash Redis

## Tiers

| Tier | Monthly | Annual |
|------|---------|--------|
| Starter | $49 | $490 |
| Growth | $99 | $990 |
| Capital Partner | $199 | $1,990 |
| Done For You | Custom | Custom |

## Reference Documents

- `CosbyCapital_Master_Build_Prompt_v14_FINAL.txt` — 206-section authoritative spec (v14.7)
- `cosby_capital_schema.sql` — full Supabase schema
- `phase1-build-sequence.md` — Day-by-day Phase 1 order
- `CosbyCapital_Top15pct_Issues.txt` — security issues (218 items)
- `runbooks/all-runbooks.md` — operational runbooks
- `legal/legal-and-compliance-pages.md` — all legal copy
- `marketing/all-marketing-copy.md` — landing page copy

## Non-Negotiables

1. All AI logic server-side only — no scoring/prompts in browser JS
2. No API keys in frontend code
3. All tables have RLS enabled and verified
4. service_role never in client-facing code
5. All user input sanitized before Claude prompts
6. DMARC p=reject before first email
7. Admin panel returns 404 (not 403) to non-allowlisted IPs
8. client_approved=true required before any external agent email
9. Agent 9 requires CROA agreement + surety bond before acting
10. Footer: "Powered by Cosby AI Solutions | cosbyaisolutions.com"
