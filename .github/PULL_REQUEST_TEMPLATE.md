## Description
Brief description of what this PR does.

## Security Checklist
Before merging, verify all boxes are checked:

### Access Control
- [ ] Every new endpoint with resource ID calls verifyOwnership()
- [ ] Returns 404 (not 403) on ownership failure
- [ ] Update endpoints use explicit field allowlists (no req.body passthrough)
- [ ] Premium features call requireTier() server-side

### Input/Output
- [ ] User inputs sanitized before Claude prompts (sanitizeForPrompt)
- [ ] User-generated content wrapped in XML delimiters in prompts
- [ ] Agent outputs pass scanOutputConfidentiality() before storage
- [ ] Zod validation on all new API route inputs
- [ ] Generic error messages returned (no stack traces to client)

### Authentication
- [ ] New routes protected by middleware (check matcher config)
- [ ] No NODE_ENV bypass conditions introduced
- [ ] No hardcoded trust assumptions (admin=true, skip_auth)
- [ ] No verify_jwt=false on new edge functions (unless documented)

### Data
- [ ] New tables have RLS + policy in the SAME migration file
- [ ] No secrets in NEXT_PUBLIC_ environment variables
- [ ] No sensitive data added to Claude prompt templates (no EIN, SSN)
- [ ] No cardholder data in any log statements

### Dependencies
- [ ] No new npm packages added without justification comment
- [ ] If vm2 is added: version >= 3.11.2 required
- [ ] No community/unofficial packages added
- [ ] npm audit shows zero critical/high after this change

### PCI (if touching payment flows)
- [ ] No card data added to any log
- [ ] Checkout page CSP not weakened
- [ ] Script inventory updated if new scripts added to checkout pages

## Testing
- [ ] Tested in staging environment
- [ ] Security regression tests pass (npm run test:security)
- [ ] No new CodeQL alerts introduced

## Issue Reference
Resolves: [Issue ID from CosbyCapital_Top15pct_Issues.txt if applicable]
