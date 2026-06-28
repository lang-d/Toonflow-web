import type { TaskStatus } from "@/types/api";
import type { MediaRef } from "@/types/api";
import { getMediaOriginalUrl, getMediaPathForGeneration, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";

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

export interface DirectorVec3 {
  x: number;
  y: number;
  z: number;
}

export type DirectorJointName =
  | "head"
  | "neck"
  | "spine"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee";

export type DirectorJointState = Partial<Record<DirectorJointName, DirectorVec3>>;

export interface DirectorStagePlacedItem extends ReferenceImage {
  itemId: string;
  role: "actor" | "prop";
  modelKind: "mannequin" | "primitive";
  mannequinType?: "neutral" | "female" | "male" | "youth";
  primitiveType?: "box" | "sphere" | "cylinder" | "cone" | "capsule";
  position: DirectorVec3;
  rotation: DirectorVec3;
  scale3d: DirectorVec3;
  color?: string;
  poseId?: string;
  joints?: DirectorJointState;
  visible: boolean;
}

export interface DirectorStageView extends ReferenceImage {
  viewId: string;
  kind: "rendered" | "ai";
  createTime?: string;
}

export interface DirectorStageCamera {
  id: string;
  name: string;
  fov: number;
  position: DirectorVec3;
  target: DirectorVec3;
  promptFragment?: string;
  views: DirectorStageView[];
  activeViewId?: string;
}

export interface DirectorStageScene {
  backgroundMode: "flat" | "panorama";
  background?: ReferenceImage;
  backgroundFit: "cover" | "contain";
  panoramaRotation: number;
  panoramaRadius: number;
  backgroundScale: number;
  backgroundOffsetX: number;
  backgroundOffsetY: number;
  skyColor: string;
}

export interface DirectorStageData {
  stageVersion: 2;
  title: string;
  mode: "director" | "camera";
  references: ReferenceImage[];
  scene: DirectorStageScene;
  items: DirectorStagePlacedItem[];
  cameras: DirectorStageCamera[];
  activeCameraId?: string;
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
export type GeneratedNode = Extract<NodeType, { type: "generated" }>;

export interface ResolvePrimaryGeneratedNodeOptions {
  preferredNodeId?: string;
  selectedMedia?: unknown;
  prompt?: string;
  fallbackToLast?: boolean;
}

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

function sameGeneratedMedia(left: unknown, right: unknown) {
  const leftPath = getMediaPathForGeneration(normalizeMediaRef(left, "image"));
  const rightPath = getMediaPathForGeneration(normalizeMediaRef(right, "image"));
  return Boolean(leftPath && rightPath && leftPath === rightPath);
}

function generatedNodeMatchesMedia(node: GeneratedNode, media: unknown) {
  return [
    node.data.resultMedia,
    node.data.selectedResult?.media,
    node.data.selectedResult?.url,
    node.data.generatedImage,
  ].some((candidate) => sameGeneratedMedia(candidate, media));
}

function findUniqueGeneratedNode(nodes: GeneratedNode[], predicate: (node: GeneratedNode) => boolean) {
  const matches = nodes.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolvePrimaryGeneratedNode(
  nodes: NodeType[],
  options: ResolvePrimaryGeneratedNodeOptions = {},
): GeneratedNode | undefined {
  const generatedNodes = nodes.filter((node): node is GeneratedNode => node.type === "generated");
  if (!generatedNodes.length) return undefined;

  const preferred = options.preferredNodeId
    ? generatedNodes.find((node) => node.id === options.preferredNodeId)
    : undefined;
  const imageMatched = options.selectedMedia
    ? findUniqueGeneratedNode(generatedNodes, (node) => generatedNodeMatchesMedia(node, options.selectedMedia))
    : undefined;
  const marked = findUniqueGeneratedNode(generatedNodes, (node) => node.data.isPrimary === true);
  const normalizedPrompt = options.prompt?.trim();
  const promptMatched = normalizedPrompt
    ? findUniqueGeneratedNode(generatedNodes, (node) => node.data.prompt?.trim() === normalizedPrompt)
    : undefined;
  const single = generatedNodes.length === 1 ? generatedNodes[0] : undefined;
  const fallback = options.fallbackToLast === false ? undefined : generatedNodes.at(-1);
  const primary = preferred ?? imageMatched ?? marked ?? promptMatched ?? single ?? fallback;

  if (primary) {
    generatedNodes.forEach((node) => {
      node.data.isPrimary = node.id === primary.id;
    });
  }
  return primary;
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
    stageVersion: 2,
    title: "3D导演台",
    mode: "director",
    references: [],
    scene: {
      backgroundMode: "flat",
      backgroundFit: "cover",
      panoramaRotation: 0,
      panoramaRadius: 30,
      backgroundScale: 1,
      backgroundOffsetX: 0,
      backgroundOffsetY: 0,
      skyColor: "#111827",
    },
    items: [],
    cameras: [
      {
        id: "camera-1",
        name: "机位1",
        fov: 45,
        position: { x: 6, y: 3.2, z: 8 },
        target: { x: 0, y: 1.4, z: 0 },
        promptFragment: "",
        views: [],
      },
    ],
    activeCameraId: "camera-1",
    promptFragment: "",
  };
}

export function normalizeDirectorStageData(data: Partial<DirectorStageData> = {}): DirectorStageData {
  const defaults = createDirectorStageData();
  if (data.stageVersion !== 2) return defaults;
  const cameras = data.cameras?.length ? data.cameras : defaults.cameras;
  return {
    stageVersion: 2,
    title: data.title || defaults.title,
    mode: data.mode === "camera" ? "camera" : "director",
    references: (data.references ?? []).map(normalizeReferenceData),
    scene: {
      ...defaults.scene,
      ...(data.scene ?? {}),
      background: data.scene?.background ? normalizeReferenceData(data.scene.background) : undefined,
    },
    items: (data.items ?? []).map((item) => ({
      ...normalizeReferenceData(item),
      itemId: item.itemId,
      role: item.role || "actor",
      modelKind: item.role === "prop" ? "primitive" : "mannequin",
      mannequinType: item.mannequinType ?? "neutral",
      primitiveType: item.primitiveType ?? "box",
      position: { ...({ x: 0, y: 0, z: 0 } as DirectorVec3), ...(item.position ?? {}) },
      rotation: { ...({ x: 0, y: 0, z: 0 } as DirectorVec3), ...(item.rotation ?? {}) },
      scale3d: { ...({ x: 1, y: 1, z: 1 } as DirectorVec3), ...(item.scale3d ?? {}) },
      color: item.color,
      poseId: item.poseId ?? "stand",
      joints: item.joints ?? {},
      visible: item.visible !== false,
    })),
    cameras: cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      fov: Number(camera.fov ?? 45),
      position: { ...({ x: 6, y: 3.2, z: 8 } as DirectorVec3), ...(camera.position ?? {}) },
      target: { ...({ x: 0, y: 1.4, z: 0 } as DirectorVec3), ...(camera.target ?? {}) },
      promptFragment: camera.promptFragment ?? "",
      views: (camera.views ?? []).map((view) => ({
        ...normalizeReferenceData(view),
        viewId: view.viewId,
        kind: view.kind === "ai" ? "ai" : "rendered",
        createTime: view.createTime,
      })),
      activeViewId: camera.activeViewId,
    })),
    activeCameraId: data.activeCameraId || cameras[0]?.id,
    promptFragment: data.promptFragment ?? "",
  };
}

export function getDirectorStageGenerationReferences(data: DirectorStageData): ReferenceImage[] {
  const activeCamera = data.cameras.find((camera) => camera.id === data.activeCameraId) ?? data.cameras[0];
  const activeView = activeCamera?.views.find((view) => view.viewId === activeCamera.activeViewId) ?? activeCamera?.views[0];
  const ordered = [
    activeView,
    data.scene.background,
    ...data.items.filter((item) => item.visible && item.role === "actor"),
    ...data.items.filter((item) => item.visible && item.role === "prop"),
  ].filter((item): item is ReferenceImage => Boolean(item?.image || item?.media));
  const seen = new Set<string>();
  return ordered.filter((item) => {
    const media = normalizeMediaRef(item.media ?? item, "image");
    const key = media?.path || media?.url || `${item.source || ""}:${item.sourceId ?? ""}:${item.image}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
