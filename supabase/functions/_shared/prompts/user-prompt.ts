// User prompt builder — assembles context for each AI call
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

export function buildUserPrompt(params: UserPromptParams): string {
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

  const greeting = isNewSession
    ? `Good ${timeOfDay()}! This is a NEW patient. Greet them warmly and ask how you can help.`
    : `Returning patient. Continue the conversation naturally.`;

  const currentTime = new Date().toISOString();

  return `
## CURRENT CONTEXT
- ${greeting}
- Active Project: ${project.name}
- Bot Name: ${project.bot_name}
- Current Time: ${currentTime}
- Input Type: ${inputType}
${
    isTranslatedFromAudio
      ? "- Note: This message was translated from audio (Indian language to English). The user spoke in their native language."
      : ""
  }

## SESSION STATE
${formatSessionState(session)}

${session.last_prompt_response ? `## LAST BOT MESSAGE\n${session.last_prompt_response}` : ""}

${session.conversation_summary ? `## CONVERSATION SUMMARY\n${session.conversation_summary}` : ""}

## AVAILABLE DOCTORS
${doctorsTable}

## AVAILABLE MEDICINES
${medicinesTable}

## FAQ KNOWLEDGE BASE
${faqsText}

## USER MESSAGE
${userInput}
`.trim();
}
