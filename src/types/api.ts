export interface ApiValidationIssue {
  path: string;
  message: string;
  code: string;
}

export interface ApiResponse<T> {
  code: number;
  data: T | null;
  message: string;
}

export type TaskStatus =
  | "pending"
  | "queued"
  | "submitting"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface MediaRef {
  id?: number | string;
  type: "image" | "video" | "audio" | "file";
  path: string;
  url: string;
  previewUrl?: string;
  mime?: string;
  name?: string;
  width?: number;
  height?: number;
  duration?: number;
  source?: "storyboard" | "assets" | "merged" | "local" | "generated" | "directorAsset";
  sourceId?: number | string;
}

export interface TaskResult {
  media?: MediaRef;
  mediaList?: MediaRef[];
  text?: string;
  historyId?: number;
  businessId?: number;
  [key: string]: unknown;
}

export interface AsyncTaskEnvelope {
  taskId: string;
  unifiedTaskId?: string;
  legacyTaskId?: number | string | null;
  status: TaskStatus | string;
  targetType: string;
  targetId?: number | string | null;
}

export interface TaskStatusEvent {
  eventId?: number;
  taskId: string;
  legacyTaskId?: number | string;
  version?: number;
  taskType: "image" | "asset" | "storyboard" | "video" | "prompt" | "audio" | "media" | string;
  projectId: number;
  scriptId?: number;
  targetType?: string;
  targetId?: string | number;
  /** Business object identity. For video generation this is the video candidate ID. */
  businessId?: string | number;
  nodeId?: string;
  status: TaskStatus;
  phase?: string;
  progress?: number | null;
  result?: TaskResult;
  reason?: string;
  updatedAt: number;
}
