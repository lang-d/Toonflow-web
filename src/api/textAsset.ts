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

export interface TextAssetContentParams {
  projectId: number;
  id: number;
  offset?: number;
  limit?: number;
}

export interface TextAssetContentResult {
  content: string;
  size: number;
  eof: boolean;
}

export function getTextAssetContent(params: TextAssetContentParams) {
  return axios.post("/textAsset/getContent", params).then((response) => unwrapData<TextAssetContentResult>(response));
}
