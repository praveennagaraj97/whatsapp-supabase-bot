export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL?.trim() || "",
} as const;

export const API_ROUTES = {
  login: "/login",
  projects: "/projects",
  enableProject: (projectId: string) => `/projects/${projectId}/enable`,
} as const;

export const STORAGE_KEYS = {
  adminToken: "admin_token",
} as const;
