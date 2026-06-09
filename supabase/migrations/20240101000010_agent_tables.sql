-- ============================================================
-- MIGRATION 010: AGENT SUPPORT TABLES
-- Required by all agents: emails, compliance log, health log, trigger queue
-- S11-012: Every CREATE TABLE immediately followed by ENABLE ROW LEVEL SECURITY
-- ============================================================

-- ============================================================
-- agent_emails — log + approval queue for all agent-generated emails
-- ============================================================
CREATE TABLE agent_emails (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  agent_name text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  to_email text NOT NULL,
  to_name text,
  subject text,
  body_html text,
  sent boolean DEFAULT false,
  sent_at timestamptz,
  resend_message_id text,
  error text,
  requires_client_approval boolean DEFAULT false,
  requires_admin_approval boolean DEFAULT false,
  client_approved boolean DEFAULT false,
  client_approved_at timestamptz
);
ALTER TABLE agent_emails ENABLE ROW LEVEL SECURITY;
-- Clients can view their own emails and approve them
CREATE POLICY "agent_emails_own" ON agent_emails FOR ALL
  USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- ============================================================
-- compliance_log — required per agent email rule #5: log every sent email
-- Deferred from migration 001 per STATE.md (no RLS pattern defined at Phase 1)
-- ============================================================
CREATE TABLE compliance_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  agent_name text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  communication_type text NOT NULL,
  recipient_email text,
  subject text,
  content_summary text,
  contained_loan_terms boolean DEFAULT false,
  loan_terms_scan_result jsonb,
  agent_email_id uuid REFERENCES agent_emails(id),
  logged_at timestamptz DEFAULT now()
);
ALTER TABLE compliance_log ENABLE ROW LEVEL SECURITY;
-- Service role only — admin read via service_role; clients cannot read compliance audit
CREATE POLICY "compliance_log_service_role_only" ON compliance_log FOR ALL
  USING (false);

-- ============================================================
-- platform_health_log — Agent 14 writes all health check results here
-- ============================================================
CREATE TABLE platform_health_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  check_type text NOT NULL,
  service_name text,
  status text NOT NULL,
  error_details text,
  auto_fix_attempted boolean DEFAULT false,
  auto_fix_action text,
  auto_fix_result text,
  auto_fix_success boolean,
  alert_sent boolean DEFAULT false,
  resolved boolean DEFAULT false,
  resolved_at timestamptz
);
ALTER TABLE platform_health_log ENABLE ROW LEVEL SECURITY;
-- Admin only via service_role
CREATE POLICY "platform_health_service_role_only" ON platform_health_log FOR ALL
  USING (false);

-- ============================================================
-- agent_trigger_queue — on-signup agent triggers (polled by agents every 5 min)
-- Next.js onboarding/complete inserts here; agents process and mark done
-- ============================================================
CREATE TABLE agent_trigger_queue (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz DEFAULT now(),
  agent_name text NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'signup',
  status text NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  error text,
  retry_count integer DEFAULT 0
);
ALTER TABLE agent_trigger_queue ENABLE ROW LEVEL SECURITY;
-- Service role only — triggers are system-internal
CREATE POLICY "trigger_queue_service_role_only" ON agent_trigger_queue FOR ALL
  USING (false);

-- Index for agent polling: only pending triggers
CREATE INDEX idx_trigger_queue_pending ON agent_trigger_queue (agent_name, status)
  WHERE status = 'pending';
