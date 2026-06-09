-- Migration 005: device_otps table for step-up OTP authentication
--
-- Creates a temporary OTP storage table used during device trust verification.
-- OTPs are stored as SHA-256 hashes (never plaintext) and expire after 10 minutes.
-- Brute force protection: attempt_count >= 3 causes OTP to be marked used.
--
-- Note: trusted_devices table was created in migration 003 (security_tables).
-- This migration only adds the device_otps temp table.

CREATE TABLE IF NOT EXISTS device_otps (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       timestamptz NOT NULL    DEFAULT now(),
  user_id          uuid        NOT NULL    REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint_hash text        NOT NULL,
  otp_hash         text        NOT NULL,   -- SHA-256 hex hash of the OTP — never plaintext
  expires_at       timestamptz NOT NULL    DEFAULT (now() + INTERVAL '10 minutes'),
  used             boolean     NOT NULL    DEFAULT false,
  attempt_count    integer     NOT NULL    DEFAULT 0
);

-- Row Level Security — only service_role can read/write (API routes use service client)
ALTER TABLE device_otps ENABLE ROW LEVEL SECURITY;

-- Block all access except service_role (which bypasses RLS entirely)
-- This ensures no user can read or manipulate OTP records via anon/authenticated keys
CREATE POLICY "service_role_only" ON device_otps
  FOR ALL
  USING (auth.role() = 'service_role');

-- Index for efficient lookup of active OTPs by user + fingerprint
CREATE INDEX IF NOT EXISTS idx_device_otps_user_fingerprint
  ON device_otps(user_id, fingerprint_hash)
  WHERE used = false;

-- Index for scheduled cleanup of expired OTPs
CREATE INDEX IF NOT EXISTS idx_device_otps_expires
  ON device_otps(expires_at);

-- Index for rate limiting: count recent OTPs per user
CREATE INDEX IF NOT EXISTS idx_device_otps_user_created
  ON device_otps(user_id, created_at);
