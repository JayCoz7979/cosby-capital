-- ============================================================
-- MIGRATION 009: STRIPE BILLING TABLES
-- Adds Stripe subscription state columns to clients.
-- Creates fee_invoices table with RLS.
-- ============================================================

-- ── Add missing Stripe subscription columns to clients ────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean DEFAULT false;

-- ── fee_invoices — success fees (not subscriptions) ──────────────────────────
-- These are one-off invoices for grant/loan success fees after funding events.
-- RLS: clients read their own; all writes are service_role only.
CREATE TABLE IF NOT EXISTS fee_invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  description text NOT NULL,
  stripe_payment_link text,
  stripe_payment_intent_id text,
  paid boolean DEFAULT false,
  paid_at timestamptz,
  dunning_count integer DEFAULT 0,
  next_dunning_at timestamptz
);
ALTER TABLE fee_invoices ENABLE ROW LEVEL SECURITY;

-- Clients can read their own fee invoices
CREATE POLICY "fee_own_read" ON fee_invoices FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE user_id = auth.uid()
    )
  );

-- All writes (INSERT, UPDATE, DELETE) are service_role only
-- The policy below blocks all authenticated user writes by evaluating false.
-- The service_role bypasses RLS by default (Supabase behavior).
CREATE POLICY "fee_service_write" ON fee_invoices
  FOR ALL
  USING (auth.role() = 'service_role');
