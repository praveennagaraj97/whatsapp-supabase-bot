// User prompt builder — loads template from file cache (fast) or database (fallback)
// Prompts are cached to /tmp when project is enabled for optimal performance
// Assembles context for each AI call with runtime values (time, session state, KB)
import { getUserPromptTemplate } from "../prompts-manager.ts";
import type { ProjectConfig, UserSession } from "../types.ts";

interface UserPromptParams {
  userInput: string;
  inputType: "text" | "audio" | "location";
  project: ProjectConfig;
  session: UserSession;
  isNewSession: boolean;
  doctorsTable: string;
  medicinesTable: string;
  faqsText: string;
  isTranslatedFromAudio: boolean;
}

function timeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function formatSessionState(session: UserSession): string {
  const parts: string[] = [];

  if (session.user_name) parts.push(`Patient Name: ${session.user_name}`);
  if (session.symptoms) parts.push(`Symptoms: ${session.symptoms}`);
  if (session.specialization) {
    parts.push(`Specialization: ${session.specialization}`);
  }
  if (session.doctor_name) {
    parts.push(
      `Selected Doctor: ${session.doctor_name} (${session.doctor_id})`,
    );
  }
  if (session.clinic_name) {
    parts.push(`Selected Clinic: ${session.clinic_name}`);
  }
  if (session.preferred_date) {
    parts.push(`Preferred Date: ${session.preferred_date}`);
  }
  if (session.preferred_time) {
    parts.push(`Preferred Time: ${session.preferred_time}`);
  }
  if (session.medicine_names?.length) {
    parts.push(`Medicines: ${session.medicine_names.join(", ")}`);
  }
  if (
    session.conversation_context &&
    session.conversation_context !== "general"
  ) {
    parts.push(`Current Flow: ${session.conversation_context}`);
  }

  return parts.length > 0 ? parts.join("\n") : "No booking data yet.";
}

export async function buildUserPrompt(params: UserPromptParams): Promise<string> {
  const {
    userInput,
    inputType,
    project,
    session,
    isNewSession,
    doctorsTable,
    medicinesTable,
    faqsText,
    isTranslatedFromAudio,
  } = params;

  // Load template from database
  const template = await getUserPromptTemplate(project.id);

  const greeting = isNewSession
    ? `Good ${timeOfDay()}! This is a NEW patient. Greet them warmly and ask how you can help.`
    : `Returning patient. Continue the conversation naturally.`;

  const currentTime = new Date().toISOString();
  const sessionState = formatSessionState(session);
  const conversationHistory = session.conversation_summary
    ? `## CONVERSATION SUMMARY\n${session.conversation_summary}`
    : "No conversation history yet.";
  const lastMessage = session.last_prompt_response
    ? `## LAST BOT MESSAGE\n${session.last_prompt_response}`
    : "No previous messages.";

  const knowledgeBase =
    `## AVAILABLE DOCTORS\n${doctorsTable}\n\n## AVAILABLE MEDICINES\n${medicinesTable}\n\n## FAQ KNOWLEDGE BASE\n${faqsText}`;

  // Replace template placeholders
  let prompt = template
    .replace(/{{botName}}/g, project.bot_name || project.name)
    .replace(/{{projectName}}/g, project.name)
    .replace(/{{currentTime}}/g, currentTime)
    .replace(/{{inputType}}/g, inputType)
    .replace(/{{userName}}/g, session.user_name || "Patient")
    .replace(/{{userPhone}}/g, session.user_phone || "Unknown")
    .replace(/{{conversationContext}}/g, isNewSession ? "new_session" : "existing_session")
    .replace(/{{sessionState}}/g, sessionState)
    .replace(/{{conversationHistory}}/g, conversationHistory)
    .replace(/{{lastMessage}}/g, lastMessage)
    .replace(/{{knowledgeBase}}/g, knowledgeBase)
    .replace(/{{userInput}}/g, userInput)
    .replace(/{{isTranslatedFromAudio}}/g, isTranslatedFromAudio ? "true" : "false")
    .replace(
      /{{audioNote}}/g,
      isTranslatedFromAudio
        ? "Note: This message was translated from audio (Indian language to English). The user spoke in their native language."
        : "Message received as text.",
    );

  return prompt.trim();
}
