"use client";

import { API_ROUTES } from "@/constants/api-routes";
import type { ProjectsResponse } from "@/types/api";
import useSWR from "swr";

export function useProjects(enabled: boolean) {
  const key = enabled ? API_ROUTES.projects : null;

  return useSWR<ProjectsResponse>(key);
}
