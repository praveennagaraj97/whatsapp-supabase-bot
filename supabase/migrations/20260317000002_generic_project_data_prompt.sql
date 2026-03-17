-- ============================================================
-- Generic project data tables + generic prompt/schema defaults
-- ============================================================

CREATE TABLE IF NOT EXISTS project_data_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, table_name)
);

CREATE TRIGGER update_project_data_tables_updated_at
BEFORE UPDATE ON project_data_tables
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_project_data_tables_project
ON project_data_tables(project_id);

ALTER TABLE project_data_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON project_data_tables FOR ALL USING (true) WITH CHECK (true);

-- Generic default system prompt and schema (project-configurable from admin panel)
UPDATE projects
SET system_prompt = COALESCE(NULLIF(system_prompt, ''),
  'You are a domain-flexible assistant. Use only the provided project data tables to answer user queries. If data is missing, ask a clarifying question. Keep replies short, precise, and actionable.'
),
response_schema = COALESCE(response_schema, jsonb_build_object(
  'type', 'OBJECT',
  'properties', jsonb_build_object(
    'extractedData', jsonb_build_object('type', 'OBJECT'),
    'message', jsonb_build_object('type', 'STRING'),
    'nextAction', jsonb_build_object('type', 'STRING', 'nullable', true),
    'status', jsonb_build_object(
      'type', 'OBJECT',
      'properties', jsonb_build_object(
        'outcome', jsonb_build_object(
          'type', 'STRING',
          'enum', jsonb_build_array('SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'AMBIGUOUS')
        ),
        'reason', jsonb_build_object('type', 'STRING', 'nullable', true),
        'field', jsonb_build_object('type', 'STRING', 'nullable', true)
      ),
      'required', jsonb_build_array('outcome')
    ),
    'options', jsonb_build_object(
      'type', 'ARRAY',
      'items', jsonb_build_object('type', 'STRING'),
      'nullable', true
    ),
    'conversationSummary', jsonb_build_object('type', 'STRING', 'nullable', true)
  ),
  'required', jsonb_build_array(
    'extractedData', 'message', 'nextAction', 'status', 'options', 'conversationSummary'
  )
));

-- Seed generic ecommerce-style sample data for enabled/default project
WITH target_project AS (
  SELECT id FROM projects WHERE is_enabled = true ORDER BY created_at ASC LIMIT 1
), seeded AS (
  INSERT INTO project_data_tables (project_id, table_name, rows)
  SELECT id, 'products',
    jsonb_build_array(
      jsonb_build_object('id', 'p-100', 'name', 'Wireless Earbuds', 'category', 'Audio', 'price', 2499, 'stock', 32),
      jsonb_build_object('id', 'p-101', 'name', 'Mechanical Keyboard', 'category', 'Accessories', 'price', 3999, 'stock', 14),
      jsonb_build_object('id', 'p-102', 'name', '4K Monitor 27"', 'category', 'Displays', 'price', 24999, 'stock', 7)
    )
  FROM target_project
  ON CONFLICT(project_id, table_name)
  DO UPDATE SET rows = EXCLUDED.rows, updated_at = NOW()
  RETURNING 1
)
SELECT COUNT(*) FROM seeded;

WITH target_project AS (
  SELECT id FROM projects WHERE is_enabled = true ORDER BY created_at ASC LIMIT 1
), seeded AS (
  INSERT INTO project_data_tables (project_id, table_name, rows)
  SELECT id, 'orders',
    jsonb_build_array(
      jsonb_build_object('orderId', 'ORD-9001', 'status', 'shipped', 'eta', '2026-03-19', 'customer', 'Arun'),
      jsonb_build_object('orderId', 'ORD-9002', 'status', 'processing', 'eta', '2026-03-21', 'customer', 'Riya')
    )
  FROM target_project
  ON CONFLICT(project_id, table_name)
  DO UPDATE SET rows = EXCLUDED.rows, updated_at = NOW()
  RETURNING 1
)
SELECT COUNT(*) FROM seeded;
