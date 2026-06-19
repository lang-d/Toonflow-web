export type StoryArtifactType = "idea" | "bible" | "outline" | "episodeOutline" | "sceneCard" | "script" | "review" | "research";

export type StoryArtifactStatus = "draft" | "active" | "archived" | "published";

export type StoryAnnotationStatus = "open" | "applied" | "dismissed" | "resolved";

export interface StoryArtifact {
  id: number;
  projectId: number;
  type: StoryArtifactType;
  title: string;
  content: string;
  contentJson: any | null;
  version: number;
  parentId: number | null;
  status: StoryArtifactStatus;
  createTime: number;
  updateTime: number;
}

export interface StoryAnnotation {
  id: number;
  projectId: number;
  artifactId: number;
  artifactVersion: number;
  blockId?: string | null;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  comment: string;
  status: StoryAnnotationStatus;
  createTime: number;
  updateTime: number;
}

export interface StoryArtifactListParams {
  projectId: number;
  type?: StoryArtifactType;
  status?: StoryArtifactStatus;
}

export interface StoryArtifactCreateParams {
  projectId: number;
  type: StoryArtifactType;
  title: string;
  content: string;
  contentJson?: any;
  parentId?: number | null;
  status?: StoryArtifactStatus;
}

export interface StoryArtifactUpdateParams {
  id: number;
  projectId: number;
  title?: string;
  content?: string;
  contentJson?: any;
  status?: StoryArtifactStatus;
}

export interface StoryAnnotationCreateParams {
  projectId: number;
  artifactId: number;
  artifactVersion: number;
  blockId?: string | null;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  comment: string;
}

export const STORY_ARTIFACT_TYPE_LABELS: Record<StoryArtifactType, string> = {
  idea: "想法",
  bible: "故事圣经",
  outline: "大纲",
  episodeOutline: "分集大纲",
  sceneCard: "场景卡",
  script: "剧本",
  review: "审核报告",
  research: "资料",
};

export const STORY_ARTIFACT_TYPES: StoryArtifactType[] = ["idea", "bible", "outline", "episodeOutline", "sceneCard", "script", "review", "research"];

export const STORY_ARTIFACT_STATUS_LABELS: Record<StoryArtifactStatus, string> = {
  draft: "草稿",
  active: "生效",
  archived: "已归档",
  published: "已发布",
};

export const STORY_ANNOTATION_STATUS_LABELS: Record<StoryAnnotationStatus, string> = {
  open: "待处理",
  applied: "已应用",
  dismissed: "已忽略",
  resolved: "已解决",
};
