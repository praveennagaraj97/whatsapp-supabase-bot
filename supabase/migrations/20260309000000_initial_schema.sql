-- ============================================================
-- MediBot WhatsApp Bot - Initial Schema
-- (Local copy of migration applied to Supabase)
-- ============================================================

CREATE TABLE user_sessions (
  user_id TEXT PRIMARY KEY,
  user_name TEXT,
  user_phone TEXT,
  last_prompt_field TEXT,
  last_prompt_response TEXT,
  last_user_message TEXT,
  last_message_timestamp TEXT,
  conversation_summary TEXT,
  doctor_id TEXT,
  doctor_name TEXT,
  clinic_id TEXT,
  clinic_name TEXT,
  specialization TEXT,
  preferred_date TEXT,
  preferred_time TEXT,
  symptoms TEXT,
  medicine_ids TEXT[],
  medicine_names TEXT[],
  is_processing BOOLEAN DEFAULT FALSE,
  processing_started_at TIMESTAMPTZ,
  is_intro_sent BOOLEAN DEFAULT FALSE,
  pause_auto_replies BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE queued_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'audio', 'location', 'image')),
  text TEXT,
  audio_url TEXT,
  audio_id TEXT,
  mime_type TEXT,
  location_address TEXT,
  location_name TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  message_id TEXT,
  timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_queued_messages_user_created ON queued_messages (user_id, created_at);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'audio', 'image', 'location')),
  message TEXT,
  audio_url TEXT,
  whatsapp_timestamp TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_user ON chat_messages (user_id, created_at);

CREATE TABLE inactivity_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('text', 'audio', 'location')),
  text TEXT,
  audio_url TEXT,
  audio_id TEXT,
  mime_type TEXT,
  message_id TEXT,
  timestamp TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE doctors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialization TEXT NOT NULL,
  clinic_id TEXT,
  clinic_name TEXT,
  experience_years INTEGER,
  qualification TEXT,
  available_days TEXT,
  available_time_start TEXT,
  available_time_end TEXT,
  consultation_fee NUMERIC,
  rating NUMERIC,
  languages TEXT,
  bio TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  operating_hours TEXT,
  specializations TEXT,
  rating NUMERIC,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE medicines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  generic_name TEXT,
  category TEXT,
  description TEXT,
  dosage_form TEXT,
  strength TEXT,
  price NUMERIC,
  requires_prescription BOOLEAN DEFAULT FALSE,
  manufacturer TEXT,
  in_stock BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('GENERAL', 'BOOKING', 'MEDICINE', 'PAYMENT', 'INSURANCE', 'EMERGENCY', 'CONSULTATION')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  doctor_id TEXT REFERENCES doctors(id),
  clinic_id TEXT REFERENCES clinics(id),
  appointment_date TEXT NOT NULL,
  appointment_time TEXT NOT NULL,
  symptoms TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE medicine_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  medicine_ids TEXT[],
  medicine_names TEXT[],
  quantities INTEGER[],
  total_amount NUMERIC,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  delivery_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_queued_messages_updated_at BEFORE UPDATE ON queued_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_medicine_orders_updated_at BEFORE UPDATE ON medicine_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE queued_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inactivity_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicine_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON user_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON queued_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON inactivity_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON doctors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON clinics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON medicines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON faqs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON appointments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON medicine_orders FOR ALL USING (true) WITH CHECK (true);
