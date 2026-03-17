import { getSupabaseClient } from "./supabase-client.ts";
import type { ProjectConfig } from "./types.ts";

export function clearProjectCache(): void {
  // No-op for now. Kept for symmetry with other cache helpers.
}

export async function getEnabledProject(): Promise<ProjectConfig> {
  const { data, error } = await getSupabaseClient()
    .from("projects")
    .select("*")
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load enabled project: ${error.message}`);
  }

  if (!data) {
    throw new Error("No enabled project found. Enable one project from the admin API.");
  }

  return data as ProjectConfig;
}
