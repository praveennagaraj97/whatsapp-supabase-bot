-- ============================================================
-- Project-aware bot configuration and admin APIs support
-- ============================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  bot_name TEXT NOT NULL DEFAULT 'MediBot',
  description TEXT,
  system_prompt TEXT NOT NULL DEFAULT '',
  welcome_message TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_projects_single_enabled ON projects (is_enabled)
WHERE is_enabled = TRUE;

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO projects (
  name,
  slug,
  bot_name,
  description,
  system_prompt,
  welcome_message,
  is_enabled
) VALUES (
  'Default Healthcare Bot',
  'medibot-default',
  'MediBot',
  'Default healthcare bot project for clinics, doctors, medicines, and FAQs.',
  'You are operating a healthcare assistant for India. Use only the doctors, clinics, medicines, and FAQ data attached to this project. Keep guidance safe, concise, and suitable for WhatsApp conversations.',
  'Welcome to *MediBot*! I can help with symptoms, doctor appointments, medicines, and health FAQs.',
  TRUE
)
ON CONFLICT (slug) DO UPDATE
SET is_enabled = EXCLUDED.is_enabled,
    system_prompt = EXCLUDED.system_prompt,
    welcome_message = EXCLUDED.welcome_message,
    updated_at = NOW();

INSERT INTO admin_users (
  email,
  full_name,
  password_hash,
  is_active
) VALUES (
  'admin@medibot.in',
  'Default Admin',
  '$2b$10$WV19wISz4UGNnv.YwFZmBONTi4KJ1e4Vq6rduheDgNrKpo08T5dXC',
  TRUE
)
ON CONFLICT (email) DO NOTHING;

ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_pkey;
ALTER TABLE user_sessions ADD COLUMN project_id UUID REFERENCES projects(id);

ALTER TABLE queued_messages ADD COLUMN project_id UUID REFERENCES projects(id);
ALTER TABLE chat_messages ADD COLUMN project_id UUID REFERENCES projects(id);
ALTER TABLE inactivity_messages ADD COLUMN project_id UUID REFERENCES projects(id);

ALTER TABLE doctors ADD COLUMN project_id UUID REFERENCES projects(id);
ALTER TABLE doctors ADD COLUMN source_id TEXT;

ALTER TABLE clinics ADD COLUMN project_id UUID REFERENCES projects(id);
ALTER TABLE clinics ADD COLUMN source_id TEXT;

ALTER TABLE medicines ADD COLUMN project_id UUID REFERENCES projects(id);
ALTER TABLE medicines ADD COLUMN source_id TEXT;

ALTER TABLE faqs ADD COLUMN project_id UUID REFERENCES projects(id);
ALTER TABLE faqs ADD COLUMN source_id TEXT;

ALTER TABLE appointments ADD COLUMN project_id UUID REFERENCES projects(id);
ALTER TABLE medicine_orders ADD COLUMN project_id UUID REFERENCES projects(id);

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE user_sessions
SET project_id = (SELECT id FROM default_project)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE queued_messages
SET project_id = (SELECT id FROM default_project)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE chat_messages
SET project_id = (SELECT id FROM default_project)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE inactivity_messages
SET project_id = (SELECT id FROM default_project)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE doctors
SET project_id = (SELECT id FROM default_project),
    source_id = COALESCE(source_id, id)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE clinics
SET project_id = (SELECT id FROM default_project),
    source_id = COALESCE(source_id, id)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE medicines
SET project_id = (SELECT id FROM default_project),
    source_id = COALESCE(source_id, id)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE faqs
SET project_id = (SELECT id FROM default_project),
    source_id = COALESCE(source_id, id::TEXT)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE appointments
SET project_id = (SELECT id FROM default_project)
WHERE project_id IS NULL;

WITH default_project AS (
  SELECT id FROM projects WHERE slug = 'medibot-default' LIMIT 1
)
UPDATE medicine_orders
SET project_id = (SELECT id FROM default_project)
WHERE project_id IS NULL;

ALTER TABLE user_sessions ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE queued_messages ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE inactivity_messages ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE doctors ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE clinics ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE medicines ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE faqs ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE appointments ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE medicine_orders ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE user_sessions ADD PRIMARY KEY (project_id, user_id);

ALTER TABLE inactivity_messages DROP CONSTRAINT IF EXISTS inactivity_messages_user_id_key;

DROP INDEX IF EXISTS idx_queued_messages_user_created;
DROP INDEX IF EXISTS idx_chat_messages_user;

CREATE INDEX idx_queued_messages_project_user_created
ON queued_messages (project_id, user_id, created_at);

CREATE INDEX idx_chat_messages_project_user
ON chat_messages (project_id, user_id, created_at);

CREATE UNIQUE INDEX idx_inactivity_messages_project_user
ON inactivity_messages (project_id, user_id);

CREATE INDEX idx_user_sessions_project_user
ON user_sessions (project_id, user_id);

CREATE INDEX idx_doctors_project_active ON doctors (project_id, is_active);
CREATE INDEX idx_clinics_project_active ON clinics (project_id, is_active);
CREATE INDEX idx_medicines_project_stock ON medicines (project_id, in_stock);
CREATE INDEX idx_faqs_project_active ON faqs (project_id, is_active);

CREATE UNIQUE INDEX idx_doctors_project_source_id
ON doctors (project_id, source_id)
WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX idx_clinics_project_source_id
ON clinics (project_id, source_id)
WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX idx_medicines_project_source_id
ON medicines (project_id, source_id)
WHERE source_id IS NOT NULL;

CREATE UNIQUE INDEX idx_faqs_project_source_id
ON faqs (project_id, source_id)
WHERE source_id IS NOT NULL;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON admin_users FOR ALL USING (true) WITH CHECK (true);