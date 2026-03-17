import { API_ROUTES } from "@/constants/api-routes";
import type { Project } from "@/types/api";

import { BaseAPIService } from "@/services/api/http-client";

export class ProjectService extends BaseAPIService {
  async enableProject(projectId: string): Promise<Project> {
    try {
      const response = await this.http.post<{ project: Project }>(
        API_ROUTES.enableProject(projectId),
      );
      return response.data.project;
    } catch (error) {
      throw this.parseError(error);
    }
  }
}

export const projectService = new ProjectService();
