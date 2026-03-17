// Types for WhatsApp webhook payloads and internal message representation

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<WhatsAppMessage>;
        statuses?: Array<unknown>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type: string };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  interactive?: {
    type: string;
    list_reply?: { id: string; title: string };
    button_reply?: { id: string; title: string };
  };
  image?: { id: string; mime_type: string; caption?: string };
}

export interface SimplifiedMessage {
  type: "text" | "audio" | "location";
  from: string;
  waId: string;
  id?: string;
  text?: string;
  audioUrl?: string;
  audioId?: string;
  mimeType?: string;
  location?: {
    address: string;
    latitude: number;
    longitude: number;
    name: string;
  };
  timestamp: string;
  profileName?: string;
}

export interface ProjectConfig {
  id: string;
  name: string;
  slug: string;
  bot_name: string;
  description: string | null;
  system_prompt: string;
  welcome_message: string | null;
  response_schema: Record<string, unknown> | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  password_hash: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  project_id: string;
  user_id: string;
  user_name: string | null;
  user_phone: string | null;
  conversation_context: string;
  last_prompt_field: string | null;
  last_prompt_response: string | null;
  last_user_message: string | null;
  last_message_timestamp: string | null;
  conversation_summary: string | null;
  extracted_data: Record<string, unknown> | null;
  is_processing: boolean;
  processing_started_at: string | null;
  is_intro_sent: boolean;
  pause_auto_replies: boolean;
  created_at: string;
  updated_at: string;
}

export interface QueuedMessage {
  id: string;
  project_id: string;
  user_id: string;
  type: string;
  text: string | null;
  audio_url: string | null;
  audio_id: string | null;
  mime_type: string | null;
  location_address: string | null;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  message_id: string | null;
  timestamp: string;
  created_at: string;
}

export interface AIPromptResponse {
  extractedData: ExtractedData;
  message: string;
  nextAction: string | null; // 'book_doctor' | 'order_medicine' | 'show_doctors' | 'show_medicines' | 'faq' | 'confirm_appointment' | 'confirm_order' | null
  status: {
    outcome: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED" | "AMBIGUOUS";
    reason: string | null;
    field: string | null;
  };
  options: string[] | null;
  conversationSummary: string | null;
}

export type ExtractedData = Record<string, unknown>;

export interface InteractiveReplyButton {
  id: string;
  title: string;
}

export interface InteractiveListSection {
  title: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}
