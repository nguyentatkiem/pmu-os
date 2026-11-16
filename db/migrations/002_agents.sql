-- PMU OS - bổ sung: ảnh nhân sự, chống trùng đề xuất, nhật ký chạy AI Agent, đếm lượt gọi mô hình AI
ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE ai_proposals ADD COLUMN IF NOT EXISTS agent text;
CREATE UNIQUE INDEX IF NOT EXISTS ai_proposals_dedupe_pending ON ai_proposals (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND status = 'PENDING';

CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent text NOT NULL,
  trigger text NOT NULL,
  requested_by uuid,
  requested_label text,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  summary text,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  biz_started_at timestamptz NOT NULL,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_runs_lookup ON agent_runs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid,
  model text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cache_read_tokens int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_lookup ON ai_usage (tenant_id, created_at DESC);
