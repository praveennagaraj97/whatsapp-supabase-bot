// Prompt management - loads prompts from database or provides defaults
import { getSupabaseClient } from "./supabase-client.ts";
import type { ProjectConfig } from "./types.ts";

// Cache for prompt templates (invalidated when project is updated)
const promptCache = new Map<string, ProjectConfig>();

export async function getProjectPrompts(
  projectId: string,
): Promise<ProjectConfig> {
  // Check cache first
  if (promptCache.has(projectId)) {
    return promptCache.get(projectId)!;
  }

  // Fetch from database
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
      },
      message: { type: "STRING" },
      nextAction: {
        type: "STRING",
        nullable: true,
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
    },
    required: [
      "extractedData",
      "message",
      "nextAction",
      "status",
      "options",
      "conversationSummary",
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
