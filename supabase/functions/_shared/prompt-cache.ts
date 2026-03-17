// Prompt file-based cache system
// Writes prompts to disk for fast reads, avoiding database queries on every message
import type { ProjectConfig } from "./types.ts";

const CACHE_DIR = "/tmp/prompts";
const ENABLED_PROJECT_FILE = `${CACHE_DIR}/enabled_project.json`;
const PROMPT_FILES_PREFIX = `${CACHE_DIR}/project`;

// In-memory cache to avoid repeated filesystem reads
const memoryCache = new Map<string, {
  systemPrompt: string;
  systemPromptTemplate: string;
  userPromptTemplate: string;
  responseSchema: Record<string, unknown>;
  generatedAt: number;
}>();

let enabledProjectCache: ProjectConfig | null = null;
let cacheInitialized = false;

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await Deno.stat(CACHE_DIR);
  } catch {
    // Directory doesn't exist, create it
    await Deno.mkdir(CACHE_DIR, { recursive: true });
  }
}

/**
 * Write prompt files for a project
 * Called when a project is enabled
 */
export async function cacheProjectPrompts(
  project: ProjectConfig,
): Promise<void> {
  await ensureCacheDir();

  const projectFile = `${PROMPT_FILES_PREFIX}_${project.id}.json`;

  // Write individual files for fast reading
  const cacheData = {
    projectId: project.id,
    systemPromptTemplate: project.system_prompt_template || "",
    userPromptTemplate: project.user_prompt_template || "",
    responseSchema: project.response_schema || {},
    systemPrompt: project.system_prompt || "",
    botName: project.bot_name || project.name,
    projectName: project.name,
    description: project.description || "",
    generatedAt: Date.now(),
  };

  await Deno.writeTextFile(projectFile, JSON.stringify(cacheData, null, 2));

  // Update enabled project marker
  const enabledMarker = {
    projectId: project.id,
    projectName: project.name,
    updatedAt: Date.now(),
  };

  await Deno.writeTextFile(ENABLED_PROJECT_FILE, JSON.stringify(enabledMarker, null, 2));

  // Update in-memory cache
  memoryCache.set(project.id, {
    systemPrompt: cacheData.systemPrompt,
    systemPromptTemplate: cacheData.systemPromptTemplate,
    userPromptTemplate: cacheData.userPromptTemplate,
    responseSchema: cacheData.responseSchema,
    generatedAt: cacheData.generatedAt,
  });

  enabledProjectCache = project;
  console.log(`✓ Cached prompts for project: ${project.name}`);
}

/**
 * Load project prompts from cache file
 */
export async function loadPromptFromCache(
  projectId: string,
): Promise<
  {
    systemPromptTemplate: string;
    userPromptTemplate: string;
    responseSchema: Record<string, unknown>;
    systemPrompt: string;
  } | null
> {
  // Check memory cache first
  if (memoryCache.has(projectId)) {
    const cached = memoryCache.get(projectId)!;
    return {
      systemPromptTemplate: cached.systemPromptTemplate,
      userPromptTemplate: cached.userPromptTemplate,
      responseSchema: cached.responseSchema,
      systemPrompt: cached.systemPrompt,
    };
  }

  try {
    const projectFile = `${PROMPT_FILES_PREFIX}_${projectId}.json`;
    const content = await Deno.readTextFile(projectFile);
    const data = JSON.parse(content);

    memoryCache.set(projectId, {
      systemPrompt: data.systemPrompt,
      systemPromptTemplate: data.systemPromptTemplate,
      userPromptTemplate: data.userPromptTemplate,
      responseSchema: data.responseSchema,
      generatedAt: data.generatedAt,
    });

    return {
      systemPromptTemplate: data.systemPromptTemplate,
      userPromptTemplate: data.userPromptTemplate,
      responseSchema: data.responseSchema,
      systemPrompt: data.systemPrompt,
    };
  } catch {
    return null; // File doesn't exist or can't be read
  }
}

/**
 * Get enabled project ID from cache file
 */
export async function getEnabledProjectIdFromCache(): Promise<string | null> {
  try {
    const content = await Deno.readTextFile(ENABLED_PROJECT_FILE);
    const data = JSON.parse(content);
    return data.projectId || null;
  } catch {
    return null; // File doesn't exist
  }
}

/**
 * Clear all cache files
 */
export async function clearPromptCache(): Promise<void> {
  memoryCache.clear();
  enabledProjectCache = null;

  try {
    await Deno.remove(CACHE_DIR, { recursive: true });
    await Deno.mkdir(CACHE_DIR, { recursive: true });
    console.log("✓ Cleared prompt cache");
  } catch {
    // Directory might not exist, that's ok
  }
}

/**
 * Initialize cache on server startup
 * Tries to load from cache files first, no database query needed
 */
export async function initializeCacheOnStartup(): Promise<void> {
  if (cacheInitialized) return;

  try {
    const enabledProjectId = await getEnabledProjectIdFromCache();
    if (enabledProjectId) {
      const cached = await loadPromptFromCache(enabledProjectId);
      if (cached) {
        cacheInitialized = true;
        console.log(`✓ Cache initialized for project: ${enabledProjectId}`);
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("Cache not yet available:", message);
  }

  cacheInitialized = true;
}

/**
 * Get cache stats (for debugging)
 */
export function getCacheStats(): {
  memoryCacheSize: number;
  cacheDir: string;
  initialized: boolean;
} {
  return {
    memoryCacheSize: memoryCache.size,
    cacheDir: CACHE_DIR,
    initialized: cacheInitialized,
  };
}
