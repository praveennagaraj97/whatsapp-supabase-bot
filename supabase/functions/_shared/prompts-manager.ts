// Prompt management - loads prompts from file cache first, then database
import {
  loadPromptFromCache,
  initializeCacheOnStartup,
} from "./prompt-cache.ts";
import { getSupabaseClient } from "./supabase-client.ts";
import type { ProjectConfig } from "./types.ts";

// Cache for prompt templates (invalidated when project is updated)
const promptCache = new Map<string, ProjectConfig>();

export async function getProjectPrompts(
  projectId: string,
): Promise<ProjectConfig> {
  // Check memory cache first (fastest)
  if (promptCache.has(projectId)) {
    return promptCache.get(projectId)!;
  }

  // Initialize file cache on first request
  await initializeCacheOnStartup();

  // Check file cache (faster than DB)
  const cachedPrompt = await loadPromptFromCache(projectId);
  if (cachedPrompt) {
    // Reconstruct minimal ProjectConfig from cache
    const config: ProjectConfig = {
      id: projectId,
      name: "",
      slug: "",
      bot_name: "",
      system_prompt_template: cachedPrompt.systemPromptTemplate,
      user_prompt_template: cachedPrompt.userPromptTemplate,
      response_schema: cachedPrompt.responseSchema,
      system_prompt: cachedPrompt.systemPrompt,
    } as ProjectConfig;
    promptCache.set(projectId, config);
    return config;
  }

  // Fallback to database if cache miss
  const { data, error } = await getSupabaseClient()
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Failed to load project prompts: ${error?.message}`);
  }

  // Cache the result
  promptCache.set(projectId, data);
  return data;
}

export function clearPromptsCache(projectId?: string): void {
  if (projectId) {
    promptCache.delete(projectId);
  } else {
    promptCache.clear();
  }
}

/**
 * Get default response schema for Gemini structured output
 */
export function getDefaultResponseSchema(): Record<string, unknown> {
  return {
    type: "OBJECT",
    properties: {
      extractedData: {
        type: "OBJECT",
        properties: {
          symptoms: { type: "STRING", nullable: true },
          specialization: { type: "STRING", nullable: true },
          doctorId: { type: "STRING", nullable: true },
          doctorName: { type: "STRING", nullable: true },
          clinicId: { type: "STRING", nullable: true },
          clinicName: { type: "STRING", nullable: true },
          preferredDate: { type: "STRING", nullable: true },
          preferredTime: { type: "STRING", nullable: true },
          medicineIds: {
            type: "ARRAY",
            items: { type: "STRING" },
            nullable: true,
          },
          medicineNames: {
            type: "ARRAY",
            items: { type: "STRING" },
            nullable: true,
          },
          userName: { type: "STRING", nullable: true },
        },
        required: [
          "symptoms",
          "specialization",
          "doctorId",
          "doctorName",
          "clinicId",
          "clinicName",
          "preferredDate",
          "preferredTime",
          "medicineIds",
          "medicineNames",
          "userName",
        ],
      },
      message: { type: "STRING" },
      nextAction: {
        type: "STRING",
        nullable: true,
        enum: [
          "show_doctors",
          "show_medicines",
          "book_doctor",
          "confirm_appointment",
          "order_medicine",
          "confirm_order",
          "faq",
          "none",
        ],
      },
      status: {
        type: "OBJECT",
        properties: {
          outcome: {
            type: "STRING",
            enum: ["SUCCESS", "PARTIAL_SUCCESS", "FAILED", "AMBIGUOUS"],
          },
          reason: { type: "STRING", nullable: true },
          field: { type: "STRING", nullable: true },
        },
        required: ["outcome"],
      },
      options: {
        type: "ARRAY",
        items: { type: "STRING" },
        nullable: true,
      },
      conversationSummary: { type: "STRING", nullable: true },
      callFAQs: { type: "BOOLEAN" },
    },
    required: [
      "extractedData",
      "message",
      "nextAction",
      "status",
      "options",
      "conversationSummary",
      "callFAQs",
    ],
  };
}

/**
 * Get response schema for a project (from database or default)
 */
export async function getResponseSchema(
  projectId: string,
): Promise<Record<string, unknown>> {
  const project = await getProjectPrompts(projectId);
  return project.response_schema || getDefaultResponseSchema();
}

/**
 * Get system prompt template for a project
 * These templates support {{variable}} placeholders that get replaced at runtime
 */
export async function getSystemPromptTemplate(
  projectId: string,
): Promise<string> {
  const project = await getProjectPrompts(projectId);

  if (project.system_prompt_template) {
    return project.system_prompt_template;
  }

  // Fallback if not set
  return `You are **{{botName}}**, a friendly, empathetic, and knowledgeable healthcare assistant on WhatsApp for the project "{{projectName}}".

## YOUR ROLE
- Help patients discuss symptoms and get general health guidance
- Help book doctor appointments based on specialization and availability
- Help order medicines (OTC directly, prescription medicines need doctor approval)
- Answer health-related FAQs clearly and compassionately
- NEVER provide definitive medical diagnoses — always recommend consulting a doctor

## PERSONALITY
- Warm, caring, and professional — like a helpful hospital receptionist
- Use simple language, avoid medical jargon unless explaining
- Use WhatsApp formatting: *bold* for emphasis, _italic_ for gentle notes
- Keep messages concise — WhatsApp users prefer short messages

## KNOWLEDGE BASE RULES
- You have access to real-time data about doctors, clinics, medicines, and FAQs
- ONLY recommend doctors/medicines that exist in the provided data tables
- If a user asks about something not in your knowledge base, politely say you don't have that information

## EXTRACTION RULES
Extract from user messages:
- symptoms, specialization, doctorId/Name, clinicId/Name, preferredDate/Time, medicineIds/Names, userName
- Set nextAction to guide the response: show_doctors, show_medicines, book_doctor, confirm_appointment, order_medicine, faq, none

## SAFETY RULES
- For emergency symptoms (chest pain, difficulty breathing, severe bleeding): IMMEDIATELY recommend calling 108 (ambulance) or 112 (emergency)
- For prescription medicines: ALWAYS require doctor consultation
- NEVER suggest specific dosages — defer to doctor or medicine label`;
}

/**
 * Get user prompt template for a project
 * These templates support {{variable}} placeholders that get replaced at runtime
 */
export async function getUserPromptTemplate(
  projectId: string,
): Promise<string> {
  const project = await getProjectPrompts(projectId);

  if (project.user_prompt_template) {
    return project.user_prompt_template;
  }

  // Fallback if not set
  return `Current time: {{currentTime}}
Patient: {{userName}} (from {{userPhone}})
Project: {{projectName}} ({{botName}})
Context: {{conversationContext}}

## Conversation History
{{conversationHistory}}

## Session State
{{sessionState}}

## Knowledge Base
{{knowledgeBase}}

## User Input
Input Type: {{inputType}}
Message: {{userInput}}

Respond with valid JSON matching the required schema. Your "message" field is the WhatsApp response.`;
}
