import { issueAdminToken, requireAdminAuth, verifyAdminPassword } from "../_shared/admin-auth.ts";
import { clearKnowledgeBaseCache } from "../_shared/knowledge-base.ts";
import { clearProjectCache } from "../_shared/projects.ts";
import { clearPromptsCache, getResponseSchema } from "../_shared/prompts-manager.ts";
import { getSupabaseClient } from "../_shared/supabase-client.ts";
import type { AdminUser, ProjectConfig } from "../_shared/types.ts";

const port = Number(Deno.env.get("PORT") || "8001");

const FAQ_CATEGORIES = new Set([
  "GENERAL",
  "BOOKING",
  "MEDICINE",
  "PAYMENT",
  "INSURANCE",
  "EMERGENCY",
  "CONSULTATION",
]);

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
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

function normalizeSourceId(rawValue: unknown, fallback: string): string {
  const explicit = ensureString(rawValue);
  if (explicit) return slugify(explicit);
  return slugify(fallback) || crypto.randomUUID();
}

function makeScopedId(
  projectSlug: string,
  prefix: string,
  sourceId: string,
): string {
  return `${projectSlug}_${prefix}_${sourceId}`.slice(0, 120);
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

async function upsertBatch(
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;

  const batchSize = 50;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await getSupabaseClient()
      .from(tableName)
      .upsert(batch, { onConflict: "project_id,source_id" });

    if (error) {
      throw new Error(`Failed to upsert ${tableName}: ${error.message}`);
    }
  }
}

async function maybeClearTable(
  tableName: string,
  projectId: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from(tableName)
    .delete()
    .eq("project_id", projectId);

  if (error) {
    throw new Error(`Failed to clear ${tableName}: ${error.message}`);
  }
}

async function importProjectData(
  projectId: string,
  req: Request,
): Promise<Response> {
  const project = await getProjectById(projectId);
  const body = await parseJsonBody(req);
  const data = body.data && typeof body.data === "object"
    ? (body.data as Record<string, unknown>)
    : body;
  const replaceExisting = toBoolean(body.replaceExisting, false);

  const hasClinics = "clinics" in data;
  const hasDoctors = "doctors" in data;
  const hasMedicines = "medicines" in data;
  const hasFaqs = "faqs" in data;

  const clinicsInput = Array.isArray(data.clinics) ? data.clinics : [];
  const doctorsInput = Array.isArray(data.doctors) ? data.doctors : [];
  const medicinesInput = Array.isArray(data.medicines) ? data.medicines : [];
  const faqsInput = Array.isArray(data.faqs) ? data.faqs : [];

  const clinicMap = new Map<string, { id: string; name: string }>();

  const clinics = clinicsInput.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const sourceId = normalizeSourceId(
      item.id ?? item.source_id,
      item.name ? String(item.name) : `clinic-${index + 1}`,
    );
    const id = makeScopedId(project.slug, "clinic", sourceId);
    const name = ensureString(item.name) || `Clinic ${index + 1}`;
    clinicMap.set(sourceId, { id, name });

    return {
      id,
      project_id: project.id,
      source_id: sourceId,
      name,
      address: toNullableString(item.address),
      city: toNullableString(item.city),
      phone: toNullableString(item.phone),
      email: toNullableString(item.email),
      operating_hours: toNullableString(item.operating_hours) ||
        toNullableString(item.operatingHours),
      specializations: toNullableString(item.specializations),
      rating: toNullableNumber(item.rating),
      is_active: toBoolean(item.is_active ?? item.isActive, true),
    };
  });

  const doctors = doctorsInput.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const sourceId = normalizeSourceId(
      item.id ?? item.source_id,
      item.name ? String(item.name) : `doctor-${index + 1}`,
    );
    const id = makeScopedId(project.slug, "doctor", sourceId);
    const clinicSourceId = normalizeSourceId(
      item.clinic_id ?? item.clinic_source_id ?? item.clinicId,
      ensureString(item.clinic_name) || `clinic-${index + 1}`,
    );
    const clinic = clinicMap.get(clinicSourceId);

    return {
      id,
      project_id: project.id,
      source_id: sourceId,
      name: ensureString(item.name) || `Doctor ${index + 1}`,
      specialization: ensureString(item.specialization) || "General Medicine",
      clinic_id: clinic?.id || makeScopedId(project.slug, "clinic", clinicSourceId),
      clinic_name: ensureString(item.clinic_name) || clinic?.name || null,
      experience_years: toNullableNumber(item.experience_years ?? item.experienceYears),
      qualification: toNullableString(item.qualification),
      available_days: toNullableString(item.available_days) || toNullableString(item.availableDays),
      available_time_start: toNullableString(item.available_time_start) ||
        toNullableString(item.availableTimeStart),
      available_time_end: toNullableString(item.available_time_end) ||
        toNullableString(item.availableTimeEnd),
      consultation_fee: toNullableNumber(item.consultation_fee ?? item.consultationFee),
      rating: toNullableNumber(item.rating),
      languages: toNullableString(item.languages),
      bio: toNullableString(item.bio),
      is_active: toBoolean(item.is_active ?? item.isActive, true),
    };
  });

  const medicines = medicinesInput.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const sourceId = normalizeSourceId(
      item.id ?? item.source_id,
      item.name ? String(item.name) : `medicine-${index + 1}`,
    );
    return {
      id: makeScopedId(project.slug, "medicine", sourceId),
      project_id: project.id,
      source_id: sourceId,
      name: ensureString(item.name) || `Medicine ${index + 1}`,
      generic_name: toNullableString(item.generic_name) || toNullableString(item.genericName),
      category: toNullableString(item.category),
      description: toNullableString(item.description),
      dosage_form: toNullableString(item.dosage_form) || toNullableString(item.dosageForm),
      strength: toNullableString(item.strength),
      price: toNullableNumber(item.price),
      requires_prescription: toBoolean(
        item.requires_prescription ?? item.requiresPrescription,
        false,
      ),
      manufacturer: toNullableString(item.manufacturer),
      in_stock: toBoolean(item.in_stock ?? item.inStock, true),
    };
  });

  const faqs = faqsInput.map((entry, index) => {
    const item = entry as Record<string, unknown>;
    const sourceId = normalizeSourceId(
      item.id ?? item.source_id,
      item.question ? String(item.question) : `faq-${index + 1}`,
    );
    const rawCategory = ensureString(item.category).toUpperCase() || "GENERAL";
    return {
      project_id: project.id,
      source_id: sourceId,
      category: FAQ_CATEGORIES.has(rawCategory) ? rawCategory : "GENERAL",
      question: ensureString(item.question) || `FAQ ${index + 1}`,
      answer: ensureString(item.answer) || "Answer not provided.",
      is_active: toBoolean(item.is_active ?? item.isActive, true),
    };
  });

  if (replaceExisting) {
    if (hasDoctors) await maybeClearTable("doctors", project.id);
    if (hasClinics) await maybeClearTable("clinics", project.id);
    if (hasMedicines) await maybeClearTable("medicines", project.id);
    if (hasFaqs) await maybeClearTable("faqs", project.id);
  }

  await upsertBatch("clinics", clinics);
  await upsertBatch("doctors", doctors);
  await upsertBatch("medicines", medicines);
  await upsertBatch("faqs", faqs);

  clearKnowledgeBaseCache(project.id);
  clearProjectCache();

  return jsonResponse({
    projectId: project.id,
    imported: {
      clinics: clinics.length,
      doctors: doctors.length,
      medicines: medicines.length,
      faqs: faqs.length,
    },
    replaceExisting,
  });
}

async function getProject(projectId: string): Promise<Response> {
  const project = await getProjectById(projectId);
  return jsonResponse({ project });
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
      systemPromptTemplate: project.system_prompt_template || null,
      userPromptTemplate: project.user_prompt_template || null,
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

  if ("system_prompt_template" in body || "systemPromptTemplate" in body) {
    const template = ensureString(body.system_prompt_template) ||
      ensureString(body.systemPromptTemplate);
    if (template) {
      updates.system_prompt_template = template;
    }
  }

  if ("user_prompt_template" in body || "userPromptTemplate" in body) {
    const template = ensureString(body.user_prompt_template) ||
      ensureString(body.userPromptTemplate);
    if (template) {
      updates.user_prompt_template = template;
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
      systemPromptTemplate: data.system_prompt_template || null,
      userPromptTemplate: data.user_prompt_template || null,
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
      }

      if (segments.length === 3 && segments[2] === "enable" && req.method === "POST") {
        await setEnabledProject(projectId);
        return await getProject(projectId);
      }

      if (segments.length === 3 && segments[2] === "import" && req.method === "POST") {
        return await importProjectData(projectId, req);
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
