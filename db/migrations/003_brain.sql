-- Bộ não thứ 2: kho ghi nhớ dùng chung của các agent (bài học, insight khách, ghi nhớ vận hành, quy tắc, quyết định).
-- Mục do agent tự rút ra ở trạng thái PENDING cho tới khi quản lý duyệt; agent chỉ dùng mục ACTIVE.
CREATE TABLE IF NOT EXISTS brain_notes (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('RULE','LESSON','INSIGHT','MEMORY','DECISION')),
  title text NOT NULL,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  source_label text,
  source_href text,
  author_label text NOT NULL,
  agent text,
  confidence text NOT NULL DEFAULT 'MEDIUM' CHECK (confidence IN ('HIGH','MEDIUM','LOW')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PENDING','ARCHIVED')),
  dedupe_key text,
  uses int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  reviewed_by_label text,
  biz_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS brain_notes_tenant ON brain_notes (tenant_id, status, kind);
CREATE UNIQUE INDEX IF NOT EXISTS brain_notes_dedupe ON brain_notes (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Nhật ký agent tra cứu Bộ não (để hiển thị “agent đã dùng tri thức nào”)
CREATE TABLE IF NOT EXISTS brain_lookups (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent text NOT NULL,
  query text NOT NULL,
  hits jsonb NOT NULL DEFAULT '[]'::jsonb,
  biz_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS brain_lookups_tenant ON brain_lookups (tenant_id, biz_at DESC);
