import axios from "@/utils/axios";

type ApiEnvelope<T> = {
  code?: number;
  data: T;
  message?: string;
};

function unwrapData<T>(response: ApiEnvelope<T> | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as ApiEnvelope<T>).data;
  }
  return response as T;
}

export const PROJECT_MATERIAL_CATEGORIES = [
  "outline",
  "character",
  "world",
  "scene",
  "prop",
  "visual",
  "director",
  "music",
  "notes",
] as const;

export type ProjectMaterialCategory = (typeof PROJECT_MATERIAL_CATEGORIES)[number];
export type ProjectMaterialState = "ready" | "unsupported" | "failed" | "archived";

export interface ProjectMaterial {
  id: number;
  projectId: number;
  category: ProjectMaterialCategory;
  name: string;
  filePath: string;
  mime: string;
  ext: string;
  size: number;
  textPath?: string | null;
  textSize?: number | null;
  summary?: string | null;
  state: ProjectMaterialState;
  createTime: number;
  updateTime: number;
}

export interface ProjectMaterialReadResult {
  id: number;
  projectId: number;
  category?: ProjectMaterialCategory;
  name: string;
  content: string;
  offset: number;
  limit: number;
  size: number;
  eof: boolean;
}

export interface ProjectContextPack {
  id: number;
  projectId: number;
  targetType: "projectContextPack";
  targetId: "project";
  version: number;
  state: "complete";
  filePath: string;
  content: string;
  summary?: string;
  createTime?: number;
  updateTime?: number;
  size?: number;
  eof?: boolean;
  [key: string]: unknown;
}

export interface UploadProjectMaterialParams {
  projectId: number;
  category: ProjectMaterialCategory;
  name: string;
  base64Data?: string;
  textContent?: string;
  mime?: string;
}

export interface ProjectContextPackReviewIssue {
  severity: "info" | "warning";
  message: string;
  reason?: string;
}

export interface GenerateProjectContextPackParams {
  projectId: number;
  instruction?: string;
  previousContent?: string;
}

export function uploadProjectMaterial(params: UploadProjectMaterialParams) {
  return axios.post("/project/material/upload", params).then((response) => unwrapData<{ material: ProjectMaterial }>(response));
}

export function listProjectMaterials(params: { projectId: number; category?: ProjectMaterialCategory; includeArchived?: boolean }) {
  return axios.get("/project/material/list", { params }).then((response) => unwrapData<{ materials: ProjectMaterial[] }>(response));
}

export function readProjectMaterial(params: { projectId: number; id: number; offset?: number; limit?: number }) {
  return axios.get("/project/material/read", { params }).then((response) => unwrapData<ProjectMaterialReadResult>(response));
}

export function deleteProjectMaterial(params: { projectId: number; id: number }) {
  return axios.post("/project/material/delete", params).then((response) => unwrapData<{ id: number; archived: boolean }>(response));
}

export function generateProjectContextPack(params: GenerateProjectContextPackParams) {
  return axios
    .post("/project/contextPack/generate", params)
    .then((response) =>
      unwrapData<{
        contextPack: ProjectContextPack;
        content: string;
        review: {
          status: "passed";
          issues: ProjectContextPackReviewIssue[];
        };
      }>(response),
    );
}

export function getProjectContextPack(params: { projectId: number }) {
  return axios.get("/project/contextPack/get", { params }).then((response) => unwrapData<{ contextPack: ProjectContextPack | null }>(response));
}
