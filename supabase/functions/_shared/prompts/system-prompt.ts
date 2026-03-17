// System prompt for MediBot - loaded from database
// Static hardcoded prompts are replaced by admin-managed templates
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../constants.ts";
import { getSystemPromptTemplate } from "../prompts-manager.ts";
import type { ProjectConfig, UserSession } from "../types.ts";

export async function getSystemPrompt(
  session: UserSession,
  project: ProjectConfig,
): Promise<string> {
  // Load template from database
  const template = await getSystemPromptTemplate(project.id);

  const contextInfo = session.conversation_context !== "general"
    ? `The user is currently in a "${session.conversation_context}" flow.`
    : "The user is in general conversation mode.";

  const projectPrompt = project.system_prompt?.trim()
    ? `

## PROJECT-SPECIFIC INSTRUCTIONS
${project.system_prompt.trim()}`
    : "";

  // Replace template placeholders
  let prompt = template
    .replace(/{{botName}}/g, project.bot_name || project.name)
    .replace(/{{projectName}}/g, project.name)
    .replace(/{{projectDescription}}/g, project.description || "")
    .replace(/{{supportEmail}}/g, SUPPORT_EMAIL)
    .replace(/{{supportPhone}}/g, SUPPORT_PHONE)
    .replace(/{{conversationContext}}/g, contextInfo)
    .replace(/{{projectInstructions}}/g, projectPrompt);

  return prompt.trim();
}
