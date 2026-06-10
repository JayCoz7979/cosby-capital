-- ============================================================
-- Add client_rejected column to agent_emails (CR-01 fix)
-- Distinguishes explicitly-rejected emails from unactioned ones
-- (client_approved = false is ambiguous — also the default state)
-- ============================================================

ALTER TABLE agent_emails
  ADD COLUMN IF NOT EXISTS client_rejected boolean NOT NULL DEFAULT false;
