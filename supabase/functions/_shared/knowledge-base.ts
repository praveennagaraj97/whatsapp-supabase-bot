// Knowledge base service — loads project data tables from Supabase
import { getSupabaseClient } from "./supabase-client.ts";

// Simple in-memory cache
const cache: Record<string, { data: unknown; expiry: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache[key];
  if (entry && entry.expiry > Date.now()) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache[key] = { data, expiry: Date.now() + CACHE_TTL_MS };
}

export function clearKnowledgeBaseCache(projectId?: string): void {
  if (!projectId) {
    for (const key of Object.keys(cache)) {
      delete cache[key];
    }
    return;
  }

  for (const key of Object.keys(cache)) {
    if (key.startsWith(`${projectId}:`)) {
      delete cache[key];
    }
  }
}

export interface ProjectDataTable {
  id: string;
  project_id: string;
  table_name: string;
  rows: Record<string, unknown>[];
  updated_at?: string;
}

export async function getProjectDataTables(projectId: string): Promise<ProjectDataTable[]> {
  const cacheKey = `${projectId}:project_data_tables`;
  const cached = getCached<ProjectDataTable[]>(cacheKey);
  if (cached) return cached;

  const { data } = await getSupabaseClient()
    .from("project_data_tables")
    .select("*")
    .eq("project_id", projectId)
    .order("table_name", { ascending: true });

  const result = ((data || []) as Array<Record<string, unknown>>).map((entry) => ({
    id: String(entry.id),
    project_id: String(entry.project_id),
    table_name: String(entry.table_name),
    rows: Array.isArray(entry.rows) ? (entry.rows as Record<string, unknown>[]) : [],
    updated_at: entry.updated_at ? String(entry.updated_at) : undefined,
  }));

  setCache(cacheKey, result);
  return result;
}

export function formatProjectDataTablesForPrompt(
  dataTables: ProjectDataTable[],
  maxRowsPerTable = 25,
): string {
  if (dataTables.length === 0) {
    return "No project data tables available.";
  }

  const formatted = dataTables.map((table) => {
    const rows = table.rows.slice(0, maxRowsPerTable);
    const preview = rows.length > 0 ? JSON.stringify(rows, null, 2) : "[]";

    return `## TABLE: ${table.table_name}\n${preview}`;
  });

  return formatted.join("\n\n");
}
