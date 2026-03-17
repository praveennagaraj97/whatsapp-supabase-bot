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

-- Note: no domain sample rows are seeded here.
