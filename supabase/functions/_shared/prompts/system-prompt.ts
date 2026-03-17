import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../constants.ts";
import type { ProjectDataTable } from "../knowledge-base.ts";
import type { ProjectConfig, UserSession } from "../types.ts";

export async function getSystemPrompt(
  session: UserSession,
  project: ProjectConfig,
  dataTables: ProjectDataTable[],
  userInput: string,
  inputType: "text" | "audio" | "location",
  isTranslatedFromAudio: boolean,
): Promise<string> {
  const basePrompt = project.system_prompt?.trim() ||
    "You are a helpful project assistant. Use the provided project data tables to answer accurately.";

  const contextSummary = {
    conversationContext: session.conversation_context || "general",
    conversationSummary: session.conversation_summary || null,
    extractedData: session.extracted_data || {},
    userName: session.user_name || null,
    inputType,
    isTranslatedFromAudio,
    userInput,
  };

  const dataTableSummary = dataTables.map((table) => ({
    tableName: table.table_name,
    rows: table.rows,
  }));

  return [
    `You are ${project.bot_name || project.name} for project "${project.name}".`,
    "Use the configured system prompt below as your primary behavior source.",
    "",
    "## SYSTEM PROMPT",
    basePrompt,
    "",
    "## RUNTIME CONTEXT",
    JSON.stringify(contextSummary, null, 2),
    "",
    "## PROJECT DATA TABLES",
    JSON.stringify(dataTableSummary, null, 2),
    "",
    "## RESPONSE RULES",
    "- Use only project data tables provided above when answering factual data questions.",
    "- If data is missing, ask a concise follow-up question.",
    "- Keep responses suitable for WhatsApp (short and clear).",
    `- If user asks for support escalation, share: ${SUPPORT_EMAIL} / ${SUPPORT_PHONE}`,
  ].join("\n");
}
