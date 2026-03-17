"use client";

import { apiFetcher } from "@/config/axios";
import { API_ROUTES } from "@/constants/api-routes";
import type { Project } from "@/types/api";
import useSWR from "swr";

export function useProjectDetail(projectId: string | null) {
  const key = projectId ? API_ROUTES.projectDetail(projectId) : null;

  return useSWR<{ project: Project }>(key, apiFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: true,
  });
}
