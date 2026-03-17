export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  tokenType: string;
  expiresAt: string;
  admin: {
    id: string;
    email: string;
    fullName: string;
  };
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  bot_name: string;
  description: string | null;
  system_prompt: string;
  is_enabled: boolean;
  created_at?: string;
};

export type ProjectsResponse = {
  projects: Project[];
};

export type CreateProjectPayload = {
  name: string;
  slug?: string;
  bot_name?: string;
  description?: string;
  system_prompt?: string;
};

export type CreateProjectResponse = {
  project: Project;
};

export type ProjectImportPayload = {
  data: Record<string, Record<string, unknown>[]>;
  replaceExisting?: boolean;
};

export type ProjectImportResponse = {
  projectId: string;
  imported: Record<string, number>;
  replaceExisting: boolean;
};

export type ProjectPrompts = {
  systemPrompt: string;
  responseSchema: Record<string, unknown>;
};

export type ProjectPromptsResponse = {
  projectId: string;
  prompts: ProjectPrompts;
};

export type UpdateProjectPromptsPayload = {
  systemPrompt?: string;
  responseSchema?: Record<string, unknown>;
};
