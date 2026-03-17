import { API_ROUTES } from "@/constants/api-routes";
import type { CreateProjectPayload, CreateProjectResponse, Project } from "@/types/api";

import { BaseAPIService } from "@/services/api/http-client";

export class ProjectService extends BaseAPIService {
  async createProject(payload: CreateProjectPayload): Promise<Project> {
    try {
      const response = await this.http.post<CreateProjectResponse>(
        API_ROUTES.projects,
        payload,
      );
      return response.data.project;
    } catch (error) {
      throw this.parseError(error);
    }
  }

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
