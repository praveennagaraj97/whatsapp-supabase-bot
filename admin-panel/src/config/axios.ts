"use client";

import axios, { type AxiosInstance } from "axios";

import { API_CONFIG, STORAGE_KEYS } from "@/constants/api-routes";

function createAxiosClient(baseUrl: string): AxiosInstance {
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_ADMIN_API_BASE_URL is not configured.");
  }

  const client = axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
    },
  });

  client.interceptors.request.use((config) => {
    if (typeof window === "undefined") {
      return config;
    }

    const token = localStorage.getItem(STORAGE_KEYS.adminToken) || "";
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  });

  return client;
}

export const apiClient = createAxiosClient(API_CONFIG.baseUrl);

export async function apiFetcher<T>(url: string): Promise<T> {
  const response = await apiClient.get<T>(url);
  return response.data;
}
