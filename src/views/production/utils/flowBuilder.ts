import type { Ref } from "vue";
import { computed } from "vue";
import type { MediaRef, TaskStatus } from "@/types/api";

// ==================== 固定节点 ID ====================
const NODE_IDS = {
  script: "script",
  scriptPlan: "scriptPlan",
  assets: "assets",
  storyboardTable: "storyboardTable",
  storyboard: "storyboard",
  poster: "poster",
} as const;

type NodeId = (typeof NODE_IDS)[keyof typeof NODE_IDS];

// ==================== 类型定义 ====================
export interface DeriveAsset {
  id: number;
  assetsId: number | null;
  name: string;
  prompt: string;
  desc: string;
  src: string;
  media?: MediaRef;
  flowId?: number;
  nodeId?: string | null;
  unifiedTaskId?: string | null;
  promptMode?: "preserve" | "replace";
  ratio?: string;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  status?: TaskStatus;
  type: "role" | "tool" | "scene" | "clip" | "props";
  errorReason?: string;
  taskId?: string;
  legacyTaskId?: number;
  imageId?: number;
  base64?: string | null;
}

export interface AssetItem {
  id: number;
  name: string;
  desc: string;
  prompt: string;
  src: string;
  media?: MediaRef;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  status?: TaskStatus;
  type: "role" | "tool" | "scene" | "clip" | "props";
  flowId?: number;
  derive: DeriveAsset[];
  errorReason?: string;
}

export type StoryboardFactStatus = "draft" | "ready" | "legacy";
export type StoryboardFactSource = "storyboardTable" | "minimalFallback";

export interface StoryboardCharacterFact {
  name: string;
  assetId?: number;
  action: string;
  orientation: string;
  spatialPosition: string;
  posture?: string;
  expression?: string;
  gaze?: string;
  handAction?: string;
  movement?: string;
}

export interface StoryboardDialogueFact {
  speaker: string;
  text: string;
  voiceTone?: string;
}

export interface StoryboardRequiredAssetFact {
  assetId: number;
  name: string;
  type: "role" | "scene" | "tool" | "clip";
  order: number;
}

interface StoryboardTableRowBase {
  index: number;
  sceneNo?: string;
  groupKey: string;
  beatId: string;
  durationSec: number;
  location: string;
  timeOfDay: string;
  sceneContinuityId?: string;
  shotSize: string;
  cameraMove?: string;
  cameraAngle?: string;
  transitionFromPrevious?: string;
  dialogue: StoryboardDialogueFact[];
  soundEffects: string[];
  requiredAssets: StoryboardRequiredAssetFact[];
}

interface StoryboardTableRowV1V2Base extends StoryboardTableRowBase {
  picture: string;
  action: string;
}

/** Historical V1 rows remain readable and keep their own explicit version. */
export interface StoryboardTableRowV1 extends StoryboardTableRowV1V2Base {
  version: 1;
  groupName: string;
  groupIntent: string;
  characters: StoryboardCharacterFact[];
  visibleEmotion: string;
}

/**
 * V2 stores the static starting composition in picture and all temporal
 * performance in action. Group names are projected by the group plan/track,
 * rather than duplicated into every row.
 */
export interface StoryboardTableRowV2 extends StoryboardTableRowV1V2Base {
  version: 2;
}

/** V3 keeps one chronological visual fact instead of picture/action. */
export interface StoryboardTableRowV3 extends StoryboardTableRowBase {
  version: 3;
  shotDescription: string;
}

export type StoryboardTableRow = StoryboardTableRowV1 | StoryboardTableRowV2 | StoryboardTableRowV3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string";
}

function hasOptionalString(value: Record<string, unknown>, key: string) {
  return value[key] === undefined || typeof value[key] === "string";
}

function isDialogueFact(value: unknown): value is StoryboardDialogueFact {
  return (
    isRecord(value) &&
    hasString(value, "speaker") &&
    hasString(value, "text") &&
    hasOptionalString(value, "voiceTone")
  );
}

function isRequiredAssetFact(value: unknown): value is StoryboardRequiredAssetFact {
  return (
    isRecord(value) &&
    typeof value.assetId === "number" &&
    Number.isFinite(value.assetId) &&
    hasString(value, "name") &&
    ["role", "scene", "tool", "clip"].includes(String(value.type)) &&
    typeof value.order === "number" &&
    Number.isInteger(value.order)
  );
}

function isCharacterFact(value: unknown): value is StoryboardCharacterFact {
  return (
    isRecord(value) &&
    hasString(value, "name") &&
    hasString(value, "action") &&
    hasString(value, "orientation") &&
    hasString(value, "spatialPosition") &&
    hasOptionalString(value, "posture") &&
    hasOptionalString(value, "expression") &&
    hasOptionalString(value, "gaze") &&
    hasOptionalString(value, "handAction") &&
    hasOptionalString(value, "movement")
  );
}

function excludesKeys(value: Record<string, unknown>, keys: string[]) {
  return keys.every((key) => !(key in value));
}

function hasCommonStoryboardFields(value: Record<string, unknown>) {
  return (
    typeof value.index === "number" &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    hasString(value, "groupKey") &&
    hasString(value, "beatId") &&
    typeof value.durationSec === "number" &&
    Number.isFinite(value.durationSec) &&
    hasString(value, "location") &&
    hasString(value, "timeOfDay") &&
    hasOptionalString(value, "sceneNo") &&
    hasOptionalString(value, "sceneContinuityId") &&
    hasString(value, "shotSize") &&
    hasOptionalString(value, "cameraMove") &&
    hasOptionalString(value, "cameraAngle") &&
    hasOptionalString(value, "transitionFromPrevious") &&
    Array.isArray(value.dialogue) &&
    value.dialogue.every(isDialogueFact) &&
    Array.isArray(value.soundEffects) &&
    value.soundEffects.every((item) => typeof item === "string") &&
    Array.isArray(value.requiredAssets) &&
    value.requiredAssets.every(isRequiredAssetFact)
  );
}

export function isStoryboardTableRowV1(row?: StoryboardTableRow): row is StoryboardTableRowV1 {
  return row?.version === 1;
}

export function isStoryboardTableRowV2(row?: StoryboardTableRow): row is StoryboardTableRowV2 {
  return row?.version === 2;
}

export function isStoryboardTableRowV3(row?: StoryboardTableRow): row is StoryboardTableRowV3 {
  return row?.version === 3;
}

export function parseStoryboardTableRow(value?: string | null): StoryboardTableRow | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!isRecord(parsed) || !hasCommonStoryboardFields(parsed)) return undefined;
    if (parsed.version === 1) {
      return hasString(parsed, "picture") &&
        hasString(parsed, "action") &&
        hasString(parsed, "groupName") &&
        hasString(parsed, "groupIntent") &&
        Array.isArray(parsed.characters) &&
        parsed.characters.every(isCharacterFact) &&
        hasString(parsed, "visibleEmotion") &&
        !("shotDescription" in parsed)
        ? (parsed as unknown as StoryboardTableRowV1)
        : undefined;
    }
    if (parsed.version === 2) {
      return hasString(parsed, "picture") &&
        hasString(parsed, "action") &&
        excludesKeys(parsed, ["shotDescription", "characters", "visibleEmotion", "groupName", "groupIntent"])
        ? (parsed as unknown as StoryboardTableRowV2)
        : undefined;
    }
    if (parsed.version === 3) {
      return hasString(parsed, "shotDescription") &&
        excludesKeys(parsed, ["picture", "action", "characters", "visibleEmotion", "groupName", "groupIntent"])
        ? (parsed as unknown as StoryboardTableRowV3)
        : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export interface Storyboard {
  id?: number;
  index?: number;
  duration?: number;
  prompt: string;
  scene?: string | null;
  location?: string | null;
  timeOfDay?: string | null;
  sceneContinuityId?: string | null;
  transitionFromPrevious?: string | null;
  shotDescription?: string | null;
  picture?: string | null;
  shotSize?: string | null;
  cameraMove?: string | null;
  cameraAngle?: string | null;
  characters?: StoryboardCharacterFact[];
  requiredAssets?: StoryboardRequiredAssetFact[];
  action?: string | null;
  dialogue?: string | null;
  sound?: string | null;
  visibleEmotion?: string | null;
  tableRowJson?: string | null;
  factStatus?: StoryboardFactStatus;
  factVersion?: number | null;
  factSource?: StoryboardFactSource;
  promptStale?: boolean;
  imageStale?: boolean;
  sourceTracked?: boolean;
  trackId?: number;
  trackName?: string;
  groupKey?: string | null;
  groupName?: string | null;
  groupIntent?: string | null;
  beatId?: string | null;
  associateAssetsIds?: number[];
  referenceImages?: StoryboardReference[];
  src: string | null;
  media?: MediaRef;
  url?: string | null;
  imageUrl?: string | null;
  originalUrl?: string | null;
  thumbnail?: string | null;
  thumb?: string | null;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  status?: TaskStatus;
  taskId?: string;
  unifiedTaskId?: string | null;
  legacyTaskId?: number | string | null;
  flowId?: number;
  nodeId?: string | null;
  reason?: string;
  videoDesc: string;
  shouldGenerateImage: number;
}

export interface StoryboardReference {
  id: string;
  source: "local" | "storyboard" | "asset";
  sourceId?: number | string;
  url: string;
  previewUrl?: string;
  media?: MediaRef;
  name: string;
  type?: "role" | "tool" | "scene" | "clip" | "image" | "audio";
}

interface VideoList {
  id: number;
  prompt: string;
  duration: number;
  storyboardId: number;
  trackId: number;
}

export interface StoryboardTableMeta {
  source?: "structured" | "draft" | "empty";
  rowCount: number;
  readyCount?: number;
  draftCount?: number;
  legacyCount?: number;
  complete?: boolean;
  hash?: string;
  textAssetId?: number;
}

export interface StoryboardGenerationLastFailure {
  generationId: string;
  state: "invalid" | "failed";
  expectedRowCount: number;
  errorJson?: string;
  updatedAt: number;
}

export interface DirectorPlanGenerationState {
  current: null | {
    generationId: string;
    state: string;
    textAssetId?: number | null;
    version?: number | null;
    updatedAt: number;
  };
  lastFailure: null | {
    generationId: string;
    state: "invalid" | "failed" | string;
    errorJson?: string | null;
    updatedAt: number;
  };
}

export interface FlowData {
  script: string;
  scriptPlan: string;
  directorPlanGeneration: DirectorPlanGenerationState;
  assets: AssetItem[];
  storyboardTable: string;
  storyboardTableMeta?: StoryboardTableMeta;
  storyboardGenerationLastFailure: StoryboardGenerationLastFailure | null;
  storyboardFactWriteVersion?: 2 | 3;
  storyboard: Storyboard[];
  workbench: {
    videoList: VideoList[];
  };
}

export type NodePositions = Record<string, { x: number; y: number }>;

// 边样式
const edgeStyle = {
  stroke: "#00000",
  strokeWidth: 4,
};

// ==================== 构建函数 ====================
export function useFlowBuilder(_flowData: Ref<FlowData>, nodePositions: Ref<NodePositions>) {
  const nodes = computed(() => {
    const positions = nodePositions.value;
    const ids = NODE_IDS;

    const allNodes = [
      // 1. Script 节点
      {
        id: ids.script,
        type: "script",
        dragHandle: ".dragHandle",
        position: positions[ids.script] || { x: 0, y: 0 },
        data: {
          handleIds: {
            assets: `${ids.script}-assets`,
            source: `${ids.script}-source`,
          },
        },
      },
      // 1.5 ScriptPlan 节点
      {
        id: ids.scriptPlan,
        type: "scriptPlan",
        dragHandle: ".dragHandle",
        position: positions[ids.scriptPlan] || { x: 0, y: 0 },
        data: {
          handleIds: {
            target: `${ids.scriptPlan}-target`,
            source: `${ids.scriptPlan}-source`,
          },
        },
      },
      // 2. Assets 节点
      {
        id: ids.assets,
        type: "assets",
        dragHandle: ".dragHandle",
        position: positions[ids.assets] || { x: 0, y: 0 },
        data: {
          handleIds: {
            target: `${ids.assets}-target`,
          },
        },
      },
      // 3. StoryboardTable 节点
      {
        id: ids.storyboardTable,
        type: "storyboardTable",
        dragHandle: ".dragHandle",
        position: positions[ids.storyboardTable] || { x: 0, y: 0 },
        data: {
          handleIds: {
            target: `${ids.storyboardTable}-target`,
            source: `${ids.storyboardTable}-source`,
          },
        },
      },
      // 4. Storyboard 节点
      {
        id: ids.storyboard,
        type: "storyboard",
        dragHandle: ".dragHandle",
        position: positions[ids.storyboard] || { x: 0, y: 0 },
        data: {
          handleIds: {
            target: `${ids.storyboard}-target`,
            source: `${ids.storyboard}-source`,
          },
        },
      },
      // 6. Poster 节点
      // {
      //   id: ids.poster,
      //   type: "poster",
      //   dragHandle: ".dragHandle",
      //   position: positions[ids.poster] || { x: 0, y: 0 },
      //   data: {
      //     items: data.poster?.items ?? [],
      //     handleIds: {
      //       target: `${ids.poster}-target`,
      //     },
      //   },
      // },
    ];

    return allNodes;
  });

  const edges = computed(() => {
    const ids = NODE_IDS;

    const allEdges = [
      // Script -> Assets
      {
        id: `${ids.script}-${ids.assets}`,
        source: ids.script,
        target: ids.assets,
        sourceHandle: `${ids.script}-assets`,
        targetHandle: `${ids.assets}-target`,
        animated: false,
        style: edgeStyle,
      },
      // Script -> StoryboardTable
      {
        id: `${ids.script}-${ids.scriptPlan}`,
        source: ids.script,
        target: ids.scriptPlan,
        sourceHandle: `${ids.script}-source`,
        targetHandle: `${ids.scriptPlan}-target`,
        animated: false,
        style: edgeStyle,
      },
      // ScriptPlan -> StoryboardTable
      {
        id: `${ids.scriptPlan}-${ids.storyboardTable}`,
        source: ids.scriptPlan,
        target: ids.storyboardTable,
        sourceHandle: `${ids.scriptPlan}-source`,
        targetHandle: `${ids.storyboardTable}-target`,
        animated: false,
        style: edgeStyle,
      },
      // StoryboardTable -> Storyboard
      {
        id: `${ids.storyboardTable}-${ids.storyboard}`,
        source: ids.storyboardTable,
        target: ids.storyboard,
        sourceHandle: `${ids.storyboardTable}-source`,
        targetHandle: `${ids.storyboard}-target`,
        animated: false,
        style: edgeStyle,
      },
    ];

    return allEdges;
  });

  return { nodes, edges };
}
