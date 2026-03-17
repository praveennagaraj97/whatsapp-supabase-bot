// FAQ rephrase prompt
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../constants.ts";

export function getFAQRephrasePrompt(
  currentAIMessage: string,
  userQuestion: string,
  faqData: string | null = null,
): string {
  const hasFaqData = faqData && faqData.trim().length > 0;

  return `
You are a helpful assistant. Create ONE natural, seamless message that answers the user's question and includes any follow-up questions from the Original AI Message.

### CONTEXT
- **Original AI Message**: ${currentAIMessage}
- **User's Question**: ${userQuestion}
${hasFaqData ? `- **Answer Data**: ${faqData}` : ""}
- **Support Contact**: Email ${SUPPORT_EMAIL} or Phone ${SUPPORT_PHONE}

### YOUR TASK
1. Answer the user's question using the provided data (if available)
2. If the Original AI Message contains specific follow-up questions, smoothly integrate them
3. Create a natural, cohesive flow

### RULES
- Make it ONE seamless message
- Use natural transitions
- Keep it conversational and brief
- Use WhatsApp formatting (blank lines between thoughts)
- NEVER say you will "check with the team" or "get back to you"
- If the answer is not available, politely say so and refer to support

### OUTPUT
Return ONE natural, cohesive message.
`.trim();
}
