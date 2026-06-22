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
  workbench: "workbench",
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

export interface StoryboardTableRow {
  version: 1;
  index: number;
  sceneNo?: string;
  groupKey: string;
  groupName: string;
  groupIntent: string;
  beatId: string;
  durationSec: number;
  location: string;
  timeOfDay: string;
  sceneContinuityId?: string;
  picture: string;
  shotSize: string;
  cameraMove: string;
  cameraAngle?: string;
  transitionFromPrevious?: string;
  action: string;
  characters: StoryboardCharacterFact[];
  visibleEmotion: string;
  dialogue: StoryboardDialogueFact[];
  soundEffects: string[];
  requiredAssets: StoryboardRequiredAssetFact[];
}

export function parseStoryboardTableRow(value?: string | null): StoryboardTableRow | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as StoryboardTableRow) : undefined;
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
  picture?: string | null;
  action?: string | null;
  shotSize?: string | null;
  cameraMove?: string | null;
  dialogue?: string | null;
  sound?: string | null;
  visibleEmotion?: string | null;
  tableRowJson?: string | null;
  factStatus?: StoryboardFactStatus;
  factVersion?: number | null;
  factSource?: StoryboardFactSource;
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
  reason?: string;
  videoDesc: string;
  shouldGenerateImage: number;
}

export interface StoryboardReference {
  id: string;
  source: "local" | "storyboard";
  sourceId?: number | string;
  url: string;
  previewUrl?: string;
  media?: MediaRef;
  name: string;
  type?: "role" | "tool" | "scene" | "clip" | "image";
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

export interface FlowData {
  script: string;
  scriptPlan: string;
  assets: AssetItem[];
  storyboardTable: string;
  storyboardTableMeta?: StoryboardTableMeta;
  storyboardGenerationLastFailure: StoryboardGenerationLastFailure | null;
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
      // 5. Workbench 节点
      {
        id: ids.workbench,
        type: "workbench",
        dragHandle: ".dragHandle",
        position: positions[ids.workbench] || { x: 0, y: 0 },
        data: {
          handleIds: {
            target: `${ids.workbench}-target`,
            source: `${ids.workbench}-source`,
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
      // Storyboard -> Workbench
      {
        id: `${ids.storyboard}-${ids.workbench}`,
        source: ids.storyboard,
        target: ids.workbench,
        sourceHandle: `${ids.storyboard}-source`,
        targetHandle: `${ids.workbench}-target`,
        animated: false,
        style: edgeStyle,
      },
      // Workbench -> Poster
      // {
      //   id: `${ids.workbench}-${ids.poster}`,
      //   source: ids.workbench,
      //   target: ids.poster,
      //   sourceHandle: `${ids.workbench}-source`,
      //   targetHandle: `${ids.poster}-target`,
      //   animated: false,
      //   style: edgeStyle,
      // },
    ];

    return allEdges;
  });

  return { nodes, edges };
}
