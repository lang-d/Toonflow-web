import type { TaskStatus } from "@/types/api";
import type { MediaRef } from "@/types/api";
import { getMediaOriginalUrl, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";

// ===== 节点数据类型 =====
export interface ReferenceImage {
  image: string;
  previewImage?: string;
  media?: MediaRef;
  label?: string;
  source?: "asset" | "local" | "storyboard" | "directorStage" | "directorAsset" | "generated";
  sourceId?: number | string;
  group?: string;
  type?: "image" | "video" | "audio" | "text";
}

export interface UploadNodeData {
  image: string;
  previewImage?: string;
  media?: MediaRef;
  label?: string;
  source?: ReferenceImage["source"];
  sourceId?: ReferenceImage["sourceId"];
  group?: string;
  type?: ReferenceImage["type"];
}

export interface GeneratedNodeData {
  generatedImage?: string;
  resultMedia?: MediaRef;
  references: ReferenceImage[];
  prompt: string;
  model?: string;
  ratio?: string;
  quality?: string;
  steps: number;
  taskId?: string | number | null;
  unifiedTaskId?: string | null;
  legacyTaskId?: string | number | null;
  status?: TaskStatus;
  state?: "idle" | "generating" | "success" | "failed";
  reason?: string;
  historyId?: number | null;
  taskRequestPending?: boolean;
  isPrimary?: boolean;
  selectedResult?: {
    id?: number | null;
    url: string;
    media?: MediaRef;
    prompt?: string;
    model?: string;
    ratio?: string;
    quality?: string;
    createTime?: string;
  } | null;
}

export interface DirectorStagePlacedItem extends ReferenceImage {
  itemId: string;
  role: "actor" | "prop";
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color?: string;
  pose?: string;
}

export interface DirectorStageCamera {
  id: string;
  name: string;
  fov: number;
  x: number;
  y: number;
  zoom: number;
  promptFragment?: string;
  asset?: ReferenceImage;
}

export interface DirectorStageData {
  title: string;
  mode: "director" | "camera";
  references: ReferenceImage[];
  background?: ReferenceImage;
  items: DirectorStagePlacedItem[];
  cameras: DirectorStageCamera[];
  activeCameraId?: string;
  assets: ReferenceImage[];
  promptFragment?: string;
}

export interface ImageFlowSavePayload {
  imageUrl: string;
  media?: MediaRef;
  flowId: number;
  primaryNodeId?: string;
  prompt: string;
  references: ReferenceImage[];
}

export interface NodeUploadData {
  type: "upload";
  id: string;
  position: { x: number; y: number };
  data: UploadNodeData;
}

export interface NodeGeneratedData {
  type: "generated";
  id: string;
  position: { x: number; y: number };
  data: GeneratedNodeData;
}

export interface NodeDirectorStageData {
  type: "directorStage";
  id: string;
  position: { x: number; y: number };
  data: DirectorStageData;
}

export type NodeType = NodeUploadData | NodeGeneratedData | NodeDirectorStageData;

export const ACTIVE_IMAGE_TASK_STATUSES: readonly TaskStatus[] = ["queued", "submitting", "processing"];
export const TERMINAL_IMAGE_TASK_STATUSES: readonly TaskStatus[] = ["completed", "failed", "cancelled"];

export function isActiveImageTask(data: Pick<GeneratedNodeData, "status" | "taskId" | "unifiedTaskId" | "legacyTaskId">): boolean {
  return Boolean((data.unifiedTaskId || data.legacyTaskId || data.taskId) && data.status && ACTIVE_IMAGE_TASK_STATUSES.includes(data.status));
}

export function normalizeGeneratedNodeData(data: GeneratedNodeData): GeneratedNodeData {
  const normalized: GeneratedNodeData = {
    ...data,
    references: data.references ?? [],
    taskId: data.taskId ?? null,
    unifiedTaskId: data.unifiedTaskId ?? (typeof data.taskId === "string" && !/^\d+$/.test(data.taskId) ? data.taskId : null),
    legacyTaskId:
      data.legacyTaskId ?? (typeof data.taskId === "number" || (typeof data.taskId === "string" && /^\d+$/.test(data.taskId)) ? data.taskId : null),
    reason: data.reason ?? "",
    historyId: data.historyId ?? null,
    selectedResult: data.selectedResult ?? null,
  };
  const resultMedia = normalizeMediaRef(normalized.resultMedia ?? normalized.selectedResult?.media ?? normalized.selectedResult ?? normalized.generatedImage, "image");
  if (resultMedia) {
    normalized.resultMedia = resultMedia;
    normalized.generatedImage = normalized.generatedImage || getMediaPreviewUrl(resultMedia);
    normalized.selectedResult = normalized.selectedResult ?? {
      id: normalized.historyId ?? (typeof resultMedia.id === "number" ? resultMedia.id : null),
      url: getMediaOriginalUrl(resultMedia),
      media: resultMedia,
    };
  }
  const hasImage = Boolean(normalized.resultMedia || normalized.generatedImage || normalized.selectedResult?.url);

  if (normalized.status === "pending") {
    normalized.status = hasImage ? "completed" : "pending";
    normalized.state = hasImage ? "success" : "idle";
    normalized.taskId = null;
    normalized.unifiedTaskId = null;
    normalized.legacyTaskId = null;
    return normalized;
  }

  if (normalized.status && ACTIVE_IMAGE_TASK_STATUSES.includes(normalized.status)) {
    if (normalized.unifiedTaskId || normalized.legacyTaskId || normalized.taskId) {
      normalized.state = "generating";
      return normalized;
    }
    normalized.status = hasImage ? "completed" : "failed";
    normalized.state = hasImage ? "success" : "failed";
    normalized.reason = hasImage ? "" : normalized.reason || "Missing task id for active image task";
    normalized.taskId = null;
    normalized.unifiedTaskId = null;
    normalized.legacyTaskId = null;
    return normalized;
  }

  if (normalized.status && TERMINAL_IMAGE_TASK_STATUSES.includes(normalized.status)) {
    normalized.state = normalized.status === "completed" ? "success" : "failed";
    normalized.taskId = null;
    normalized.unifiedTaskId = null;
    normalized.legacyTaskId = null;
    return normalized;
  }

  if (hasImage || normalized.state === "success") {
    normalized.status = "completed";
    normalized.state = "success";
    normalized.taskId = null;
    normalized.unifiedTaskId = null;
    normalized.legacyTaskId = null;
  } else if (normalized.state === "failed") {
    normalized.status = "failed";
    normalized.taskId = null;
    normalized.unifiedTaskId = null;
    normalized.legacyTaskId = null;
  } else if (normalized.state === "generating" && (normalized.unifiedTaskId || normalized.legacyTaskId || normalized.taskId)) {
    normalized.status = "processing";
  } else {
    normalized.status = "pending";
    normalized.state = "idle";
    normalized.taskId = null;
    normalized.unifiedTaskId = null;
    normalized.legacyTaskId = null;
  }

  return normalized;
}

// ===== 精简后用于传输的类型 =====
export interface CleanNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: UploadNodeData | Omit<GeneratedNodeData, "steps"> | DirectorStageData;
}

export interface CleanEdge {
  id: string;
  source: string;
  target: string;
}

// ===== 默认边样式 =====
export const DEFAULT_EDGE_OPTIONS = {
  type: "removeLine" as const,
  animated: true,
  style: { stroke: "#00000" },
};

// ===== 默认生成节点数据 =====
export function createGeneratedData(image = "", prompt = ""): GeneratedNodeData {
  const media = normalizeMediaRef(image, "image");
  return normalizeGeneratedNodeData({
    generatedImage: media ? getMediaPreviewUrl(media) : image,
    resultMedia: media,
    references: [],
    prompt,
    model: "",
    ratio: "",
    quality: "",
    steps: 49,
    taskId: null,
    unifiedTaskId: null,
    legacyTaskId: null,
    status: image ? "completed" : "pending",
    state: "idle",
    reason: "",
    historyId: null,
    selectedResult: null,
  });
}

// ===== 数据精简工具函数 =====
function normalizeReferenceData(input: Partial<ReferenceImage> = {}): ReferenceImage {
  const media = normalizeMediaRef(input.media ?? input, "image");
  return {
    image: media ? getMediaOriginalUrl(media) : input.image || "",
    previewImage: media ? getMediaPreviewUrl(media) : input.previewImage || input.image || "",
    media,
    label: input.label,
    source: input.source,
    sourceId: input.sourceId,
    group: input.group,
    type: input.type || "image",
  };
}

export function createDirectorStageData(): DirectorStageData {
  return {
    title: "3D导演台",
    mode: "director",
    references: [],
    items: [],
    cameras: [
      {
        id: "camera-1",
        name: "机位1",
        fov: 45,
        x: 50,
        y: 52,
        zoom: 1,
        promptFragment: "",
      },
    ],
    activeCameraId: "camera-1",
    assets: [],
    promptFragment: "",
  };
}

export function normalizeDirectorStageData(data: Partial<DirectorStageData> = {}): DirectorStageData {
  const defaults = createDirectorStageData();
  const cameras = data.cameras?.length ? data.cameras : defaults.cameras;
  return {
    ...defaults,
    ...data,
    references: (data.references ?? []).map(normalizeReferenceData),
    background: data.background ? normalizeReferenceData(data.background) : undefined,
    items: (data.items ?? []).map((item) => ({
      ...normalizeReferenceData(item),
      itemId: item.itemId,
      role: item.role || "actor",
      x: Number(item.x ?? 50),
      y: Number(item.y ?? 70),
      scale: Number(item.scale ?? 1),
      rotation: Number(item.rotation ?? 0),
      color: item.color,
      pose: item.pose,
    })),
    cameras: cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      fov: Number(camera.fov ?? 45),
      x: Number(camera.x ?? 50),
      y: Number(camera.y ?? 52),
      zoom: Number(camera.zoom ?? 1),
      promptFragment: camera.promptFragment ?? "",
      asset: camera.asset ? normalizeReferenceData(camera.asset) : undefined,
    })),
    activeCameraId: data.activeCameraId || cameras[0]?.id,
    assets: (data.assets ?? []).map(normalizeReferenceData),
  };
}

export function cleanNodes(nodes: NodeType[]): CleanNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data:
      n.type === "upload"
        ? {
            image: n.data.image,
            previewImage: n.data.previewImage,
            media: normalizeMediaRef(n.data.media ?? n.data, "image"),
            label: n.data.label,
            source: n.data.source,
            sourceId: n.data.sourceId,
            group: n.data.group,
            type: n.data.type,
          }
        : n.type === "generated"
          ? {
            generatedImage: n.data.generatedImage,
            resultMedia: normalizeMediaRef(n.data.resultMedia ?? n.data.selectedResult?.media ?? n.data.generatedImage, "image"),
            references:
              n.data.references?.map((r) => ({
                image: r.image,
                previewImage: r.previewImage,
                media: normalizeMediaRef(r.media ?? r, "image"),
                label: r.label,
                source: r.source,
                sourceId: r.sourceId,
                group: r.group,
                type: r.type,
              })) ?? [],
            prompt: n.data.prompt,
            model: n.data.model,
            ratio: n.data.ratio,
            quality: n.data.quality,
            taskId: n.data.taskId ?? null,
            unifiedTaskId: n.data.unifiedTaskId ?? null,
            legacyTaskId: n.data.legacyTaskId ?? null,
            status: n.data.status,
            state: n.data.state ?? "idle",
            reason: n.data.reason ?? "",
            historyId: n.data.historyId ?? null,
            selectedResult: n.data.selectedResult ?? null,
            isPrimary: n.data.isPrimary,
          }
          : normalizeDirectorStageData(n.data),
  }));
}

export function cleanEdges(edges: { id: string; source: string; target: string }[]): CleanEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
  }));
}
