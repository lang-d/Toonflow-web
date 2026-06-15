export interface DreaminaQueueConfig {
  maxConcurrent?: number;
  pollInitialDelaySec?: number;
  pollMinIntervalSec?: number;
  pollMaxIntervalSec?: number;
  maxWaitHours?: number;
}

export interface DreaminaVideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: unknown[];
  audio: "optional" | boolean;
  durationResolutionMap: {
    duration: number[];
    resolution: string[];
  }[];
  queueConfig?: DreaminaQueueConfig;
  [key: string]: unknown;
}

export interface DreaminaQueueSummary {
  providerModelKey: string;
  configuredConcurrent: number;
  knownActive: number;
  confirming: number;
  processing: number;
  waiting: number;
  total: number;
  capacityBlocked: boolean;
  blockedUntil?: number;
  queueIndex?: number;
  queueLength?: number;
  lastProviderCode?: string;
}

export type DreaminaVideoQueueStatus = "queued" | "submitting" | "confirming" | "processing";

export interface DreaminaQueueTask {
  id: number;
  videoId: number;
  model: string;
  providerModelKey: string;
  providerAccountId?: string | null;
  submitId?: string | null;
  phase: string;
  status: DreaminaVideoQueueStatus;
  state: string;
  nextSubmitTime?: number | null;
  nextPollTime?: number | null;
  pollCount?: number | null;
  providerQueueStatus?: number | null;
  providerQueueIndex?: number | null;
  providerQueueLength?: number | null;
  startTime: number;
  updateTime: number;
}

export interface DreaminaQueueStatusData {
  summary: DreaminaQueueSummary[];
  tasks: DreaminaQueueTask[];
}

export function createEmptyDreaminaQueueStatus(): DreaminaQueueStatusData {
  return {
    summary: [],
    tasks: [],
  };
}
