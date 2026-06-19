import axios from "@/utils/axios";
import type {
  StoryAnnotation,
  StoryAnnotationCreateParams,
  StoryAnnotationStatus,
  StoryArtifact,
  StoryArtifactCreateParams,
  StoryArtifactListParams,
  StoryArtifactUpdateParams,
} from "@/types/story";

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

export function listStoryArtifacts(params: StoryArtifactListParams) {
  return axios.post("/story/artifact/list", params).then((response) => unwrapData<StoryArtifact[]>(response));
}

export function getStoryArtifactDetail(params: { id: number; projectId: number }) {
  return axios.post("/story/artifact/detail", params).then((response) => unwrapData<StoryArtifact>(response));
}

export function createStoryArtifact(params: StoryArtifactCreateParams) {
  return axios.post("/story/artifact/create", params).then((response) => unwrapData<StoryArtifact>(response));
}

export function updateStoryArtifact(params: StoryArtifactUpdateParams) {
  return axios.post("/story/artifact/update", params).then((response) => unwrapData<StoryArtifact>(response));
}

export function archiveStoryArtifact(params: { id: number; projectId: number }) {
  return axios.post("/story/artifact/archive", params).then((response) => unwrapData<StoryArtifact>(response));
}

export function publishStoryArtifactToScript(params: { id: number; projectId: number; scriptId?: number; title?: string }) {
  return axios
    .post("/story/artifact/publishToScript", params)
    .then((response) => unwrapData<{ scriptId: number; artifact: StoryArtifact }>(response));
}

export function listStoryAnnotations(params: { projectId: number; artifactId: number; status?: StoryAnnotationStatus }) {
  return axios.post("/story/annotation/list", params).then((response) => unwrapData<StoryAnnotation[]>(response));
}

export function createStoryAnnotation(params: StoryAnnotationCreateParams) {
  return axios.post("/story/annotation/create", params).then((response) => unwrapData<StoryAnnotation>(response));
}

export function updateStoryAnnotationStatus(params: { projectId: number; id: number; status: StoryAnnotationStatus }) {
  return axios.post("/story/annotation/updateStatus", params).then((response) => unwrapData<StoryAnnotation>(response));
}

export function batchUpdateStoryAnnotationStatus(params: { projectId: number; ids: number[]; status: StoryAnnotationStatus }) {
  return axios.post("/story/annotation/batchUpdateStatus", params).then((response) => unwrapData<StoryAnnotation[]>(response));
}
