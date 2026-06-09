-- ============================================================
-- MIGRATION 002: RLS POLICIES
-- All tables from migration 001 get explicit RLS policies here.
-- S11-012: Zero tables without policies after this migration.
-- ============================================================

-- ============================================================
-- clients — user owns their own row
-- ============================================================
CREATE POLICY "clients_own_data" ON clients FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- lenders — public read, service_role write
-- ============================================================
CREATE POLICY "lenders_public_read" ON lenders FOR SELECT
  USING (true);

-- ============================================================
-- grants — public read, service_role write
-- ============================================================
CREATE POLICY "grants_public_read" ON grants FOR SELECT
  USING (true);

-- ============================================================
-- lender_matches — client reads/modifies own matches only
-- ============================================================
CREATE POLICY "lender_matches_own" ON lender_matches FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- grant_matches — client reads/modifies own matches only
-- ============================================================
CREATE POLICY "grant_matches_own" ON grant_matches FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- applications — client reads/modifies own applications only
-- ============================================================
CREATE POLICY "applications_own" ON applications FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- credit_roadmaps — client reads/modifies own roadmap only
-- ============================================================
CREATE POLICY "credit_roadmaps_own" ON credit_roadmaps FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- opportunity_digests — client reads own digests only
-- ============================================================
CREATE POLICY "digests_own" ON opportunity_digests FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- agent_logs — service_role only (admin use)
-- No client-facing access; INSERT only via service_role
-- ============================================================
CREATE POLICY "agent_logs_service_role_only" ON agent_logs FOR ALL
  USING (false);

-- ============================================================
-- capital_leads — service_role INSERT, no client access
-- ============================================================
CREATE POLICY "capital_leads_service_role_only" ON capital_leads FOR ALL
  USING (false);

-- ============================================================
-- success_fee_tiers — public read (shown at signup/onboarding)
-- ============================================================
CREATE POLICY "fee_tiers_public_read" ON success_fee_tiers FOR SELECT
  USING (true);

-- ============================================================
-- consulting_agreements — client reads/modifies own agreement
-- ============================================================
CREATE POLICY "agreements_own" ON consulting_agreements FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- signature_documents — public read (needed to display docs)
-- ============================================================
CREATE POLICY "sig_docs_public_read" ON signature_documents FOR SELECT
  USING (true);

-- ============================================================
-- signature_requests — client reads own pending requests
-- ============================================================
CREATE POLICY "sig_requests_own" ON signature_requests FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- signatures — client can SELECT own executed signatures
-- No INSERT/UPDATE/DELETE from client role (system only)
-- ============================================================
CREATE POLICY "signatures_own_select" ON signatures FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- client_documents — client can SELECT own documents only
-- No cross-tenant access; uploads go through service_role
-- ============================================================
CREATE POLICY "client_docs_own_select" ON client_documents FOR SELECT
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- VERIFICATION QUERY (documentation — run after applying)
-- The following should return zero rows when applied correctly:
--
-- SELECT tablename
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename NOT IN (
--     SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
--   );
-- ============================================================
