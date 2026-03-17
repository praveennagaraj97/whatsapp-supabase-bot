import { AxiosError, type AxiosInstance } from "axios";

import { apiClient } from "@/config/axios";

export class BaseAPIService {
  protected readonly http: AxiosInstance;

  constructor(http: AxiosInstance = apiClient) {
    this.http = http;
  }

  protected parseError(error: unknown): Error {
    if (error instanceof AxiosError) {
      const apiError = error.response?.data as { error?: string } | undefined;
      const message = apiError?.error || error.message;
      return new Error(message || "Request failed. Please try again.");
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error("Something went wrong. Please try again.");
  }
}
