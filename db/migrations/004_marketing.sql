-- Hệ thống Marketing: kênh nội dung, nhân vật AI, lô video, video, kiểm duyệt.
-- File video không lưu trong cơ sở dữ liệu: media_ref là đường dẫn tương đối trong thư mục media của máy chạy.
CREATE TABLE IF NOT EXISTS mkt_channels (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  platform text NOT NULL,
  concept text NOT NULL,
  status text NOT NULL CHECK (status IN ('PROPOSED','TRIAL','ACTIVE','PAUSED')),
  formats jsonb NOT NULL DEFAULT '[]'::jsonb,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent text,
  biz_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS mkt_characters (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES mkt_channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  formats text NOT NULL,
  voice text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('CREATED','APPROVED','PLANNED')),
  created_on text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mkt_batches (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES mkt_channels(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('PLANNING','PRODUCING','REVIEW','DONE')),
  note text,
  biz_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel_id, code)
);

CREATE TABLE IF NOT EXISTS mkt_videos (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES mkt_channels(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES mkt_batches(id) ON DELETE SET NULL,
  code text NOT NULL,
  format text NOT NULL CHECK (format IN ('A','B','C','D')),
  title text NOT NULL,
  headline text,
  situation text,
  characters text[] NOT NULL DEFAULT '{}',
  script jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption text,
  hashtags text,
  status text NOT NULL CHECK (status IN ('IDEA','SCRIPTED','PRODUCED','IN_REVIEW','REVISE','APPROVED','SCHEDULED','PUBLISHED','REJECTED')),
  duration_s numeric,
  credits int NOT NULL DEFAULT 0,
  production jsonb NOT NULL DEFAULT '{}'::jsonb,
  expert_ok boolean NOT NULL DEFAULT false,
  expert_note text,
  media_ref text,
  scheduled_at timestamptz,
  biz_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, channel_id, code)
);
CREATE INDEX IF NOT EXISTS mkt_videos_status ON mkt_videos (tenant_id, status);

CREATE TABLE IF NOT EXISTS mkt_reviews (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES mkt_videos(id) ON DELETE CASCADE,
  reviewer_id uuid,
  reviewer_label text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVE','REVISE','REJECT','SUBMIT','EXPERT_OK')),
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  biz_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mkt_reviews_video ON mkt_reviews (video_id, biz_at DESC);
