import { issueAdminToken, requireAdminAuth, verifyAdminPassword } from "../_shared/admin-auth.ts";
import { clearKnowledgeBaseCache } from "../_shared/knowledge-base.ts";
import { clearProjectCache } from "../_shared/projects.ts";
import { clearPromptsCache, getResponseSchema } from "../_shared/prompts-manager.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";
import type { AdminUser, ProjectConfig } from "../_shared/types.ts";

const port = Number(Deno.env.get("PORT") || "8001");

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function getRoutePath(url: string): string {
  const pathname = new URL(url).pathname;
  const marker = "/admin";
  const markerIndex = pathname.indexOf(marker);

  if (markerIndex === -1) {
    return pathname || "/";
  }

  const routePath = pathname.slice(markerIndex + marker.length);
  return routePath || "/";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ensureString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function toNullableString(value: unknown): string | null {
  const normalized = ensureString(value);
  return normalized.length > 0 ? normalized : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function isMissingProjectDataTableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("project_data_tables") &&
    (normalized.includes("schema cache") ||
      normalized.includes("could not find the table") ||
      normalized.includes("does not exist"));
}

async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}

async function getProjectById(projectId: string): Promise<ProjectConfig> {
  const { data, error } = await getSupabaseClient()
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load project: ${error.message}`);
  }

  if (!data) {
    throw new Error("Project not found");
  }

  return data as ProjectConfig;
}

async function triggerWebhookCacheRefresh(): Promise<void> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const refreshUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/webhook/refresh-cache` : "";

  if (!refreshUrl) {
    return;
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(refreshUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "project_enabled" }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`Webhook cache refresh failed (${response.status}): ${text}`);
    }
  } catch (error) {
    console.warn("Failed to call webhook cache refresh endpoint:", error);
  }
}

async function setEnabledProject(projectId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error: disableError } = await supabase
    .from("projects")
    .update({ is_enabled: false })
    .neq("id", projectId);

  if (disableError) {
    throw new Error(`Failed to disable projects: ${disableError.message}`);
  }

  const { error: enableError } = await supabase
    .from("projects")
    .update({ is_enabled: true })
    .eq("id", projectId);

  if (enableError) {
    throw new Error(`Failed to enable project: ${enableError.message}`);
  }

  clearProjectCache();
  clearPromptsCache();
  await triggerWebhookCacheRefresh();
}

async function listProjects(): Promise<Response> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return errorResponse(`Failed to list projects: ${error.message}`, 500);
  }

  return jsonResponse({ projects: data || [] });
}

async function createProject(req: Request): Promise<Response> {
  const body = await parseJsonBody(req);
  const name = ensureString(body.name);

  if (!name) {
    return errorResponse("Project name is required", 400);
  }

  const slug = slugify(ensureString(body.slug) || name);
  if (!slug) {
    return errorResponse("Project slug is invalid", 400);
  }

  const payload = {
    name,
    slug,
    bot_name: ensureString(body.bot_name) || ensureString(body.botName) || name,
    description: toNullableString(body.description),
    system_prompt: ensureString(body.system_prompt) || ensureString(body.systemPrompt),
    welcome_message: toNullableString(body.welcome_message) ||
      toNullableString(body.welcomeMessage),
    is_enabled: false,
  };

  const { data, error } = await getSupabaseClient()
    .from("projects")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return errorResponse(`Failed to create project: ${error.message}`, 500);
  }

  const createdProject = data as ProjectConfig;

  if (toBoolean(body.is_enabled ?? body.isEnabled, false)) {
    await setEnabledProject(createdProject.id);
    createdProject.is_enabled = true;
  }

  return jsonResponse({ project: createdProject }, 201);
}

async function updateProject(projectId: string, req: Request): Promise<Response> {
  const body = await parseJsonBody(req);
  const updates: Record<string, unknown> = {};

  if ("name" in body) {
    const name = ensureString(body.name);
    if (!name) return errorResponse("Project name cannot be empty", 400);
    updates.name = name;
  }

  if ("slug" in body) {
    const slug = slugify(ensureString(body.slug));
    if (!slug) return errorResponse("Project slug is invalid", 400);
    updates.slug = slug;
  }

  if ("bot_name" in body || "botName" in body) {
    const botName = ensureString(body.bot_name) || ensureString(body.botName);
    if (!botName) return errorResponse("Bot name cannot be empty", 400);
    updates.bot_name = botName;
  }

  if ("description" in body) {
    updates.description = toNullableString(body.description);
  }

  if ("system_prompt" in body || "systemPrompt" in body) {
    updates.system_prompt = ensureString(body.system_prompt) || ensureString(body.systemPrompt);
  }

  if ("response_schema" in body || "responseSchema" in body) {
    const schema = body.response_schema || body.responseSchema;
    if (typeof schema === "object" && schema !== null) {
      updates.response_schema = schema;
    }
  }

  if ("welcome_message" in body || "welcomeMessage" in body) {
    updates.welcome_message = toNullableString(body.welcome_message) ||
      toNullableString(body.welcomeMessage);
  }

  const { data, error } = await getSupabaseClient()
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .select("*")
    .single();

  if (error) {
    return errorResponse(`Failed to update project: ${error.message}`, 500);
  }

  return jsonResponse({ project: data });
}

async function deleteProject(projectId: string): Promise<Response> {
  await getProjectById(projectId);

  const { error } = await getSupabaseClient()
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) {
    return errorResponse(`Failed to delete project: ${error.message}`, 500);
  }

  clearKnowledgeBaseCache(projectId);
  clearProjectCache();
  clearPromptsCache(projectId);

  return jsonResponse({ deleted: true, projectId });
}

async function login(req: Request): Promise<Response> {
  const body = await parseJsonBody(req);
  const email = ensureString(body.email).toLowerCase();
  const password = ensureString(body.password);

  if (!email || !password) {
    return errorResponse("Email and password are required", 400);
  }

  const { data, error } = await getSupabaseClient()
    .from("admin_users")
    .select("*")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return errorResponse(`Failed to authenticate: ${error.message}`, 500);
  }

  const admin = data as AdminUser | null;
  if (!admin) {
    return errorResponse("Invalid email or password", 401);
  }

  const isValidPassword = await verifyAdminPassword(password, admin.password_hash);
  if (!isValidPassword) {
    return errorResponse("Invalid email or password", 401);
  }

  await getSupabaseClient()
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", admin.id);

  const { token, expiresAt } = await issueAdminToken(admin);

  return jsonResponse({
    token,
    tokenType: "Bearer",
    expiresAt,
    admin: {
      id: admin.id,
      email: admin.email,
      fullName: admin.full_name,
    },
  });
}

async function importProjectData(
  projectId: string,
  req: Request,
): Promise<Response> {
  await getProjectById(projectId);
  const body = await parseJsonBody(req);
  const data = body.data && typeof body.data === "object"
    ? (body.data as Record<string, unknown>)
    : body;
  const replaceExisting = toBoolean(body.replaceExisting, false);

  const tableEntries = Object.entries(data).filter(([, value]) => Array.isArray(value));

  if (replaceExisting) {
    const { error: deleteError } = await getSupabaseClient()
      .from("project_data_tables")
      .delete()
      .eq("project_id", projectId);

    if (deleteError) {
      if (isMissingProjectDataTableError(deleteError.message)) {
        throw new Error(
          "Missing table public.project_data_tables. Run migration 20260317000002_generic_project_data_prompt.sql and redeploy admin/webhook functions.",
        );
      }
      throw new Error(`Failed to clear project_data_tables: ${deleteError.message}`);
    }
  }

  const imported: Record<string, number> = {};

  for (const [rawTableName, rawRows] of tableEntries) {
    const tableName = slugify(rawTableName).replace(/-/g, "_") || "table";
    const rows = (rawRows as unknown[])
      .filter((entry) => typeof entry === "object" && entry !== null)
      .map((entry) => entry as Record<string, unknown>);

    imported[tableName] = rows.length;

    const { error: upsertError } = await getSupabaseClient()
      .from("project_data_tables")
      .upsert(
        {
          project_id: projectId,
          table_name: tableName,
          rows,
        },
        { onConflict: "project_id,table_name" },
      );

    if (upsertError) {
      if (isMissingProjectDataTableError(upsertError.message)) {
        throw new Error(
          "Missing table public.project_data_tables. Run migration 20260317000002_generic_project_data_prompt.sql and redeploy admin/webhook functions.",
        );
      }
      throw new Error(`Failed to upsert ${tableName}: ${upsertError.message}`);
    }
  }

  clearKnowledgeBaseCache(projectId);
  clearProjectCache();

  return jsonResponse({
    projectId,
    imported,
    replaceExisting,
  });
}

async function getProject(projectId: string): Promise<Response> {
  const project = await getProjectById(projectId);
  return jsonResponse({ project });
}

async function getProjectDataTables(projectId: string): Promise<Response> {
  await getProjectById(projectId);

  const { data, error } = await getSupabaseClient()
    .from("project_data_tables")
    .select("table_name, rows, updated_at")
    .eq("project_id", projectId)
    .order("table_name", { ascending: true });

  if (error) {
    return errorResponse(`Failed to load project data tables: ${error.message}`, 500);
  }

  const tables = (data || []).map((entry) => ({
    tableName: entry.table_name,
    rowCount: Array.isArray(entry.rows) ? entry.rows.length : 0,
    updatedAt: entry.updated_at,
  }));

  return jsonResponse({ projectId, tables });
}

async function getAdminProfile(req: Request): Promise<Response> {
  const admin = await requireAdminAuth(req);
  return jsonResponse({
    admin: {
      id: admin.id,
      email: admin.email,
      fullName: admin.full_name,
      isActive: admin.is_active,
    },
  });
}

async function getProjectPrompts(projectId: string): Promise<Response> {
  const project = await getProjectById(projectId);
  const responseSchema = project.response_schema || await getResponseSchema(projectId);

  return jsonResponse({
    projectId: project.id,
    prompts: {
      systemPrompt: project.system_prompt || "",
      responseSchema: responseSchema,
    },
  });
}

async function updateProjectPrompts(
  projectId: string,
  req: Request,
): Promise<Response> {
  const project = await getProjectById(projectId);
  const body = await parseJsonBody(req);
  const updates: Record<string, unknown> = {};

  if ("system_prompt" in body || "systemPrompt" in body) {
    const prompt = ensureString(body.system_prompt) || ensureString(body.systemPrompt);
    if (prompt) {
      updates.system_prompt = prompt;
    }
  }

  if ("response_schema" in body || "responseSchema" in body) {
    const schema = body.response_schema || body.responseSchema;
    if (typeof schema === "object" && schema !== null) {
      updates.response_schema = schema;
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("No prompt fields to update", 400);
  }

  const { data, error } = await getSupabaseClient()
    .from("projects")
    .update(updates)
    .eq("id", projectId)
    .select("*")
    .single();

  if (error) {
    return errorResponse(`Failed to update prompts: ${error.message}`, 500);
  }

  clearPromptsCache(projectId);

  return jsonResponse({
    projectId: project.id,
    prompts: {
      systemPrompt: data.system_prompt || "",
      responseSchema: data.response_schema || await getResponseSchema(projectId),
    },
  });
}

Deno.serve({ port }, async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const routePath = getRoutePath(req.url);
  const segments = routePath.split("/").filter(Boolean);

  try {
    if (req.method === "POST" && segments.length === 1 && segments[0] === "login") {
      return await login(req);
    }

    await requireAdminAuth(req);

    if (req.method === "GET" && segments.length === 1 && segments[0] === "me") {
      return await getAdminProfile(req);
    }

    if (segments.length === 1 && segments[0] === "projects") {
      if (req.method === "GET") {
        return await listProjects();
      }

      if (req.method === "POST") {
        return await createProject(req);
      }
    }

    if (segments.length >= 2 && segments[0] === "projects") {
      const projectId = segments[1];

      if (segments.length === 2) {
        if (req.method === "GET") {
          return await getProject(projectId);
        }

        if (req.method === "PATCH") {
          return await updateProject(projectId, req);
        }

        if (req.method === "DELETE") {
          return await deleteProject(projectId);
        }
      }

      if (segments.length === 3 && segments[2] === "enable" && req.method === "POST") {
        await setEnabledProject(projectId);
        return await getProject(projectId);
      }

      if (segments.length === 3 && segments[2] === "import" && req.method === "POST") {
        return await importProjectData(projectId, req);
      }

      if (segments.length === 3 && segments[2] === "data" && req.method === "GET") {
        return await getProjectDataTables(projectId);
      }

      if (segments.length === 3 && segments[2] === "prompts") {
        if (req.method === "GET") {
          return await getProjectPrompts(projectId);
        }

        if (req.method === "PATCH") {
          return await updateProjectPrompts(projectId, req);
        }
      }
    }

    return errorResponse("Route not found", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("bearer token") ||
      message.includes("admin token") ||
      message.includes("inactive")
    ) {
      return errorResponse(message, 401);
    }

    if (message === "Project not found") {
      return errorResponse(message, 404);
    }

    console.error("Admin API error:", error);
    return errorResponse(message || "Internal server error", 500);
  }
});
