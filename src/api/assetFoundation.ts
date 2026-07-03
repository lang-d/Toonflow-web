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

export type AssetFoundationType = "role" | "scene" | "tool";
export type AssetFoundationMode = "selected" | "missingOnly" | "all";

export interface GenerateAssetFoundationParams {
  projectId: number;
  assetIds?: number[];
  type?: AssetFoundationType;
  mode?: AssetFoundationMode;
  instruction?: string;
  overwrite?: boolean;
  generatePrompt?: boolean;
}

export interface AssetFoundationTask {
  assetId: number;
  taskId: string;
  legacyTaskId: number;
}

export interface AssetFoundationSkipped {
  assetId?: number;
  reason: string;
}

export interface GenerateAssetFoundationResult {
  total: number;
  tasks: AssetFoundationTask[];
  skipped: AssetFoundationSkipped[];
}

export function generateAssetFoundation(params: GenerateAssetFoundationParams) {
  return axios.post("/assets/foundation/generate", params).then((response) => unwrapData<GenerateAssetFoundationResult>(response));
}
