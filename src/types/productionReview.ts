export type ProductionReviewSeverity = "info" | "warning" | "blocking";

export type ProductionReviewStatus = "open" | "accepted" | "ignored" | "revised" | "resolved";

export type ProductionReviewTargetType =
  | "directorPlan"
  | "asset"
  | "deriveAsset"
  | "storyboardTable"
  | "storyboard"
  | "storyboardGroup"
  | "storyboardImage"
  | "videoPrompt"
  | "bgmSuggestion"
  | "videoResult"
  | "musicBible"
  | "musicPlan"
  | "musicCue"
  | "musicPrompt";

export type ProductionReviewState = "pending" | "passed" | "hasIssues" | "blocked";

export interface ProductionReviewPatch {
  path?: string;
  values?: Record<string, unknown>;
  previousValues?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProductionReviewSuggestion {
  id: number;
  projectId: number;
  scriptId?: number | null;
  targetType: ProductionReviewTargetType;
  targetId: string | number;
  parentId?: string | number | null;
  version?: number | string | null;
  issueType: string;
  severity: ProductionReviewSeverity;
  message: string;
  evidence?: unknown;
  reason?: string | null;
  proposedAction?: string | null;
  proposedPatch?: ProductionReviewPatch | null;
  status: ProductionReviewStatus;
  createTime?: number | string | null;
  updateTime?: number | string | null;
}

export interface TrackBgmSuggestion {
  groupKey?: string;
  mood?: string;
  intensity?: 1 | 2 | 3 | 4 | 5;
  tempoBpm?: number | null;
  rhythm?: string;
  instrumentation?: string[];
  entryPoint?: string;
  exitPoint?: string;
  syncPoints?: string[];
  avoid?: string[];
  postNote?: string;
}

export interface StoryboardGroupPlan {
  groupKey?: string;
  groupName?: string;
  groupIntent?: string;
  beatId?: string;
  storyboardIds?: number[];
  [key: string]: unknown;
}

export interface ReviewListParams {
  projectId: number;
  scriptId?: number;
  targetType?: ProductionReviewTargetType;
  targetId?: string | number;
  status?: ProductionReviewStatus;
}

export interface ResolveProductionReviewBatchParams {
  projectId: number;
  scriptId?: number;
  targetType: "videoPrompt";
  targetId: number;
  actions: Array<{
    suggestionId: number;
    action: "accept" | "revise" | "ignore";
    instruction?: string;
  }>;
  userInstruction?: string;
}

export interface ResolveProductionReviewBatchResult {
  revision?: {
    prompt?: string;
    [key: string]: unknown;
  } | null;
  suggestions?: ProductionReviewSuggestion[];
  [key: string]: unknown;
}
