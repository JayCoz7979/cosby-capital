-- ============================================================
-- MIGRATION 011: NOTIFICATIONS TABLE
-- SC-4-4: Realtime notifications for client dashboard
-- S11-012: CREATE TABLE immediately followed by ENABLE ROW LEVEL SECURITY
-- ============================================================

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  action_url text,
  created_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifs_own" ON notifications FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE INDEX idx_notifications_client_unread ON notifications (client_id, read, created_at DESC)
  WHERE read = false;
