-- PMU OS - schema khởi tạo
-- Mọi bảng nghiệp vụ có tenant_id, created_at, updated_at, version. Thời điểm lưu UTC (timestamptz).

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('DEMO','REAL')),
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  status text NOT NULL DEFAULT 'ACTIVE',
  demo_now timestamptz,
  clock_anchor timestamptz,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED','INVITED')),
  is_demo_persona boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uniq ON users (lower(email));

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  branch_ids uuid[],
  employee_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acting_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  position text NOT NULL CHECK (position IN ('MANAGER','CONSULTANT','TECHNICIAN','CUSTOMER_CARE','RECEPTION')),
  skills text[] NOT NULL DEFAULT '{}',
  availability jsonb NOT NULL DEFAULT '{}'::jsonb,
  work_status text NOT NULL DEFAULT 'WORKING' CHECK (work_status IN ('WORKING','AVAILABLE','ON_LEAVE')),
  active boolean NOT NULL DEFAULT true,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS employees_tenant ON employees (tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS leaves (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'APPROVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('DRAFT','APPROVED','CANCELLED')),
  note text,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS shifts_lookup ON shifts (tenant_id, employee_id, start_at);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code text NOT NULL,
  display_name text NOT NULL,
  contact_phone text,
  contact_norm text,
  source text,
  segment text,
  avatar text,
  assigned_to uuid REFERENCES employees(id) ON DELETE SET NULL,
  readiness text CHECK (readiness IN ('HOT','WARM','COLD')),
  readiness_reason text,
  readiness_by text,
  readiness_at timestamptz,
  readiness_confirmed boolean NOT NULL DEFAULT false,
  lifecycle_stage int NOT NULL DEFAULT 1 CHECK (lifecycle_stage BETWEEN 1 AND 8),
  next_followup_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_contact_uniq ON customers (tenant_id, contact_norm) WHERE contact_norm IS NOT NULL;

CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('CARE','MARKETING')),
  status text NOT NULL CHECK (status IN ('GRANTED','DENIED','REVOKED')),
  source text,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  author_id uuid,
  author_label text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customer_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  employee_id uuid,
  status_label text,
  ref_type text,
  ref_id uuid,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS customer_events_lookup ON customer_events (tenant_id, customer_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_min int NOT NULL CHECK (duration_min > 0),
  price_vnd bigint,
  faq_version text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','CONFIRMED','ARRIVED','COMPLETED','CANCELLED','NO_SHOW')),
  cancel_reason text,
  note text,
  created_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS appointments_lookup ON appointments (tenant_id, employee_id, start_at);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  owner_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_by uuid,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  sop_document_id uuid,
  due_at timestamptz NOT NULL,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
  status text NOT NULL CHECK (status IN ('TODO','IN_PROGRESS','SUBMITTED','DONE','CANCELLED')),
  accepted_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  approved_by uuid,
  rework_count int NOT NULL DEFAULT 0,
  biz_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS tasks_lookup ON tasks (tenant_id, branch_id, status);

CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  position int NOT NULL DEFAULT 0,
  done_at timestamptz,
  done_by uuid,
  evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS task_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_label text,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text UNIQUE,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL,
  ref_type text NOT NULL,
  ref_id uuid NOT NULL,
  run_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('SCHEDULED','CANCELLED','DONE','BLOCKED','WAITING')),
  result text,
  dedupe_key text NOT NULL UNIQUE,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (tenant_id, status, run_at);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'ZALO',
  external_id text,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES employees(id) ON DELETE SET NULL,
  specialist_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','OPEN','DONE')),
  follow_up boolean NOT NULL DEFAULT false,
  draft text,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('IN','OUT')),
  body text NOT NULL,
  delivery_status text NOT NULL,
  source_ref text,
  author_id uuid,
  author_label text,
  external_event_id text,
  idempotency_key text,
  sent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS messages_ext_uniq ON messages (tenant_id, external_event_id) WHERE external_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS messages_idem_uniq ON messages (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('FAQ','PRICE','POLICY')),
  code text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  version_label text NOT NULL,
  status text NOT NULL DEFAULT 'APPROVED',
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS care_templates (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  version_label text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'APPROVED',
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS care_plans (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  template_id uuid REFERENCES care_templates(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','DONE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS care_touchpoints (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_at timestamptz NOT NULL,
  owner_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('PLANNED','TO_CONTACT','WAITING_REPLY','DONE','PAUSED')),
  template_id uuid REFERENCES care_templates(id) ON DELETE SET NULL,
  template_version text,
  note text,
  contacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'LOW' CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  rating text CHECK (rating IN ('VERY_GOOD','GOOD','NEUTRAL','BAD')),
  body text,
  needs_specialist boolean NOT NULL DEFAULT false,
  assigned_to uuid REFERENCES employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED')),
  biz_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sop_documents (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text,
  owner_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sop_versions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES sop_documents(id) ON DELETE CASCADE,
  version_label text NOT NULL,
  content jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','PENDING_APPROVAL','PUBLISHED','ARCHIVED')),
  approved_by uuid,
  effective_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS learning_assignments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  sop_version_id uuid NOT NULL REFERENCES sop_versions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('ASSIGNED','SUBMITTED','REVIEWED')),
  due_at timestamptz,
  completed_at timestamptz,
  score int,
  total int,
  answers jsonb,
  reviewed_by uuid,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  UNIQUE (employee_id, sop_version_id)
);

CREATE TABLE IF NOT EXISTS support_notes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  author_id uuid,
  author_label text,
  period text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid,
  period_date text NOT NULL,
  scope text NOT NULL,
  source_cutoff timestamptz NOT NULL,
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED')),
  created_by uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ai_proposals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid,
  code text NOT NULL,
  action_type text NOT NULL,
  title text NOT NULL,
  summary text,
  proposed_payload jsonb NOT NULL,
  before_snapshot jsonb,
  after_snapshot jsonb,
  affected jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  requested_by uuid,
  requested_label text NOT NULL,
  owner_employee_id uuid,
  policy_version text NOT NULL DEFAULT 'policy-v1',
  required_permission text NOT NULL,
  target_type text,
  target_id uuid,
  target_version int,
  status text NOT NULL CHECK (status IN ('PENDING','RETURNED','REJECTED','EXPIRED','APPROVED','EXECUTED','FAILED','CANCELLED')),
  expires_at timestamptz NOT NULL,
  biz_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES ai_proposals(id) ON DELETE CASCADE,
  approver_id uuid,
  approver_label text,
  decision text NOT NULL CHECK (decision IN ('APPROVE','REJECT','RETURN')),
  reason text,
  decided_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES ai_proposals(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','BLOCKED')),
  result jsonb,
  attempts int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  mode text NOT NULL DEFAULT 'DEMO' CHECK (mode IN ('DEMO','LIVE')),
  credential_secret_ref text,
  health text NOT NULL DEFAULT 'NOT_CONNECTED',
  last_checked_at timestamptz,
  last_error text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  scope text,
  result text NOT NULL DEFAULT 'OK',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_lookup ON audit_events (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_threads (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  biz_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content jsonb NOT NULL,
  biz_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
