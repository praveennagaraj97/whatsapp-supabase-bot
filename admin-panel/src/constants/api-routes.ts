export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL?.trim() || "",
} as const;

export const API_ROUTES = {
  login: "/login",
  projects: "/projects",
  projectDetail: (projectId: string) => `/projects/${projectId}`,
  enableProject: (projectId: string) => `/projects/${projectId}/enable`,
  importProjectData: (projectId: string) => `/projects/${projectId}/import`,
  projectPrompts: (projectId: string) => `/projects/${projectId}/prompts`,
  updateProject: (projectId: string) => `/projects/${projectId}`,
  deleteProject: (projectId: string) => `/projects/${projectId}`,
} as const;

export const STORAGE_KEYS = {
  adminToken: "admin_token",
} as const;
