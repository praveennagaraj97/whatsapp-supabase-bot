import { API_ROUTES } from "@/constants/api-routes";
import type {
  Project,
  ProjectDataTablesResponse,
  ProjectImportPayload,
  ProjectImportResponse,
  ProjectPromptsResponse,
  UpdateProjectPromptsPayload,
} from "@/types/api";

import { BaseAPIService } from "@/services/api/http-client";

export class ProjectDetailService extends BaseAPIService {
  async getProject(projectId: string): Promise<Project> {
    try {
      const response = await this.http.get<{ project: Project }>(
        API_ROUTES.projectDetail(projectId),
      );
      return response.data.project;
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async updateProject(projectId: string, payload: Partial<Project>): Promise<Project> {
    try {
      const response = await this.http.patch<{ project: Project }>(
        API_ROUTES.updateProject(projectId),
        payload,
      );
      return response.data.project;
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    try {
      await this.http.delete(API_ROUTES.deleteProject(projectId));
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async importProjectData(
    projectId: string,
    payload: ProjectImportPayload,
  ): Promise<ProjectImportResponse> {
    try {
      const response = await this.http.post<ProjectImportResponse>(
        API_ROUTES.importProjectData(projectId),
        payload,
      );
      return response.data;
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async getProjectDataTables(projectId: string): Promise<ProjectDataTablesResponse> {
    try {
      const response = await this.http.get<ProjectDataTablesResponse>(
        API_ROUTES.projectDataTables(projectId),
      );
      return response.data;
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async getProjectPrompts(projectId: string): Promise<ProjectPromptsResponse> {
    try {
      const response = await this.http.get<ProjectPromptsResponse>(
        API_ROUTES.projectPrompts(projectId),
      );
      return response.data;
    } catch (error) {
      throw this.parseError(error);
    }
  }

  async updateProjectPrompts(
    projectId: string,
    payload: UpdateProjectPromptsPayload,
  ): Promise<ProjectPromptsResponse> {
    try {
      const response = await this.http.patch<ProjectPromptsResponse>(
        API_ROUTES.projectPrompts(projectId),
        payload,
      );
      return response.data;
    } catch (error) {
      throw this.parseError(error);
    }
  }
}

export const projectDetailService = new ProjectDetailService();
