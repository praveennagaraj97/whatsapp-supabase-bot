-- ============================================================
-- Add prompt management to projects
-- Enable dynamic prompts instead of static ones
-- ============================================================

-- Add prompt template columns to projects table
ALTER TABLE projects 
ADD COLUMN user_prompt_template TEXT,
ADD COLUMN system_prompt_template TEXT,
ADD COLUMN response_schema JSONB;

-- Default response schema based on ai-response-schema.ts
UPDATE projects
SET response_schema = jsonb_build_object(
  'type', 'OBJECT',
  'properties', jsonb_build_object(
    'extractedData', jsonb_build_object(
      'type', 'OBJECT',
      'properties', jsonb_build_object(
        'symptoms', jsonb_build_object('type', 'STRING', 'nullable', true),
        'specialization', jsonb_build_object('type', 'STRING', 'nullable', true),
        'doctorId', jsonb_build_object('type', 'STRING', 'nullable', true),
        'doctorName', jsonb_build_object('type', 'STRING', 'nullable', true),
        'clinicId', jsonb_build_object('type', 'STRING', 'nullable', true),
        'clinicName', jsonb_build_object('type', 'STRING', 'nullable', true),
        'preferredDate', jsonb_build_object('type', 'STRING', 'nullable', true),
        'preferredTime', jsonb_build_object('type', 'STRING', 'nullable', true),
        'medicineIds', jsonb_build_object(
          'type', 'ARRAY',
          'items', jsonb_build_object('type', 'STRING'),
          'nullable', true
        ),
        'medicineNames', jsonb_build_object(
          'type', 'ARRAY',
          'items', jsonb_build_object('type', 'STRING'),
          'nullable', true
        ),
        'userName', jsonb_build_object('type', 'STRING', 'nullable', true)
      ),
      'required', jsonb_build_array(
        'symptoms', 'specialization', 'doctorId', 'doctorName', 
        'clinicId', 'clinicName', 'preferredDate', 'preferredTime', 
        'medicineIds', 'medicineNames', 'userName'
      )
    ),
    'message', jsonb_build_object('type', 'STRING'),
    'nextAction', jsonb_build_object(
      'type', 'STRING',
      'nullable', true,
      'enum', jsonb_build_array(
        'show_doctors', 'show_medicines', 'book_doctor', 'confirm_appointment',
        'order_medicine', 'confirm_order', 'faq', 'none'
      )
    ),
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
    'conversationSummary', jsonb_build_object('type', 'STRING', 'nullable', true),
    'callFAQs', jsonb_build_object('type', 'BOOLEAN')
  ),
  'required', jsonb_build_array(
    'extractedData', 'message', 'nextAction', 'status', 'options', 'conversationSummary', 'callFAQs'
  )
)
WHERE response_schema IS NULL;

-- Default user prompt template
UPDATE projects
SET user_prompt_template = 'You are {{botName}} assisting in {{projectName}}. Understand the user need and extract relevant information from: {{knowledgeBase}}'
WHERE user_prompt_template IS NULL;

-- Default system prompt template 
UPDATE projects
SET system_prompt_template = 'You are healthcare assistant named {{botName}} for {{projectName}}. Follow interaction rules and never diagnose.'
WHERE system_prompt_template IS NULL;

-- Index for faster lookups
CREATE INDEX idx_projects_enabled_id ON projects (is_enabled, id);
