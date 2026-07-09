<template>
  <t-card class="storyboard">
    <div class="titleBar dragHandle pr">
      <div class="titleRow ac jb">
        <div class="title">{{ $t("workbench.production.node.storyboard.title") }}</div>
        <t-radio-group v-model="viewMode" variant="default-filled" size="small">
          <t-radio-button value="table">{{ $t("workbench.production.node.storyboard.table") }}</t-radio-button>
          <t-radio-button value="grid">{{ $t("workbench.production.node.storyboard.grid") }}</t-radio-button>
        </t-radio-group>
      </div>
      <Handle :id="props.handleIds.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <Handle :id="props.handleIds.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>

    <div class="content">
      <t-empty v-if="!storyboard.length" style="margin-top: 16px" />
      <t-alert
        v-if="false && hasUnreadyFacts"
        class="historyFactAlert"
        theme="warning"
        message="当前包含历史分镜数据，建议重新生成或结构化重整分镜表。" />

      <t-alert
        v-if="hasUnreadyFacts"
        class="historyFactAlert"
        theme="warning"
        message="当前包含草稿或旧数据分镜，可继续展示、编辑和生成分镜图，但生成视频前需要补齐结构化分镜事实。" />

      <StoryboardTableView
        v-if="storyboard.length && viewMode === 'table'"
        :groups="storyboardGroups"
        :has-track-groups="hasTrackGroups"
        :collapsed-group-keys="collapsedGroupKeys"
        :table-columns="tableColumns"
        :selected-ids="selectedIds"
        :tag-colors="tagColors"
        :get-storyboard-index="getStoryboardIndex"
        :get-storyboard-references="getStoryboardReferences"
        :get-grouped-references="getGroupedReferences"
        :get-image-ratio="getImageRatio"
        :get-storyboard-image-url="getStoryboardImageUrl"
        :is-storyboard-active="isStoryboardActive"
        :is-storyboard-completed="isStoryboardCompleted"
        :is-storyboard-failed="isStoryboardFailed"
        @toggle-group="toggleGroup"
        @generate-group="generateGroup"
        @toggle-select="toggleSelect"
        @open-prompt-editor="openPromptEditor"
        @save-storyboard-info="saveStoryboardInfo"
        @open-image-viewer="openImageViewer"
        @regenerate-single-image="regenerateSingleImage"
        @edit-storyboard-image="editStoryboaryImage"
        @open-storyboard-history="openStoryboardHistory"
        @preview-reference="previewPromptReference"
        @remove="removeFn"
        @image-load="onImageLoad" />

      <StoryboardGridView
        v-if="storyboard.length && viewMode === 'grid'"
        :storyboard="storyboard"
        :selected-ids="selectedIds"
        :grid-scale="gridScale"
        :style-max-size="styleMaxSize"
        :default-image-ratio="defaultImageRatio"
        :tag-colors="tagColors"
        :get-image-ratio="getImageRatio"
        :get-storyboard-image-url="getStoryboardImageUrl"
        :is-storyboard-active="isStoryboardActive"
        :is-storyboard-completed="isStoryboardCompleted"
        :is-storyboard-failed="isStoryboardFailed"
        @update:selected-ids="selectedIds = $event"
        @edit-storyboard-image="editStoryboaryImage"
        @regenerate-single-image="regenerateSingleImage"
        @remove="removeFn"
        @image-load="onImageLoad" />

      <div v-if="viewMode === 'grid'" class="scaleControl">
        <span>{{ $t("workbench.production.node.storyboard.scaleRatio") }}</span>
        <t-input-number v-model="gridScale" :min="0.1" :max="3" :step="0.1" :decimal-places="1" size="small" style="width: 120px" />
      </div>

      <div class="toolbar ac">
        <t-tag theme="primary" variant="light">{{ $t("workbench.production.node.storyboard.selectedCount", { count: selectedIds.length }) }}</t-tag>
        <t-button size="small" :disabled="!storyboard.length" variant="outline" @click="selectedIds = []">
          {{ $t("workbench.production.node.storyboard.clearSelection") }}
        </t-button>
        <t-button size="small" :disabled="!storyboard.length" variant="outline" @click="selectAll">
          {{ $t("workbench.production.node.storyboard.selectAll") }}
        </t-button>
        <t-button theme="danger" size="small" :disabled="!storyboard.length || !selectedIds.length" @click="handleDeleteSelected">
          {{ $t("workbench.production.node.storyboard.batchDelete") }}
        </t-button>
      </div>
      <div class="footerActions ac">
        <t-button block @click="openPreviewDialog" :disabled="!previewItems.length">{{ $t("workbench.production.node.storyboard.gridPreview") }}</t-button>
        <t-button block @click="batchGenerateImage" :disabled="!storyboard.length || !selectedIds.length" :loading="generateLoading">
          {{ $t("workbench.production.node.storyboard.generateImage") }}
        </t-button>
      </div>
    </div>

    <editImage v-model="visible" v-if="visible" :flowData="currentRow" type="storyboard" @save="save" />

    <StoryboardPromptDialog
      v-model:visible="promptEditorVisible"
      v-model:prompt="promptDraft"
      v-model:primary-node-id="promptPrimaryNodeId"
      v-model:facts="promptFactDraft"
      :loading="promptEditorLoading"
      :saving="promptEditorSaving"
      :shot-label="promptEditorShotLabel"
      :references="promptDraftReferenceRows"
      :node-options="promptNodeOptions"
      @pick-assets="pickAssetsForPrompt"
      @pick-storyboard-images="pickStoryboardImagesForPrompt"
      @upload-local="uploadLocalPromptReference"
      @remove-reference="removePromptReference"
      @preview-reference="previewPromptReference"
      @confirm="savePromptEditor" />

    <AudioClipDialog
      v-model:visible="promptAudioPreviewVisible"
      :src="activePromptAudioReference?.originalSrc || activePromptAudioReference?.src"
      :name="activePromptAudioReference?.label"
      mode="preview" />

    <storyboardImageCheck
      v-model="promptStoryboardSelectorVisible"
      multiple
      :scriptId="episodesId!"
      @confirm="confirmPromptStoryboardImages"
      @cancel="cancelPromptStoryboardImages" />

    <StoryboardPreviewDialog
      v-model:visible="previewVisible"
      v-model:preview-mode="previewMode"
      :current-preview-items="currentPreviewItems"
      :preview-grid-style="previewGridStyle"
      :preview-title="previewTitle"
      :can-preview-prev="canPreviewPrev"
      :can-preview-next="canPreviewNext"
      :timeline-items="timelineItems"
      :timeline-current="timelineCurrent"
      :timeline-index="timelineIndex"
      :get-storyboard-index="getStoryboardIndex"
      :get-storyboard-description="getStoryboardDescription"
      :get-storyboard-image-url="getStoryboardImageUrl"
      :has-storyboard-preview-image="hasStoryboardPreviewImage"
      :get-storyboard-preview-label="getStoryboardPreviewLabel"
      :get-preview-image-fit="getPreviewImageFit"
      @change-preview="changePreview"
      @open-image-viewer="openImageViewer"
      @image-load="onImageLoad"
      @update:timeline-index="timelineIndex = $event"
      @download-preview="confirmDownloadPreview" />

    <StoryboardHistoryDialog
      v-model:visible="historyVisible"
      :history-loading="historyLoading"
      :history-items="historyItems"
      :history-selected-id="historySelectedId"
      @select-history-item="selectHistoryItem" />

  </t-card>
</template>

<script setup lang="ts">
import { useFileDialog, useLocalStorage } from "@vueuse/core";
import editImage from "../../components/editImage/index.vue";
import { DialogPlugin, LoadingPlugin } from "tdesign-vue-next";
import { Handle, Position } from "@vue-flow/core";
import axios from "@/utils/axios";
import { parseStoryboardTableRow, type AssetItem, type Storyboard, type StoryboardReference } from "../../utils/flowBuilder";
import projectStore from "@/stores/project";
import openAssetsSelector from "@/utils/assetsCheck";
import productionAgentStore from "@/stores/productionAgent";
import StoryboardTableView from "./components/StoryboardTableView.vue";
import StoryboardGridView from "./components/StoryboardGridView.vue";
import StoryboardPreviewDialog from "./components/StoryboardPreviewDialog.vue";
import StoryboardPromptDialog from "./components/StoryboardPromptDialog.vue";
import StoryboardHistoryDialog from "./components/StoryboardHistoryDialog.vue";
import storyboardImageCheck from "@/components/storyboardImageCheck.vue";
import AudioClipDialog from "@/components/AudioClipDialog.vue";
import { openImageLightbox } from "@/composables/useImageLightbox";
import { getOriginalImageUrl, getThumbnailImageUrl } from "@/utils/imageUrl";
import { getMediaOriginalUrl, getMediaPathForGeneration, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type { MediaRef, TaskStatus } from "@/types/api";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { useStoryboardPreview } from "./composables/useStoryboardPreview";
import type { ImageHistoryItem, ReferenceView } from "./types";
import type {
  GeneratedNodeData,
  ImageFlowSavePayload,
  NodeType,
  ReferenceImage,
  UploadNodeData,
} from "../../utils/editImageType";
import {
  DEFAULT_EDGE_OPTIONS,
  cleanEdges,
  cleanNodes,
  createGeneratedData,
  resolvePrimaryGeneratedNode,
} from "../../utils/editImageType";
import { v4 as uuid } from "uuid";
import "./styles.scss";


const { project } = storeToRefs(projectStore());
const productionStore = productionAgentStore();
const { episodesId } = storeToRefs(productionStore);
const taskCenter = useTaskCenterStore();
const { open, onChange, onCancel } = useFileDialog({ multiple: false, reset: true, accept: ".png,.jpg,.jpeg,.webp" });

const props = defineProps<{
  id: string;
  handleIds: {
    target: string;
    source: string;
  };
  assetsData: AssetItem[];
}>();

const storyboard = defineModel<Storyboard[]>({ required: true });

const visible = ref(false);
const viewMode = useLocalStorage<"table" | "grid">("storyboardViewMode", "table");
const gridScale = useLocalStorage("storyboardGridScale", 1);
const selectedIds = ref<number[]>([]);
const generateLoading = ref(false);
const previewVisible = ref(false);
const previewMode = ref<"grid" | "timeline">("grid");
const previewGroupIndex = ref(0);
const previewPageIndex = ref(0);
const timelineIndex = ref(0);
const historyVisible = ref(false);
const historyLoading = ref(false);
const historyItems = ref<ImageHistoryItem[]>([]);
const historySelectedId = ref<number | string | null>(null);
const currentHistoryItem = ref<Storyboard | null>(null);
const promptEditorVisible = ref(false);
const promptEditorLoading = ref(false);
const promptEditorSaving = ref(false);
const currentPromptTarget = ref<Storyboard | null>(null);
const promptDraft = ref("");
 type StoryboardFactKey =
  | "scene"
  | "location"
  | "timeOfDay"
  | "sceneContinuityId"
  | "picture"
  | "action"
  | "shotSize"
  | "cameraMove"
  | "dialogue"
  | "sound"
  | "visibleEmotion";
 type StoryboardFactDraft = Record<StoryboardFactKey, string>;
 const storyboardFactKeys: StoryboardFactKey[] = [
  "scene",
  "location",
  "timeOfDay",
  "sceneContinuityId",
  "picture",
  "action",
  "shotSize",
  "cameraMove",
  "dialogue",
  "sound",
  "visibleEmotion",
];
const promptFactDraft = ref<StoryboardFactDraft>(createEmptyStoryboardFacts());
const promptDraftReferences = ref<ReferenceImage[]>([]);
const promptPrimaryNodeId = ref("");
const promptNodeOptions = ref<{ label: string; value: string }[]>([]);
const promptFlowSnapshot = shallowRef<{ nodes: NodeType[]; edges: ReturnType<typeof cleanEdges> } | null>(null);
const promptStoryboardSelectorVisible = ref(false);
const promptAudioPreviewVisible = ref(false);
const activePromptAudioReference = ref<ReferenceView | null>(null);
let promptStoryboardSelectorResolve: ((rows: Storyboard[]) => void) | null = null;
const collapsedGroupKeys = ref<string[]>([]);
const imageRatioMap = reactive<Record<string, string>>({});
const storyboardFlowTaskReleases = new Map<number, () => void>();

const currentRow = ref<{
  flowId?: number | null;
  targetType?: "storyboard";
  targetId?: number | null;
  resultImages: { src: string; prompt: string }[];
  referanceImages: (string | ReferenceImage)[];
}>({
  flowId: null,
  targetType: "storyboard",
  targetId: null,
  resultImages: [],
  referanceImages: [],
});
const currentRowStoryboardInfo = ref<{ id: number | null; insertAfterIndex: number | null }>({
  id: null,
  insertAfterIndex: null,
});

const tagColors = ["#5bccb3", "#9c7cfc", "#fbbf24", "#5b9afc", "#e86b6b", "#7cb8fc", "#e8a855", "#34d399"];
const tableColumns = [
  { colKey: "shot", title: $t("workbench.production.node.storyboard.shot"), width: 96, cell: "shot" },
  { colKey: "assets", title: $t("workbench.production.node.storyboard.relatedAssets"), width: 220, cell: "assets" },
  { colKey: "prompt", title: $t("workbench.production.node.storyboard.prompt"), width: 360, cell: "prompt" },
  { colKey: "image", title: $t("workbench.production.node.storyboard.image"), width: 170, cell: "image" },
  { colKey: "duration", title: $t("workbench.production.node.storyboard.duration"), width: 100, cell: "duration" },
  { colKey: "operate", title: $t("common.operation"), width: 72, cell: "operate" },
];

const defaultImageRatio = computed(() => (project.value?.videoRatio || "16:9").replace(":", " / "));
const styleMaxSize = computed(() => (gridScale.value <= 1 ? gridScale.value : 1));
const {
  hasTrackGroups,
  storyboardGroups,
  previewItems,
  previewGroups,
  currentPreviewItems,
  timelineItems,
  previewGridStyle,
  previewTitle,
  canPreviewPrev,
  canPreviewNext,
  timelineCurrent,
  changePreview,
  getStoryboardDescription,
} = useStoryboardPreview({
  storyboard,
  previewGroupIndex,
  previewPageIndex,
  timelineIndex,
  getTrackTitle: (index) =>
    index === 0 && !storyboard.value.some((item) => item.trackId != null)
      ? $t("workbench.production.node.storyboard.allShots")
      : $t("workbench.production.node.storyboard.trackGroup", { index: index + 1 }),
  getStoryboardIndex,
});
const promptEditorShotLabel = computed(() => {
  if (!currentPromptTarget.value) return "";
  return `S${String(getStoryboardIndex(currentPromptTarget.value) + 1).padStart(2, "0")}`;
});
const hasUnreadyFacts = computed(() => storyboard.value.some((item) => item.factStatus !== "ready"));
const promptDraftReferenceRows = computed(() => promptDraftReferences.value.map(referenceImageToView));

function createEmptyStoryboardFacts(): StoryboardFactDraft {
  return {
    scene: "",
    location: "",
    timeOfDay: "",
    sceneContinuityId: "",
    picture: "",
    action: "",
    shotSize: "",
    cameraMove: "",
    dialogue: "",
    sound: "",
    visibleEmotion: "",
  };
}

function getStoryboardFacts(row: Storyboard): StoryboardFactDraft {
  const tableRow = parseStoryboardTableRow(row.tableRowJson);
  const facts = createEmptyStoryboardFacts();
  facts.scene = String(row.scene ?? "");
  facts.location = String(tableRow?.location ?? row.location ?? "");
  facts.timeOfDay = String(tableRow?.timeOfDay ?? row.timeOfDay ?? "");
  facts.sceneContinuityId = String(tableRow?.sceneContinuityId ?? row.sceneContinuityId ?? "");
  facts.picture = String(tableRow?.picture ?? row.picture ?? "");
  facts.action = String(tableRow?.action ?? row.action ?? "");
  facts.shotSize = String(tableRow?.shotSize ?? row.shotSize ?? "");
  facts.cameraMove = String(tableRow?.cameraMove ?? row.cameraMove ?? "");
  facts.dialogue = tableRow?.dialogue?.length
    ? tableRow.dialogue.map((item) => [item.speaker, item.text].filter(Boolean).join("：")).join("\n")
    : String(row.dialogue ?? "");
  facts.sound = tableRow?.soundEffects?.length ? tableRow.soundEffects.join("\n") : String(row.sound ?? "");
  facts.visibleEmotion = String(tableRow?.visibleEmotion ?? row.visibleEmotion ?? "");
  return facts;
}

function getStoryboardFactPayload(row: Storyboard) {
  return storyboardFactKeys.reduce<Record<string, string | null>>((payload, key) => {
    const value = String(row[key] ?? "").trim();
    payload[key] = key === "sceneContinuityId" ? value || null : value;
    return payload;
  }, {});
}

function getStoryboardFactDraftPayload(facts: StoryboardFactDraft) {
  return storyboardFactKeys.reduce<Record<string, string | null>>((payload, key) => {
    const value = facts[key]?.trim() || "";
    payload[key] = key === "sceneContinuityId" ? value || null : value;
    return payload;
  }, {});
}

function notifyStoryboardIssues(data: any) {
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  if (!issues.length) return;
  const summary = issues
    .slice(0, 3)
    .map((issue: any) => issue?.message)
    .filter(Boolean)
    .join("；");
  window.$message.warning(summary || "分镜已保存为草稿，请补齐结构化分镜事实。");
}

function toggleGroup(key: string) {
  collapsedGroupKeys.value = collapsedGroupKeys.value.includes(key)
    ? collapsedGroupKeys.value.filter((item) => item !== key)
    : [...collapsedGroupKeys.value, key];
}

function getStoryboardIndex(row: Storyboard) {
  const identityIndex = storyboard.value.indexOf(row);
  if (identityIndex >= 0) return identityIndex;
  if (row.id != null) {
    const idIndex = storyboard.value.findIndex((item) => item.id === row.id);
    if (idIndex >= 0) return idIndex;
  }
  return 0;
}

function toggleSelect(id: number, checked: boolean) {
  if (!id) return;
  selectedIds.value = checked ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter((item) => item !== id);
}

function selectAll() {
  selectedIds.value = storyboard.value.map((s) => s.id!).filter(Boolean);
}

function assetTypeLabel(type?: string) {
  const map: Record<string, string> = {
    role: $t("workbench.production.node.storyboard.assetRole"),
    scene: $t("workbench.production.node.storyboard.assetScene"),
    tool: $t("workbench.production.node.storyboard.assetTool"),
    clip: $t("workbench.production.node.storyboard.assetClip"),
    audio: "音频",
    image: $t("workbench.production.node.storyboard.assetLocal"),
  };
  return map[type || ""] || $t("workbench.production.node.storyboard.assetOther");
}

function getReferenceMediaType(reference: Partial<ReferenceImage> | Partial<StoryboardReference> | any): "image" | "video" | "audio" | "text" {
  if (reference?.type === "audio" || reference?.parentType === "audio" || reference?.media?.type === "audio") return "audio";
  if (reference?.type === "video" || reference?.media?.type === "video") return "video";
  if (reference?.type === "text") return "text";
  return "image";
}

function getReferenceDisplayUrl(value: string, type: "image" | "video" | "audio" | "text", purpose: "preview" | "original" = "preview") {
  if (!value) return "";
  if (type === "image") return purpose === "original" ? getOriginalImageUrl(value) : getThumbnailImageUrl(value);
  return value;
}

function getStoryboardStatus(row: Storyboard, fallback: TaskStatus = "pending") {
  return normalizeTaskStatus(row.status ?? row.state, fallback);
}

function isStoryboardActive(row: Storyboard) {
  return ["queued", "submitting", "processing"].includes(getStoryboardStatus(row));
}

function isStoryboardCompleted(row: Storyboard) {
  return getStoryboardStatus(row) === "completed";
}

function isStoryboardFailed(row: Storyboard) {
  const status = getStoryboardStatus(row);
  return status === "failed" || status === "cancelled";
}

function hasStoryboardPreviewImage(row: Storyboard) {
  return isStoryboardCompleted(row) && Boolean(getStoryboardImageUrl(row, "preview") || getStoryboardImageUrl(row, "display"));
}

function getStoryboardPreviewLabel(row: Storyboard) {
  if (isStoryboardCompleted(row)) return $t("workbench.production.node.storyboard.noPreviewImages");
  if (isStoryboardActive(row)) return $t("generating");
  if (isStoryboardFailed(row)) return $t("workbench.production.node.storyboard.genFailed");
  return "等待生成";
}

function toStoryboardState(status: TaskStatus): Storyboard["state"] {
  if (status === "completed") return "已完成";
  if (status === "failed" || status === "cancelled") return "生成失败";
  if (status === "queued" || status === "submitting" || status === "processing") return "生成中";
  return "未生成";
}

function findAssetById(assetId: number) {
  for (const asset of props.assetsData) {
    if (asset.id === assetId) return asset;
    const derive = asset.derive?.find((item) => item.id === assetId);
    if (derive) return derive;
  }
  return null;
}

function getStoryboardReferences(row: Storyboard): ReferenceView[] {
  const assetRefs: ReferenceView[] = (row.associateAssetsIds ?? []).flatMap((id) => {
      const asset = findAssetById(id);
      const media = normalizeMediaRef((asset as any)?.media ?? asset, "image");
      const original = media ? getMediaOriginalUrl(media) : (asset as any)?.originalUrl || (asset as any)?.imageUrl || asset?.src || "";
      const preview = media ? getMediaPreviewUrl(media) : (asset as any)?.thumbnail || (asset as any)?.thumb || asset?.src || original;
      if (!preview && !original) return [];
      return [{
        key: `asset-${id}`,
        id,
        source: "asset" as const,
        sourceId: id,
        src: getThumbnailImageUrl(preview || original),
        originalSrc: getOriginalImageUrl(original || preview),
        label: asset?.name || String(id),
        group: assetTypeLabel(asset?.type),
        type: "image" as const,
      }];
    });
  const localRefs = (row.referenceImages ?? []).map((item) => {
    const type = getReferenceMediaType(item);
    const media = normalizeMediaRef((item as any).media ?? item, type === "audio" ? "audio" : "image");
    const preview = media ? getMediaPreviewUrl(media) : item.previewUrl || item.url;
    const original = media ? getMediaOriginalUrl(media) : item.url || item.previewUrl;
    return {
      key: `${item.source || "local"}-${item.id}`,
      localId: item.id,
      source: (item.source || "local") as ReferenceView["source"],
      sourceId: item.sourceId ?? item.id,
      src: getReferenceDisplayUrl(preview || original || "", type),
      originalSrc: getReferenceDisplayUrl(original || preview || "", type, "original"),
      label: item.name,
      group: assetTypeLabel(item.type ?? "image"),
      type,
    };
  });
  return [...assetRefs, ...localRefs];
}

function getGroupedReferences(row: Storyboard) {
  const groups: { group: string; items: ReferenceView[] }[] = [];
  const index = new Map<string, number>();
  getStoryboardReferences(row).forEach((item) => {
    let groupIndex = index.get(item.group);
    if (groupIndex == null) {
      groupIndex = groups.length;
      index.set(item.group, groupIndex);
      groups.push({ group: item.group, items: [] });
    }
    groups[groupIndex].items.push(item);
  });
  return groups;
}

function getAssetReferenceImagesByIds(ids: number[] = []): ReferenceImage[] {
  return ids
    .map((id) => {
      const asset = findAssetById(id) as (AssetItem & { thumbnail?: string; thumb?: string; imageUrl?: string; originalUrl?: string }) | null;
      const media = normalizeMediaRef((asset as any)?.media ?? asset, "image");
      const original = media ? getMediaOriginalUrl(media) : asset?.originalUrl || asset?.imageUrl || asset?.src || "";
      if (!original) return null;
      return {
        image: original,
        previewImage: media ? getMediaPreviewUrl(media) : asset?.thumbnail || asset?.thumb || asset?.src,
        media,
        label: asset!.name,
        source: "asset" as const,
        sourceId: id,
        group: assetTypeLabel(asset!.type),
        type: "image" as const,
      };
    })
    .filter(Boolean) as ReferenceImage[];
}

function getLocalReferenceImages(row: Storyboard): ReferenceImage[] {
  return (row.referenceImages ?? []).map((ref) => {
    const type = getReferenceMediaType(ref);
    const media = normalizeMediaRef((ref as any).media ?? ref, type === "audio" ? "audio" : "image");
    return {
    image: media ? getMediaOriginalUrl(media) : ref.url,
    previewImage: media ? getMediaPreviewUrl(media) : ref.previewUrl || ref.url,
    media,
    label: ref.name,
    source: ref.source,
    sourceId: ref.sourceId ?? ref.id,
    group: assetTypeLabel(ref.type ?? "image"),
    type,
  };
  });
}

function getStoryboardImageUrl(item: Storyboard, purpose: "preview" | "display" = "display") {
  const media = normalizeMediaRef((item as any).media ?? item, "image");
  if (media) return purpose === "preview" ? getMediaOriginalUrl(media) : getMediaPreviewUrl(media);
  if (purpose === "preview") return getOriginalImageUrl(item.originalUrl || item.imageUrl || item.url || item.src || "");
  return getThumbnailImageUrl(item.thumbnail || item.thumb || item.src || item.imageUrl || item.url || "");
}

function getPreviewImageFit(item: Storyboard): "cover" | "contain" {
  const src = getStoryboardImageUrl(item, "preview");
  const ratio = imageRatioMap[src] || (item.src ? imageRatioMap[item.src] : "") || defaultImageRatio.value;
  const [w, h] = ratio.split("/").map((value) => Number(value.trim()));
  if (!w || !h) return "cover";
  const value = w / h;
  return value < 0.75 || value > 2.1 ? "contain" : "cover";
}

function normalizeReferenceImage(reference: ReferenceImage): ReferenceImage {
  const type = getReferenceMediaType(reference);
  const media = normalizeMediaRef(reference.media ?? reference, type === "audio" ? "audio" : "image");
  return {
    image: media ? getMediaOriginalUrl(media) : getReferenceDisplayUrl(reference.image, type, "original"),
    previewImage: media ? getMediaPreviewUrl(media) : getReferenceDisplayUrl(reference.previewImage || reference.image, type),
    media,
    label: reference.label,
    token: reference.token,
    source: reference.source,
    sourceId: reference.sourceId,
    group: reference.group,
    type,
  };
}

function referenceImageToView(reference: ReferenceImage, index: number): ReferenceView {
  const type = getReferenceMediaType(reference);
  const media = normalizeMediaRef(reference.media ?? reference, type === "audio" ? "audio" : "image");
  const preview = media ? getMediaPreviewUrl(media) : reference.previewImage || reference.image;
  const original = media ? getMediaOriginalUrl(media) : reference.image || reference.previewImage || "";
  return {
    key: `${reference.source || "local"}-${reference.sourceId ?? index}`,
    id: reference.source === "asset" && typeof reference.sourceId === "number" ? reference.sourceId : undefined,
    localId: reference.source !== "asset" ? String(reference.sourceId ?? index) : undefined,
    source: reference.source || "local",
    sourceId: reference.sourceId,
    src: getReferenceDisplayUrl(preview || original, type),
    originalSrc: getReferenceDisplayUrl(original || preview, type, "original"),
    label: reference.label || $t("workbench.production.editImage.reference", { index: index + 1 }),
    token: reference.token || `@Image${index + 1}`,
    group: reference.group || assetTypeLabel(reference.source === "local" ? "image" : ""),
    type,
  };
}

function sortConnectedSourceNodes<T extends NodeType>(items: { node: T; order: number }[]): T[] {
  return [...items]
    .sort((left, right) => {
      const leftPosition = left.node.position;
      const rightPosition = right.node.position;
      const leftHasPosition = Number.isFinite(leftPosition?.y) && Number.isFinite(leftPosition?.x);
      const rightHasPosition = Number.isFinite(rightPosition?.y) && Number.isFinite(rightPosition?.x);
      if (!leftHasPosition || !rightHasPosition) return left.order - right.order;
      const yDelta = leftPosition.y - rightPosition.y;
      if (Math.abs(yDelta) > 1) return yDelta;
      const xDelta = leftPosition.x - rightPosition.x;
      if (Math.abs(xDelta) > 1) return xDelta;
      return left.order - right.order;
    })
    .map((item) => item.node);
}

function getIncomingSourceNodes(nodes: NodeType[], edges: any[], targetNodeId: string): NodeType[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return sortConnectedSourceNodes(
    edges
      .filter((edge) => edge.target === targetNodeId)
      .map((edge, order) => ({ node: nodeMap.get(edge.source), order }))
      .filter((item): item is { node: NodeType; order: number } => Boolean(item.node)),
  );
}

function getIncomingReferences(nodes: NodeType[], edges: any[], generatedNodeId: string): ReferenceImage[] {
  return getIncomingSourceNodes(nodes, edges, generatedNodeId)
    .flatMap((node) => {
      if (node.type === "upload") return [normalizeReferenceImage(node.data)];
      return [];
    });
}

function enrichLegacyReferences(references: ReferenceImage[], row: Storyboard) {
  const knownReferences = [...getAssetReferenceImagesByIds(row.associateAssetsIds), ...getLocalReferenceImages(row)];
  return references.map((reference) => {
    if (reference.source) return reference;
    const matched = knownReferences.find(
      (known) => getOriginalImageUrl(known.image) === getOriginalImageUrl(reference.image),
    );
    return normalizeReferenceImage(matched ? { ...matched, label: reference.label || matched.label } : {
      ...reference,
      source: "local",
      sourceId: uuid(),
      type: "image",
    });
  });
}

function getStoryboardSelectedMedia(row: Storyboard) {
  return normalizeMediaRef((row as any).media ?? row, "image")
    ?? row.originalUrl
    ?? row.imageUrl
    ?? row.url
    ?? row.src
    ?? "";
}

function resolveStoryboardPrimaryNode(nodes: NodeType[], row: Storyboard, preferredNodeId = "") {
  return resolvePrimaryGeneratedNode(nodes, {
    preferredNodeId,
    selectedMedia: getStoryboardSelectedMedia(row),
    prompt: row.prompt,
    fallbackToLast: true,
  });
}

function loadPromptDraftFromNode(nodeId: string) {
  const flow = promptFlowSnapshot.value;
  if (!flow) return;
  const node = flow.nodes.find(
    (item): item is Extract<NodeType, { type: "generated" }> => item.type === "generated" && item.id === nodeId,
  );
  if (!node) return;
  promptDraft.value = node.data.prompt || "";
  const incomingReferences = currentPromptTarget.value
    ? enrichLegacyReferences(getIncomingReferences(flow.nodes, flow.edges, node.id), currentPromptTarget.value)
    : getIncomingReferences(flow.nodes, flow.edges, node.id);
  const audioReferences = currentPromptTarget.value ? getLocalReferenceImages(currentPromptTarget.value).filter((ref) => ref.type === "audio") : [];
  const incomingKeys = new Set(incomingReferences.map((ref) => `${ref.source || ""}:${ref.sourceId ?? ""}:${ref.image}`));
  promptDraftReferences.value = [
    ...incomingReferences,
    ...audioReferences.filter((ref) => !incomingKeys.has(`${ref.source || ""}:${ref.sourceId ?? ""}:${ref.image}`)),
  ];
}

watch(promptPrimaryNodeId, (nodeId) => {
  if (nodeId && promptEditorVisible.value && !promptEditorLoading.value) loadPromptDraftFromNode(nodeId);
});

onBeforeUnmount(() => {
  storyboardFlowTaskReleases.forEach((release) => release());
  storyboardFlowTaskReleases.clear();
});

async function openPromptEditor(row: Storyboard) {
  currentPromptTarget.value = row;
  promptDraft.value = row.prompt || "";
  promptFactDraft.value = getStoryboardFacts(row);
  promptDraftReferences.value = [...getAssetReferenceImagesByIds(row.associateAssetsIds), ...getLocalReferenceImages(row)];
  promptPrimaryNodeId.value = "";
  promptNodeOptions.value = [];
  promptFlowSnapshot.value = null;
  promptEditorVisible.value = true;

  if (!row.flowId) return;
  promptEditorLoading.value = true;
  try {
    const { data } = await axios.post("/production/editImage/getImageFlow", { id: row.flowId });
    const nodes = (Array.isArray(data?.nodes) ? data.nodes : []) as NodeType[];
    const edges = Array.isArray(data?.edges) ? data.edges : [];
    promptFlowSnapshot.value = {
      nodes: cleanNodes(nodes) as NodeType[],
      edges: cleanEdges(edges),
    };
    const generatedNodes = nodes.filter((node): node is Extract<NodeType, { type: "generated" }> => node.type === "generated");
    promptNodeOptions.value = generatedNodes.map((node, index) => ({
      label: `${$t("workbench.production.node.storyboard.canvasNode")} ${index + 1}`,
      value: node.id,
    }));
    const primary = resolveStoryboardPrimaryNode(nodes, row);
    if (primary) {
      promptPrimaryNodeId.value = primary.id;
      loadPromptDraftFromNode(primary.id);
    }
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.editImage.fetchFailed"));
  } finally {
    promptEditorLoading.value = false;
  }
}

async function pickAssetsForPrompt() {
  const selected = await openAssetsSelector({ multiple: true, title: $t("common.selectAssets") });
  if (!selected.length) return;
  const assetItems = selected.flatMap((item: any) => {
    if (getReferenceMediaType(item) !== "audio" || !Array.isArray(item.sonAssets) || item.sonAssets.length === 0) {
      return [item];
    }
    return item.sonAssets.map((child: any) => ({
      ...child,
      parentName: item.name,
      parentType: item.type,
      sourceAssetId: item.id,
    }));
  });
  assetItems.forEach((item: any) => {
    if (promptDraftReferences.value.some((ref) => ref.source === "asset" && ref.sourceId === item.id)) return;
    const type = getReferenceMediaType(item);
    const media = normalizeMediaRef(item.media ?? item, type === "audio" ? "audio" : "image");
    const original = media ? getMediaOriginalUrl(media) : item.originalUrl || item.imageUrl || item.src || item.url;
    const preview = media ? getMediaPreviewUrl(media) : item.thumbnail || item.thumb || item.src || item.url || original;
    promptDraftReferences.value.push({
      image: original,
      previewImage: preview,
      media,
      label: item.name,
      source: "asset",
      sourceId: item.id,
      group: assetTypeLabel(type === "audio" ? "audio" : item.type),
      type,
    });
  });
}

function storyboardToPromptReference(item: Storyboard): ReferenceImage | null {
  const media = normalizeMediaRef((item as any).media ?? item, "image");
  const image = media
    ? getMediaOriginalUrl(media)
    : getOriginalImageUrl((item as any).originalUrl || (item as any).imageUrl || (item as any).url || item.src || (item as any).filePath || "");
  const previewImage = media
    ? getMediaPreviewUrl(media)
    : getThumbnailImageUrl((item as any).thumbnail || (item as any).thumb || item.src || (item as any).imageUrl || (item as any).url || (item as any).filePath || "");
  if (!image && !previewImage) return null;
  return {
    image: image || previewImage,
    previewImage: previewImage || image,
    media,
    label: item.prompt || (item.id ? `Storyboard #${item.id}` : $t("components.storyboardImageCheck.src")),
    source: "storyboard",
    sourceId: item.id,
    group: $t("workbench.globalTaskCenter.domain.storyboardImage"),
    type: "image",
  };
}

function confirmPromptStoryboardImages(rows: Storyboard[]) {
  promptStoryboardSelectorVisible.value = false;
  promptStoryboardSelectorResolve?.(rows);
  promptStoryboardSelectorResolve = null;
}

function cancelPromptStoryboardImages() {
  promptStoryboardSelectorVisible.value = false;
  promptStoryboardSelectorResolve?.([]);
  promptStoryboardSelectorResolve = null;
}

async function pickStoryboardImagesForPrompt() {
  const selected = await new Promise<Storyboard[]>((resolve) => {
    promptStoryboardSelectorResolve = resolve;
    promptStoryboardSelectorVisible.value = true;
  });
  selected.forEach((item) => {
    if (!item.id || promptDraftReferences.value.some((ref) => ref.source === "storyboard" && ref.sourceId === item.id)) return;
    const reference = storyboardToPromptReference(item);
    if (reference) promptDraftReferences.value.push(reference);
  });
}

async function uploadLocalPromptReference() {
  const files = await new Promise<FileList | null>((resolve) => {
    open();
    onChange((fileList) => resolve(fileList));
    onCancel(() => resolve(null));
  });
  if (!files?.length) return;
  const file = files[0];
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const { data } = await axios.post("/production/editImage/uploadImage", {
        base64Data: reader.result as string,
        projectId: project.value?.id,
        scriptId: episodesId.value,
      });
      const media = normalizeMediaRef(data?.media ?? data, "image");
      promptDraftReferences.value.push({
        image: media ? getMediaOriginalUrl(media) : data,
        previewImage: media ? getMediaPreviewUrl(media) : data,
        media,
        label: file.name,
        source: "local",
        sourceId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        group: assetTypeLabel("image"),
        type: "image",
      });
    } catch (e) {
      window.$message.error((e as any)?.message || $t("workbench.production.editImage.uploadFailed"));
    }
  };
  reader.readAsDataURL(file);
}

function removePromptReference(ref: ReferenceView) {
  promptDraftReferences.value = promptDraftReferences.value.filter(
    (item, index) => referenceImageToView(item, index).key !== ref.key,
  );
}

function previewPromptReference(ref: ReferenceView) {
  if (ref.type === "audio") {
    activePromptAudioReference.value = ref;
    promptAudioPreviewVisible.value = true;
    return;
  }
  openImageLightbox({
    images: [{
      src: ref.src,
      originalSrc: ref.originalSrc || getOriginalImageUrl(ref.src),
      title: ref.label,
    }],
  });
}

async function saveStoryboardInfo(row: Storyboard) {
  if (!row.id) return;
  try {
    const { data } = await axios.post("/production/storyboard/editStoryboardInfo", {
      id: row.id,
      prompt: row.prompt,
      videoDesc: "",
      duration: row.duration,
      groupKey: row.groupKey,
      groupName: row.groupName,
      groupIntent: row.groupIntent,
      beatId: row.beatId,
      ...getStoryboardFactPayload(row),
      associateAssetsIds: row.associateAssetsIds ?? [],
      referenceImages: row.referenceImages ?? [],
    });
    notifyStoryboardIssues(data);
    await productionStore.getFlowData();
  } catch (e) {
    window.$message.error((e as any)?.message || $t("common.saveFailed"));
  }
}

function splitStoryboardReferences(references: ReferenceImage[]) {
  const associateAssetsIds = references
    .filter((ref) => ref.source === "asset" && ref.type !== "audio" && Number.isFinite(Number(ref.sourceId)))
    .map((ref) => Number(ref.sourceId));
  const referenceImages: StoryboardReference[] = references
    .filter((ref) => ref.source !== "asset" || ref.type === "audio")
    .map((ref, index) => {
      const type = getReferenceMediaType(ref);
      const media = normalizeMediaRef(ref.media ?? ref, type === "audio" ? "audio" : "image");
      return {
      id: String(ref.sourceId ?? `reference-${index}-${Date.now()}`),
      source: ref.source === "storyboard" ? "storyboard" : ref.source === "asset" ? "asset" : "local",
      sourceId: ref.sourceId,
      url: media ? getMediaOriginalUrl(media) : getReferenceDisplayUrl(ref.image, type, "original"),
      previewUrl: media ? getMediaPreviewUrl(media) : getReferenceDisplayUrl(ref.previewImage || ref.image, type),
      media,
      name: ref.label || $t("workbench.production.editImage.reference", { index: index + 1 }),
      type: type === "audio"
        ? "audio"
        : ref.group === assetTypeLabel("role")
        ? "role"
        : ref.group === assetTypeLabel("scene")
          ? "scene"
          : ref.group === assetTypeLabel("tool")
            ? "tool"
            : ref.group === assetTypeLabel("clip")
              ? "clip"
        : "image",
    };
    });
  return {
    associateAssetsIds: [...new Set(associateAssetsIds)],
    referenceImages,
  };
}

function buildPromptFlow(row: Storyboard) {
  const snapshot = promptFlowSnapshot.value;
  const nodes = structuredClone(snapshot?.nodes ?? []) as NodeType[];
  let edges = structuredClone(snapshot?.edges ?? []) as any[];
  let generatedNodes = nodes.filter((node): node is Extract<NodeType, { type: "generated" }> => node.type === "generated");

  if (!generatedNodes.length) {
    const generatedNode: Extract<NodeType, { type: "generated" }> = {
      id: uuid(),
      type: "generated",
      position: { x: 600, y: 100 },
      data: {
        ...createGeneratedData(getStoryboardImageUrl(row, "preview"), promptDraft.value),
        isPrimary: true,
      },
    };
    nodes.push(generatedNode);
    generatedNodes = [generatedNode];
    promptPrimaryNodeId.value = generatedNode.id;
  }

  const primary =
    generatedNodes.find((node) => node.id === promptPrimaryNodeId.value) ??
    (generatedNodes.length === 1 ? generatedNodes[0] : undefined);
  if (!primary) throw new Error($t("workbench.production.node.storyboard.selectPrimaryRequired"));

  generatedNodes.forEach((node) => {
    node.data.isPrimary = node.id === primary.id;
  });

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const detachedUploadIds = new Set(
    edges
      .filter((edge) => edge.target === primary.id && nodeMap.get(edge.source)?.type === "upload")
      .map((edge) => edge.source),
  );
  edges = edges.filter((edge) => !(edge.target === primary.id && detachedUploadIds.has(edge.source)));

  const referencedNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node.type === "upload" && detachedUploadIds.has(node.id) && !referencedNodeIds.has(node.id)) nodes.splice(index, 1);
  }

  const internalReferences = getIncomingSourceNodes(nodes, edges, primary.id)
    .flatMap((source) => {
      if (source?.type !== "generated" || !source.data.generatedImage) return [];
      return [{
        image: getOriginalImageUrl(source.data.generatedImage),
        previewImage: getThumbnailImageUrl(source.data.generatedImage),
        label: source.data.prompt,
        source: "storyboard" as const,
        sourceId: source.id,
        type: "image" as const,
      }];
    });

  const visualReferences = promptDraftReferences.value.filter((reference) => reference.type !== "audio");
  const baseY = primary.position.y - Math.max(0, (visualReferences.length - 1) * 70);
  visualReferences.forEach((reference, index) => {
    const uploadId = uuid();
    nodes.push({
      id: uploadId,
      type: "upload",
      position: { x: primary.position.x - 430, y: baseY + index * 210 },
      data: normalizeReferenceImage(reference) as UploadNodeData,
    });
    edges.push({
      id: uuid(),
      source: uploadId,
      target: primary.id,
      ...DEFAULT_EDGE_OPTIONS,
    });
  });

  primary.data = {
    ...primary.data,
    prompt: promptDraft.value,
    references: [...internalReferences, ...visualReferences.map(normalizeReferenceImage)],
    isPrimary: true,
  };

  return { nodes, edges, primary };
}

function getPrimaryNodeOrThrow(nodes: NodeType[], row: Storyboard) {
  const primary = resolveStoryboardPrimaryNode(nodes, row);
  if (!primary) throw new Error($t("workbench.production.node.storyboard.selectPrimaryRequired"));
  return primary;
}

function applyHistoryToPrimaryNode(nodes: NodeType[], item: ImageHistoryItem, row: Storyboard) {
  const media = normalizeMediaRef(item.media ?? item.url ?? item, "image");
  const selectedMediaPath = getMediaPathForGeneration(media);
  if (!media || !selectedMediaPath) throw new Error($t("workbench.production.editImage.historyLoadFailed"));
  const primary = getPrimaryNodeOrThrow(nodes, row);
  const historyId = typeof item.id === "number" ? item.id : null;
  primary.data = {
    ...primary.data,
    resultMedia: media,
    generatedImage: getMediaPreviewUrl(media),
    selectedResult: {
      id: historyId,
      url: getMediaOriginalUrl(media),
      media,
      prompt: item.prompt ?? primary.data.prompt,
      model: item.model ?? primary.data.model,
      ratio: item.ratio ?? primary.data.ratio,
      quality: item.quality ?? primary.data.quality,
      createTime: item.createTime,
    },
    historyId,
    status: "completed",
    state: "success",
    taskId: null,
    unifiedTaskId: null,
    legacyTaskId: null,
    reason: "",
    isPrimary: true,
  };
  return { media, selectedMediaPath, primary };
}

async function loadStoryboardFlow(row: Storyboard) {
  if (!row.flowId) throw new Error($t("workbench.production.node.storyboard.selectPrimaryRequired"));
  const { data } = await axios.post("/production/editImage/getImageFlow", { id: row.flowId });
  return {
    nodes: structuredClone((Array.isArray(data?.nodes) ? data.nodes : []) as NodeType[]),
    edges: cleanEdges(Array.isArray(data?.edges) ? data.edges : []),
  };
}

function releaseStoryboardFlowTask(storyboardId: number) {
  storyboardFlowTaskReleases.get(storyboardId)?.();
  storyboardFlowTaskReleases.delete(storyboardId);
}

function applyStoryboardFlowTask(storyboardId: number, nodeId: string, task: RuntimeTask) {
  const row = storyboard.value.find((item) => item.id === storyboardId);
  if (!row) {
    releaseStoryboardFlowTask(storyboardId);
    return;
  }
  const record = (task.result ?? {}) as any;
  row.status = task.status;
  row.state = toStoryboardState(task.status);
  row.reason = task.status === "completed" ? "" : (task.reason ?? "");
  row.taskId = task.unifiedTaskId ?? String(task.legacyTaskId ?? task.taskId ?? row.taskId ?? "");
  row.unifiedTaskId = task.unifiedTaskId ?? null;
  row.legacyTaskId = task.legacyTaskId ?? null;
  row.flowId = Number(record.flowId ?? row.flowId) || row.flowId;
  row.nodeId = record.nodeId ?? task.nodeId ?? row.nodeId ?? nodeId;

  const media = normalizeMediaRef(record.media ?? record, "image");
  if (media) {
    row.media = media;
    row.src = getMediaPreviewUrl(media);
  }

  if (task.status === "completed") {
    queueMicrotask(() => {
      void finalizeStoryboardFlowTask(row, row.nodeId ?? nodeId, media).catch((error) => {
        window.$message.error((error as any)?.message || $t("workbench.production.editImage.saveFailed"));
      });
      releaseStoryboardFlowTask(storyboardId);
    });
  } else if (task.status === "failed" || task.status === "cancelled") {
    queueMicrotask(() => releaseStoryboardFlowTask(storyboardId));
  }
}

function bindStoryboardFlowTask(row: Storyboard, primaryNodeId: string, task: { taskId?: string | number; unifiedTaskId?: string; legacyTaskId?: string | number | null; status?: TaskStatus }) {
  if (!row.id) return;
  releaseStoryboardFlowTask(row.id);
  const taskId = task.unifiedTaskId ?? task.legacyTaskId ?? task.taskId;
  if (!taskId) return;
  const release = taskCenter.registerTask(
    {
      key: createTaskKey("flowImage", Number(project.value?.id), row.id, primaryNodeId || undefined, task.unifiedTaskId),
      domain: "flowImage",
      taskId,
      unifiedTaskId: task.unifiedTaskId,
      legacyTaskId: task.legacyTaskId ?? undefined,
      targetType: "storyboard",
      targetId: row.id,
      projectId: Number(project.value?.id),
      scriptId: Number(episodesId.value),
      nodeId: primaryNodeId || undefined,
      status: task.status && ["queued", "submitting", "processing"].includes(task.status) ? task.status : "processing",
    },
    (runtimeTask) => applyStoryboardFlowTask(row.id!, primaryNodeId, runtimeTask),
  );
  storyboardFlowTaskReleases.set(row.id, release);
}

async function finalizeStoryboardFlowTask(row: Storyboard, nodeId: string, media?: MediaRef) {
  if (!row.id || !row.flowId || !media) return;
  const { nodes, edges } = await loadStoryboardFlow(row);
  const primary = resolveStoryboardPrimaryNode(nodes, row, nodeId) ?? getPrimaryNodeOrThrow(nodes, row);
  const selectedMediaPath = getMediaPathForGeneration(primary.data.resultMedia ?? media);
  if (!selectedMediaPath) return;
  await axios.post("/production/editImage/saveImageFlow", {
    flowId: row.flowId,
    projectId: Number(project.value?.id),
    scriptId: Number(episodesId.value),
    targetType: "storyboard",
    targetId: row.id,
    nodes: cleanNodes(nodes),
    edges,
    selectedMediaPath,
  });
  row.status = "completed";
  row.state = "已完成";
  row.reason = "";
  row.media = media;
  row.src = getMediaPreviewUrl(media);
}

function getStoryboardTaskIds(record: Record<string, any>) {
  const unifiedTaskId =
    record.unifiedTaskId ?? (typeof record.taskId === "string" && !/^\d+$/.test(record.taskId) ? record.taskId : undefined);
  const legacyTaskId =
    record.legacyTaskId ?? (typeof record.taskId === "number" || (typeof record.taskId === "string" && /^\d+$/.test(record.taskId)) ? record.taskId : undefined);
  const taskId = unifiedTaskId ?? (legacyTaskId == null ? record.taskId : String(legacyTaskId));
  return { taskId, unifiedTaskId, legacyTaskId };
}

function removeStoryboardTask(row: Storyboard) {
  if (!row.id) return;
  releaseStoryboardFlowTask(row.id);
  taskCenter.removeTask(createTaskKey("storyboardImage", Number(project.value?.id), row.id));
  taskCenter.removeTask(createTaskKey("storyboardImage", Number(project.value?.id), row.id, undefined, row.unifiedTaskId ?? undefined));
  taskCenter.removeTask(createTaskKey("flowImage", Number(project.value?.id), row.id, row.nodeId ?? undefined, row.unifiedTaskId ?? undefined));
}

function applyStoryboardBatchRow(record: Record<string, any>) {
  const storyboardId = Number(record.id);
  if (!Number.isFinite(storyboardId)) return;
  const row = storyboard.value.find((item) => item.id === storyboardId);
  if (!row) return;

  if (record.prompt !== undefined) row.prompt = record.prompt ?? "";
  if (Array.isArray(record.associateAssetsIds)) row.associateAssetsIds = record.associateAssetsIds;
  if (Array.isArray(record.referenceImages)) row.referenceImages = record.referenceImages;
  if (record.flowId !== undefined) row.flowId = Number(record.flowId) || row.flowId;
  if (record.nodeId !== undefined) row.nodeId = record.nodeId ?? null;
  if (record.reason !== undefined) row.reason = record.reason ?? "";

  const media = normalizeMediaRef(record.media ?? record, "image");
  if (media) {
    row.media = media;
    row.src = getMediaPreviewUrl(media);
  } else if (record.src !== undefined) {
    row.src = record.src ?? null;
  }

  const status = normalizeTaskStatus(record.status ?? record.state, getStoryboardStatus(row, "processing"));
  row.status = status;
  row.state = toStoryboardState(status);
  const { taskId, unifiedTaskId, legacyTaskId } = getStoryboardTaskIds(record);
  row.taskId = taskId == null ? "" : String(taskId);
  row.unifiedTaskId = unifiedTaskId ?? null;
  row.legacyTaskId = legacyTaskId ?? null;

  if (isStoryboardActive(row)) {
    bindStoryboardFlowTask(row, row.nodeId ?? "", { taskId: row.taskId, unifiedTaskId, legacyTaskId, status });
  } else {
    releaseStoryboardFlowTask(storyboardId);
  }
}

async function submitStoryboardImageBatch(rows: Storyboard[], compulsory = false) {
  const items = rows.filter((item) => item.id && !isStoryboardActive(item));
  if (!items.length) return [];
  const previousStates = new Map<number, Pick<Storyboard, "status" | "state" | "reason">>();
  items.forEach((row) => {
    previousStates.set(row.id!, { status: row.status, state: row.state, reason: row.reason });
    removeStoryboardTask(row);
    row.status = "processing";
    row.state = toStoryboardState("processing");
    row.reason = "";
  });

  try {
    const { data } = await axios.post("/production/storyboard/batchGenerateImage", {
      projectId: Number(project.value?.id),
      scriptId: Number(episodesId.value),
      storyboardIds: items.map((item) => item.id!),
      compulsory,
    });
    const records = Array.isArray(data) ? data : [];
    if (!records.length) throw new Error($t("workbench.production.node.storyboard.batchGenerateFailed"));
    records.forEach((record) => applyStoryboardBatchRow(record));
    const returnedIds = new Set(records.map((record) => Number(record.id)).filter((id) => Number.isFinite(id)));
    items.forEach((row) => {
      if (!row.id || returnedIds.has(row.id)) return;
      const previous = previousStates.get(row.id);
      if (!previous) return;
      row.status = previous.status;
      row.state = previous.state;
      row.reason = previous.reason;
    });
    return records;
  } catch (error) {
    items.forEach((row) => {
      const previous = previousStates.get(row.id!);
      if (!previous) return;
      row.status = previous.status;
      row.state = previous.state;
      row.reason = previous.reason;
    });
    throw error;
  }
}

async function savePromptEditor() {
  const row = currentPromptTarget.value;
  if (!row?.id || promptEditorSaving.value) return;
  promptEditorSaving.value = true;
  try {
    const { nodes, edges, primary } = buildPromptFlow(row);
    const { data } = await axios.post("/production/editImage/saveImageFlow", {
      flowId: row.flowId ?? null,
      projectId: Number(project.value?.id),
      scriptId: Number(episodesId.value),
      targetType: "storyboard",
      targetId: row.id,
      nodes: cleanNodes(nodes),
      edges: cleanEdges(edges),
    });
    const flowId = data?.flowId ?? data?.id;
    if (!flowId) throw new Error($t("workbench.production.editImage.saveFailed"));

    const references = promptDraftReferences.value.map(normalizeReferenceImage);
    const referenceFields = splitStoryboardReferences(references);
    const { data: editResult } = await axios.post("/production/storyboard/editStoryboardInfo", {
      id: row.id,
      prompt: promptDraft.value,
      videoDesc: "",
      duration: row.duration,
      groupKey: row.groupKey,
      groupName: row.groupName,
      groupIntent: row.groupIntent,
      beatId: row.beatId,
      ...getStoryboardFactDraftPayload(promptFactDraft.value),
      ...referenceFields,
    });
    notifyStoryboardIssues(editResult);

    await productionStore.getFlowData();
    promptFlowSnapshot.value = {
      nodes: cleanNodes(nodes) as NodeType[],
      edges: cleanEdges(edges),
    };
    promptPrimaryNodeId.value = primary.id;
    promptEditorVisible.value = false;
    window.$message.success($t("common.editSuccess"));
  } catch (e) {
    window.$message.error((e as any)?.message || $t("common.saveFailed"));
  } finally {
    promptEditorSaving.value = false;
  }
}

async function regenerateSingleImage(row: Storyboard) {
  if (!row.id || isStoryboardActive(row)) return;
  try {
    await submitStoryboardImageBatch([row], true);
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.batchGenerateFailed"));
  }
}

async function generateGroup(rows: Storyboard[]) {
  try {
    await submitStoryboardImageBatch(rows, false);
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.batchGenerateFailed"));
  }
}

async function batchGenerateImage() {
  if (!selectedIds.value.length) return window.$message.warning($t("workbench.production.node.storyboard.pleaseSelectImage"));
  generateLoading.value = true;
  try {
    const selectedRows = storyboard.value.filter((item) => item.id && selectedIds.value.includes(item.id));
    await submitStoryboardImageBatch(selectedRows, false);
    window.$message.success($t("workbench.production.node.storyboard.batchGenerateSuccess"));
    selectedIds.value = [];
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.batchGenerateFailed"));
  } finally {
    generateLoading.value = false;
  }
}

function editStoryboaryImage(item: Storyboard, images: string[], insertAfterIndex: number | null = null) {
  currentRowStoryboardInfo.value = {
    id: insertAfterIndex == null ? item?.id! : null,
    insertAfterIndex,
  };
  currentRow.value = {
    flowId: item?.flowId ?? null,
    targetType: "storyboard",
    targetId: item?.id ?? null,
    resultImages: currentRowStoryboardInfo.value.id ? [{ src: images[0] || "", prompt: item.prompt ?? "" }] : [],
    referanceImages: currentRowStoryboardInfo.value.id
      ? [...getAssetReferenceImagesByIds(item.associateAssetsIds), ...getLocalReferenceImages(item)]
      : images.filter(Boolean),
  };
  visible.value = true;
}

async function save({ imageUrl, media, flowId, primaryNodeId, prompt, references }: ImageFlowSavePayload) {
  if (!flowId) return;
  const { id, insertAfterIndex } = currentRowStoryboardInfo.value;
  if (id === null && insertAfterIndex !== null && imageUrl) {
    const referenceFields = splitStoryboardReferences(references);
    const sourceFrame = storyboard.value[insertAfterIndex];
    const newFrame: Storyboard = {
      duration: 0,
      prompt,
      associateAssetsIds: referenceFields.associateAssetsIds,
      referenceImages: referenceFields.referenceImages,
      src: imageUrl,
      media,
      videoDesc: "",
      shouldGenerateImage: 1,
      groupKey: sourceFrame?.groupKey,
      groupName: sourceFrame?.groupName,
      groupIntent: sourceFrame?.groupIntent,
      beatId: sourceFrame?.beatId,
      scene: sourceFrame?.scene,
      location: sourceFrame?.location,
      timeOfDay: sourceFrame?.timeOfDay,
      sceneContinuityId: sourceFrame?.sceneContinuityId,
      picture: "",
      action: "",
      shotSize: sourceFrame?.shotSize,
      cameraMove: sourceFrame?.cameraMove,
      dialogue: "",
      sound: sourceFrame?.sound,
      visibleEmotion: "",
      status: "completed",
      state: "已完成",
    };
    const { data } = await axios.post("/production/storyboard/addStoryboard", {
      ...newFrame,
      projectId: project.value?.id,
      scriptId: episodesId.value,
      flowId,
    });
    notifyStoryboardIssues(data);
    await productionStore.getFlowData();
    return;
  }

  const target = storyboard.value.find((s) => s.id === id);
  if (target) {
    target.flowId = flowId;
      if (imageUrl) {
        target.src = imageUrl;
        target.media = media;
        target.status = "completed";
        target.state = "已完成";
      }
    if (primaryNodeId) {
      const referenceFields = splitStoryboardReferences(references);
      try {
        const { data } = await axios.post("/production/storyboard/editStoryboardInfo", {
          id: target.id,
          prompt,
          videoDesc: "",
          duration: target.duration,
          groupKey: target.groupKey,
          groupName: target.groupName,
          groupIntent: target.groupIntent,
          beatId: target.beatId,
          ...getStoryboardFactPayload(target),
          ...referenceFields,
        });
        notifyStoryboardIssues(data);
        await productionStore.getFlowData();
      } catch (e) {
        window.$message.error((e as any)?.message || $t("common.saveFailed"));
      }
    }
  }
}

function getImageRatio(src: string) {
  return imageRatioMap[src] || defaultImageRatio.value;
}

function onImageLoad(src: string, event: Event) {
  const img = event.target as HTMLImageElement;
  if (!img.naturalWidth || !img.naturalHeight) return;
  imageRatioMap[src] = `${img.naturalWidth} / ${img.naturalHeight}`;
  if (import.meta.env.DEV && (img.naturalWidth < img.clientWidth || img.naturalHeight < img.clientHeight)) {
    console.warn("[storyboard-preview] image may be low resolution", {
      src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
    });
  }
}

function openImageViewer(row: Storyboard) {
  if (!hasStoryboardPreviewImage(row)) {
    window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
    return;
  }
  const sourceItems = previewItems.value.filter(hasStoryboardPreviewImage);
  openImageLightbox({
    images: sourceItems.map((item) => {
      const src = getStoryboardImageUrl(item, "preview") || getStoryboardImageUrl(item, "display");
      return {
        src: getStoryboardImageUrl(item, "display") || src,
        originalSrc: src,
        title: `S${String(getStoryboardIndex(item) + 1).padStart(2, "0")}`,
      };
    }),
    index: Math.max(0, sourceItems.findIndex((item) => item.id === row.id)),
  });
}

function openPreviewDialog() {
  previewVisible.value = true;
  previewMode.value = "grid";
  previewGroupIndex.value = 0;
  previewPageIndex.value = 0;
  timelineIndex.value = 0;
}


function confirmDownloadPreview() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.production.node.storyboard.downloadAllPreview"),
    body: $t("workbench.production.node.storyboard.downloadAllPreviewConfirm"),
    confirmBtn: $t("common.confirm"),
    cancelBtn: $t("common.cancel"),
    onConfirm: async () => {
      await downLoadImage();
      dialog.destroy();
    },
  });
}

async function downLoadImage() {
  LoadingPlugin(true);
  const allIds = previewItems.value.filter(hasStoryboardPreviewImage).map((s) => s.id!);
  if (!allIds.length) {
    window.$message.warning($t("workbench.production.node.storyboard.noPreviewImages"));
    LoadingPlugin(false);
    return;
  }
  try {
    const res = await axios.post(
      "/production/storyboard/downPreviewImage",
      {
        storyboardIds: allIds,
      },
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(res as unknown as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storyboardImagePreview-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    window.$message.error($t("workbench.production.node.storyboard.imageLoadFailed"));
  } finally {
    LoadingPlugin(false);
  }
}

async function openStoryboardHistory(row: Storyboard) {
  if (!row.id) return;
  currentHistoryItem.value = row;
  historyVisible.value = true;
  historyLoading.value = true;
  historySelectedId.value = null;
  try {
    const { data } = await axios.post("/production/editImage/getImageHistory", {
      projectId: project.value?.id,
      scriptId: episodesId.value,
      targetType: "storyboard",
      targetId: row.id,
    });
    historyItems.value = (data ?? [])
      .map((item: any) => {
        const media = normalizeMediaRef(item.media ?? item, "image");
        return {
        id: item.id,
        url: media ? getMediaOriginalUrl(media) : getOriginalImageUrl(item.url ?? item.src ?? item.filePath ?? ""),
        previewUrl: media ? getMediaPreviewUrl(media) : getThumbnailImageUrl(item.previewUrl ?? item.thumbnail ?? item.thumb ?? item.url ?? item.src ?? item.filePath ?? ""),
        media,
        prompt: item.prompt,
        model: item.model,
        ratio: item.ratio,
        quality: item.quality,
        createTime: item.createTime,
      };
      })
      .filter((item: ImageHistoryItem) => item.url);
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.editImage.historyLoadFailed"));
  } finally {
    historyLoading.value = false;
  }
}

async function selectHistoryItem(item: ImageHistoryItem) {
  if (!currentHistoryItem.value?.id) return;
  historySelectedId.value = item.id;
  const target = currentHistoryItem.value;
  historyLoading.value = true;
  try {
    let nodes: NodeType[] = [];
    let edges: ReturnType<typeof cleanEdges> = [];
    if (target.flowId) {
      const { data: flow } = await axios.post("/production/editImage/getImageFlow", { id: target.flowId });
      nodes = structuredClone((Array.isArray(flow?.nodes) ? flow.nodes : []) as NodeType[]);
      edges = cleanEdges(Array.isArray(flow?.edges) ? flow.edges : []);
    }
    const { media, selectedMediaPath } = applyHistoryToPrimaryNode(nodes, item, target);
    const { data } = await axios.post("/production/editImage/saveImageFlow", {
      flowId: target.flowId ?? null,
      projectId: Number(project.value?.id),
      scriptId: Number(episodesId.value),
      targetType: "storyboard",
      targetId: target.id,
      nodes: cleanNodes(nodes),
      edges,
      selectedMediaPath,
    });
    target.flowId = data?.flowId ?? data?.id;
    target.src = getMediaPreviewUrl(media);
    target.media = media;
    target.status = "completed";
    target.state = "已完成";
    historyVisible.value = false;
    window.$message.success($t("workbench.production.node.storyboard.historySelected"));
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.editImage.saveFailed"));
  } finally {
    historyLoading.value = false;
  }
}

function handleDeleteSelected() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.storyboard.confirmBatchDeleteBody", { index: selectedIds.value.length }),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        if (!selectedIds.value.length) {
          dialog.destroy();
          return window.$message.error($t("workbench.production.node.storyboard.pleaseSelectImage"));
        }
        await axios.post("/production/storyboard/batchDelete", {
          ids: selectedIds.value,
          projectId: project.value?.id,
        });
        storyboard.value = storyboard.value.filter((i) => !selectedIds.value.includes(i.id!));
        selectedIds.value = [];
        window.$message.success($t("workbench.production.node.storyboard.deleteSuccess"));
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}

async function removeFn(id: number) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.storyboard.confirmDeleteBody"),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        await axios.post("/production/storyboard/removeFrame", {
          id,
          projectId: project.value?.id,
        });
        const index = storyboard.value.findIndex((s) => s.id === id);
        if (index !== -1) storyboard.value.splice(index, 1);
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.storyboard.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}

</script>
