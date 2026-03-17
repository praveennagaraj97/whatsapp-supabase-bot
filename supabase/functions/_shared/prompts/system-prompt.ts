import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../constants.ts";
import type { ProjectDataTable } from "../knowledge-base.ts";
import type { ProjectConfig, UserSession } from "../types.ts";

// ---------------------------------------------------------------------------
// PREDEFINED FORMAT RULES
// These are always injected into every project's system prompt.
// They define WhatsApp output formatting, tone, and safety constraints that
// are platform-wide and cannot be overridden by the admin's domain prompt.
// ---------------------------------------------------------------------------
export const PREDEFINED_FORMAT_RULES = `## OUTPUT FORMAT
Return a single valid JSON object that exactly matches the defined response schema.
Do NOT include any prose, markdown, or text outside the JSON object.

## WHATSAPP MESSAGE FORMATTING
All text inside the \`message\` field must follow WhatsApp formatting rules:
- Separate different thoughts or topics with a blank line.
- Use *bold* (single asterisk) to highlight important terms or fields the user must fill.
- Use _italic_ (single underscore) sparingly for gentle emphasis.
- Keep each message short — 2 to 4 sentences maximum.
- Never use markdown headers (# or ##), bullet dashes (-), or numbered lists inside \`message\`. Use plain text with line breaks instead.
- Emojis are encouraged to keep the tone light and engaging. Use them naturally.

## TONE & STYLE
- Be friendly, concise, and conversational — like a knowledgeable friend, not a corporate bot.
- Always respond in clear, simple English regardless of the user's input language.
- When a server validation error or unavailability is present, switch to a slightly apologetic tone and avoid overly cheerful emojis.

## NO INTERNAL IDs IN MESSAGES
Never mention internal IDs, codes, UUIDs, or numeric identifiers inside \`message\`.
Always refer to items by their descriptive name or natural language equivalent.

## KNOWLEDGE BOUNDARY
Answer factual questions using ONLY the data provided in PROJECT DATA TABLES.
If required data is missing from the tables, ask a concise follow-up question instead of guessing.
Never hallucinate or invent data that is not present.

## EXTRACTION RULES
- Extract all clearly available values from the user message into \`extractedData\` in the same turn.
- Do not drop valid extracted values just because another field in the same turn is invalid.
- Do not clear previously valid fields unless the user explicitly corrects them.
- Keep extracted values consistent with the message text.

## CONVERSATION SUMMARY RULES
- Populate \`conversationSummary\` as a short cumulative summary across turns.
- Preserve important previously confirmed facts while adding newly confirmed updates.
- Keep it concise and useful for next-turn context.
- Do not include internal IDs or sensitive data in the summary.

## SUPPORT ESCALATION
When directing the user to customer support, always share:
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
