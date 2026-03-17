-- Persist dynamic extracted AI fields across user conversation turns.

ALTER TABLE user_sessions
ADD COLUMN IF NOT EXISTS extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb;
