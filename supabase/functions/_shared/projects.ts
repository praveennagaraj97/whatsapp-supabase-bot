import { getSupabaseClient } from "./supabase-client.ts";
import type { ProjectConfig } from "./types.ts";

let enabledProjectCache: ProjectConfig | null = null;
let enabledProjectPromptCache = "";
let enabledProjectLoadPromise: Promise<ProjectConfig | null> | null = null;

export function clearProjectCache(): void {
  enabledProjectCache = null;
  enabledProjectPromptCache = "";
  enabledProjectLoadPromise = null;
}

async function loadEnabledProjectFromDb(): Promise<ProjectConfig | null> {
  if (enabledProjectLoadPromise) {
    return enabledProjectLoadPromise;
  }

  enabledProjectLoadPromise = (async () => {
    const { data, error } = await getSupabaseClient()
      .from("projects")
      .select("*")
      .eq("is_enabled", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load enabled project: ${error.message}`);
    }

    enabledProjectCache = (data as ProjectConfig | null) || null;
    enabledProjectPromptCache = enabledProjectCache?.system_prompt?.trim() || "";
    return enabledProjectCache;
  })();

  try {
    return await enabledProjectLoadPromise;
  } finally {
    enabledProjectLoadPromise = null;
  }
}

export async function warmEnabledProjectCache(): Promise<void> {
  await loadEnabledProjectFromDb();
}

export async function getEnabledProjectPrompt(): Promise<string> {
  if (enabledProjectPromptCache) {
    return enabledProjectPromptCache;
  }

  try {
    const project = await getEnabledProject();
    enabledProjectPromptCache = project.system_prompt?.trim() || "";
    return enabledProjectPromptCache;
  } catch {
    // Fallback to empty prompt when DB has no enabled project or prompt is unavailable.
    return "";
  }
}

export async function getEnabledProject(): Promise<ProjectConfig> {
  if (enabledProjectCache) {
    return enabledProjectCache;
  }

  const data = await loadEnabledProjectFromDb();

  if (!data) {
    throw new Error("No enabled project found. Enable one project from the admin API.");
  }

  return data;
}

export function getEnabledProjectFromMemory(): ProjectConfig | null {
  return enabledProjectCache;
}

export function getEnabledProjectPromptFromMemory(): string {
  return enabledProjectPromptCache;
}
