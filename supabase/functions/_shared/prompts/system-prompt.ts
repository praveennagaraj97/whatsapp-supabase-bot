import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../constants.ts";
import type { ProjectDataTable } from "../knowledge-base.ts";
import type { ProjectConfig, UserSession } from "../types.ts";

// ---------------------------------------------------------------------------
// PREDEFINED FORMAT RULES (Simplified)
// Platform-wide rules for output format, tone, and safety.
// Cannot be overridden by the admin's domain prompt.
// ---------------------------------------------------------------------------
export const PREDEFINED_FORMAT_RULES = `## OUTPUT
Return a valid JSON object matching the response schema. Do NOT add text outside JSON.

## MESSAGE RULES
- Keep messages short and friendly (2-4 sentences max).
- Write naturally spaced paragraphs. Insert a space after punctuation and use blank lines between topic shifts.
- Use *bold* for key terms users must fill.
- Separate topics with blank lines.
- Use plain text only — no markdown headers, bullets, or numbered lists.
- Emojis are OK for a light tone.
- Never include internal IDs or codes.

## DATA & ACCURACY
- Answer ONLY using data from PROJECT DATA TABLES.
- Never invent or guess data — ask users for missing info instead.
- Extract confirmed user inputs into extractedData.

## SUPPORT
Email: ${SUPPORT_EMAIL}  |  Phone: ${SUPPORT_PHONE}`;

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
    "",
    // ── 1. Always-on platform formatting rules ──
    PREDEFINED_FORMAT_RULES,
    "",
    // ── 2. Admin-configured domain behaviour ──
    "## DOMAIN SYSTEM PROMPT",
    basePrompt,
    "",
    // ── 3. Live runtime state ──
    "## RUNTIME CONTEXT",
    JSON.stringify(contextSummary, null, 2),
    "",
    // ── 4. Project data ──
    "## PROJECT DATA TABLES",
    JSON.stringify(dataTableSummary, null, 2),
  ].join("\n");
}
