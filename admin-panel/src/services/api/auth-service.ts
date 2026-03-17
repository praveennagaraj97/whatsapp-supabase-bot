import { API_ROUTES } from "@/constants/api-routes";
import type { LoginRequest, LoginResponse } from "@/types/api";

import { BaseAPIService } from "@/services/api/http-client";

export class AuthService extends BaseAPIService {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    try {
      const response = await this.http.post<LoginResponse>(API_ROUTES.login, payload);
      return response.data;
    } catch (error) {
      throw this.parseError(error);
    }
  }
}

export const authService = new AuthService();
