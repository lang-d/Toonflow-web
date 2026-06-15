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
        @toggle-group="toggleGroup"
        @generate-group="generateGroup"
        @toggle-select="toggleSelect"
        @open-prompt-editor="openPromptEditor"
        @save-storyboard-info="saveStoryboardInfo"
        @open-image-viewer="openImageViewer"
        @regenerate-single-image="regenerateSingleImage"
        @edit-storyboard-image="editStoryboaryImage"
        @open-storyboard-history="openStoryboardHistory"
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
      :loading="promptEditorLoading"
      :saving="promptEditorSaving"
      :shot-label="promptEditorShotLabel"
      :video-desc="currentPromptTarget?.videoDesc || ''"
      :references="promptDraftReferenceRows"
      :node-options="promptNodeOptions"
      @pick-assets="pickAssetsForPrompt"
      @upload-local="uploadLocalPromptReference"
      @remove-reference="removePromptReference"
      @preview-reference="previewPromptReference"
      @confirm="savePromptEditor" />

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
import type { AssetItem, Storyboard, StoryboardReference } from "../../utils/flowBuilder";
import projectStore from "@/stores/project";
import openAssetsSelector from "@/utils/assetsCheck";
import productionAgentStore from "@/stores/productionAgent";
import StoryboardTableView from "./components/StoryboardTableView.vue";
import StoryboardGridView from "./components/StoryboardGridView.vue";
import StoryboardPreviewDialog from "./components/StoryboardPreviewDialog.vue";
import StoryboardPromptDialog from "./components/StoryboardPromptDialog.vue";
import StoryboardHistoryDialog from "./components/StoryboardHistoryDialog.vue";
import { openImageLightbox } from "@/composables/useImageLightbox";
import { getOriginalImageUrl, getThumbnailImageUrl } from "@/utils/imageUrl";
import { getMediaOriginalUrl, getMediaPathForGeneration, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type { MediaRef } from "@/types/api";
import { useStoryboardPreview } from "./composables/useStoryboardPreview";
import type { ImageHistoryItem, ReferenceView } from "./types";
import type {
  GeneratedNodeData,
  ImageFlowSavePayload,
  NodeType,
  ReferenceImage,
  UploadNodeData,
} from "../../utils/editImageType";
import { DEFAULT_EDGE_OPTIONS, cleanEdges, cleanNodes, createGeneratedData } from "../../utils/editImageType";
import { v4 as uuid } from "uuid";
import "./styles.scss";


const { project } = storeToRefs(projectStore());
const productionStore = productionAgentStore();
const { episodesId } = storeToRefs(productionStore);
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
const historySelectedId = ref<number | null>(null);
const currentHistoryItem = ref<Storyboard | null>(null);
const promptEditorVisible = ref(false);
const promptEditorLoading = ref(false);
const promptEditorSaving = ref(false);
const currentPromptTarget = ref<Storyboard | null>(null);
const promptDraft = ref("");
const promptDraftReferences = ref<ReferenceImage[]>([]);
const promptPrimaryNodeId = ref("");
const promptNodeOptions = ref<{ label: string; value: string }[]>([]);
const promptFlowSnapshot = ref<{ nodes: NodeType[]; edges: any[] } | null>(null);
const collapsedGroupKeys = ref<string[]>([]);
const imageRatioMap = reactive<Record<string, string>>({});

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
  { colKey: "shot", title: $t("workbench.production.node.storyboard.shot"), width: 118, cell: "shot" },
  { colKey: "assets", title: $t("workbench.production.node.storyboard.relatedAssets"), width: 250, cell: "assets" },
  { colKey: "prompt", title: $t("workbench.production.node.storyboard.prompt"), width: 390, cell: "prompt" },
  { colKey: "image", title: $t("workbench.production.node.storyboard.image"), width: 190, cell: "image" },
  { colKey: "duration", title: $t("workbench.production.node.storyboard.duration"), width: 112, cell: "duration" },
  { colKey: "operate", title: $t("common.operation"), width: 82, cell: "operate" },
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
const promptDraftReferenceRows = computed(() => promptDraftReferences.value.map(referenceImageToView));

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
    image: $t("workbench.production.node.storyboard.assetLocal"),
  };
  return map[type || ""] || $t("workbench.production.node.storyboard.assetOther");
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
      if (!asset?.src) return [];
      return [{
        key: `asset-${id}`,
        id,
        source: "asset" as const,
        sourceId: id,
        src: getThumbnailImageUrl(asset.src),
        originalSrc: getOriginalImageUrl(asset.src),
        label: asset.name || String(id),
        group: assetTypeLabel(asset!.type),
        type: "image" as const,
      }];
    });
  const localRefs = (row.referenceImages ?? []).map((item) => ({
    key: `${item.source || "local"}-${item.id}`,
    localId: item.id,
    source: (item.source || "local") as "local" | "storyboard",
    sourceId: item.sourceId ?? item.id,
    src: getThumbnailImageUrl(item.previewUrl || item.url),
    originalSrc: getOriginalImageUrl(item.url),
    label: item.name,
    group: assetTypeLabel(item.type ?? "image"),
    type: "image" as const,
  }));
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
    const media = normalizeMediaRef((ref as any).media ?? ref, "image");
    return {
    image: media ? getMediaOriginalUrl(media) : ref.url,
    previewImage: media ? getMediaPreviewUrl(media) : ref.previewUrl || ref.url,
    media,
    label: ref.name,
    source: ref.source,
    sourceId: ref.sourceId ?? ref.id,
    group: assetTypeLabel(ref.type ?? "image"),
    type: "image" as const,
  };
  });
}

function getStoryboardImageUrl(item: Storyboard, purpose: "preview" | "display" = "display") {
  const media = normalizeMediaRef((item as any).media ?? item, "image");
  if (media) return purpose === "preview" ? getMediaOriginalUrl(media) : getMediaPreviewUrl(media);
  if (purpose === "preview") return item.originalUrl || item.imageUrl || item.url || item.src || "";
  return item.src || item.thumbnail || item.thumb || item.imageUrl || item.url || "";
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
  return {
    image: getOriginalImageUrl(reference.image),
    previewImage: getThumbnailImageUrl(reference.previewImage || reference.image),
    label: reference.label,
    source: reference.source,
    sourceId: reference.sourceId,
    group: reference.group,
    type: reference.type || "image",
  };
}

function referenceImageToView(reference: ReferenceImage, index: number): ReferenceView {
  return {
    key: `${reference.source || "local"}-${reference.sourceId ?? index}`,
    id: reference.source === "asset" && typeof reference.sourceId === "number" ? reference.sourceId : undefined,
    localId: reference.source !== "asset" ? String(reference.sourceId ?? index) : undefined,
    source: reference.source || "local",
    sourceId: reference.sourceId,
    src: getThumbnailImageUrl(reference.previewImage || reference.image),
    originalSrc: getOriginalImageUrl(reference.image),
    label: reference.label || $t("workbench.production.editImage.reference", { index: index + 1 }),
    group: reference.group || assetTypeLabel(reference.source === "local" ? "image" : ""),
    type: reference.type || "image",
  };
}

function getIncomingReferences(nodes: NodeType[], edges: any[], generatedNodeId: string): ReferenceImage[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  return edges
    .filter((edge) => edge.target === generatedNodeId)
    .map((edge) => nodeMap.get(edge.source))
    .filter((node): node is NodeType => Boolean(node))
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

function resolvePrimaryNode(nodes: NodeType[], row: Storyboard) {
  const generatedNodes = nodes.filter((node): node is Extract<NodeType, { type: "generated" }> => node.type === "generated");
  const selectedImage = row.originalUrl || row.imageUrl || row.src || "";
  const imageMatched = selectedImage
    ? generatedNodes.find(
        (node) =>
          getOriginalImageUrl(node.data.selectedResult?.url || "") === getOriginalImageUrl(selectedImage) ||
          getOriginalImageUrl(node.data.generatedImage || "") === getOriginalImageUrl(selectedImage),
      )
    : undefined;
  return imageMatched ?? generatedNodes.find((node) => node.data.isPrimary) ?? (generatedNodes.length === 1 ? generatedNodes[0] : undefined);
}

function loadPromptDraftFromNode(nodeId: string) {
  const flow = promptFlowSnapshot.value;
  if (!flow) return;
  const node = flow.nodes.find(
    (item): item is Extract<NodeType, { type: "generated" }> => item.type === "generated" && item.id === nodeId,
  );
  if (!node) return;
  promptDraft.value = node.data.prompt || "";
  promptDraftReferences.value = currentPromptTarget.value
    ? enrichLegacyReferences(getIncomingReferences(flow.nodes, flow.edges, node.id), currentPromptTarget.value)
    : getIncomingReferences(flow.nodes, flow.edges, node.id);
}

watch(promptPrimaryNodeId, (nodeId) => {
  if (nodeId && promptEditorVisible.value && !promptEditorLoading.value) loadPromptDraftFromNode(nodeId);
});

async function openPromptEditor(row: Storyboard) {
  currentPromptTarget.value = row;
  promptDraft.value = row.prompt || "";
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
    promptFlowSnapshot.value = { nodes, edges };
    const generatedNodes = nodes.filter((node): node is Extract<NodeType, { type: "generated" }> => node.type === "generated");
    promptNodeOptions.value = generatedNodes.map((node, index) => ({
      label: `${$t("workbench.production.node.storyboard.canvasNode")} ${index + 1}`,
      value: node.id,
    }));
    const primary = resolvePrimaryNode(nodes, row);
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
  selected.forEach((item: any) => {
    if (promptDraftReferences.value.some((ref) => ref.source === "asset" && ref.sourceId === item.id)) return;
    const media = normalizeMediaRef(item.media ?? item, "image");
    promptDraftReferences.value.push({
      image: media ? getMediaOriginalUrl(media) : item.originalUrl || item.imageUrl || item.src,
      previewImage: media ? getMediaPreviewUrl(media) : item.thumbnail || item.thumb || item.src,
      media,
      label: item.name,
      source: "asset",
      sourceId: item.id,
      group: assetTypeLabel(item.type),
      type: "image",
    });
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
    await axios.post("/production/storyboard/editStoryboardInfo", {
      id: row.id,
      prompt: row.prompt,
      videoDesc: row.videoDesc,
      duration: row.duration,
      associateAssetsIds: row.associateAssetsIds ?? [],
      referenceImages: row.referenceImages ?? [],
    });
  } catch (e) {
    window.$message.error((e as any)?.message || $t("common.saveFailed"));
  }
}

function splitStoryboardReferences(references: ReferenceImage[]) {
  const associateAssetsIds = references
    .filter((ref) => ref.source === "asset" && Number.isFinite(Number(ref.sourceId)))
    .map((ref) => Number(ref.sourceId));
  const referenceImages: StoryboardReference[] = references
    .filter((ref) => ref.source !== "asset")
    .map((ref, index) => {
      const media = normalizeMediaRef(ref.media ?? ref, "image");
      return {
      id: String(ref.sourceId ?? `reference-${index}-${Date.now()}`),
      source: ref.source === "storyboard" ? "storyboard" : "local",
      sourceId: ref.sourceId,
      url: media ? getMediaOriginalUrl(media) : getOriginalImageUrl(ref.image),
      previewUrl: media ? getMediaPreviewUrl(media) : getThumbnailImageUrl(ref.previewImage || ref.image),
      media,
      name: ref.label || $t("workbench.production.editImage.reference", { index: index + 1 }),
      type: ref.group === assetTypeLabel("role")
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
        ...createGeneratedData(row.src || "", promptDraft.value),
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

  const remainingNodeMap = new Map(nodes.map((node) => [node.id, node]));
  const internalReferences = edges
    .filter((edge) => edge.target === primary.id && remainingNodeMap.get(edge.source)?.type === "generated")
    .flatMap((edge) => {
      const source = remainingNodeMap.get(edge.source);
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

  const baseY = primary.position.y - Math.max(0, (promptDraftReferences.value.length - 1) * 70);
  promptDraftReferences.value.forEach((reference, index) => {
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
    references: [...internalReferences, ...promptDraftReferences.value.map(normalizeReferenceImage)],
    isPrimary: true,
  };

  return { nodes, edges, primary };
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
      selectedMediaPath: getMediaPathForGeneration(normalizeMediaRef((row as any).media ?? row, "image")),
    });
    const flowId = data?.flowId ?? data?.id;
    if (!flowId) throw new Error($t("workbench.production.editImage.saveFailed"));

    const references = promptDraftReferences.value.map(normalizeReferenceImage);
    const referenceFields = splitStoryboardReferences(references);
    await axios.post("/production/storyboard/editStoryboardInfo", {
      id: row.id,
      prompt: promptDraft.value,
      videoDesc: row.videoDesc,
      duration: row.duration,
      ...referenceFields,
    });

    row.flowId = flowId;
    row.prompt = promptDraft.value;
    row.associateAssetsIds = referenceFields.associateAssetsIds;
    row.referenceImages = referenceFields.referenceImages;
    promptFlowSnapshot.value = { nodes, edges };
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
  if (!row.id || row.state === "生成中") return;
  row.state = "生成中";
  row.reason = "";
  try {
    await productionStore.batchGenerateStoryboard([row.id], true);
  } catch (e) {
    row.state = "生成失败";
    row.reason = (e as any)?.message ?? "";
  }
}

async function generateGroup(rows: Storyboard[]) {
  const ids = rows.map((item) => item.id!).filter(Boolean);
  if (!ids.length) return;
  await productionStore.batchGenerateStoryboard(ids, true);
}

async function batchGenerateImage() {
  if (!selectedIds.value.length) return window.$message.warning($t("workbench.production.node.storyboard.pleaseSelectImage"));
  generateLoading.value = true;
  try {
    await productionStore.batchGenerateStoryboard(selectedIds.value, true);
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
    const newFrame: Storyboard = {
      duration: 0,
      prompt,
      associateAssetsIds: referenceFields.associateAssetsIds,
      referenceImages: referenceFields.referenceImages,
      src: imageUrl,
      media,
      videoDesc: "",
      shouldGenerateImage: 1,
      state: "已完成",
    };
    const { data } = await axios.post("/production/storyboard/addStoryboard", {
      ...newFrame,
      projectId: project.value?.id,
      scriptId: episodesId.value,
      flowId,
    });
    storyboard.value.splice(insertAfterIndex + 1, 0, { ...newFrame, id: data.id!, flowId });
    productionStore.setFlowData();
    return;
  }

  const target = storyboard.value.find((s) => s.id === id);
  if (target) {
    target.flowId = flowId;
    if (imageUrl) {
      target.src = imageUrl;
      target.media = media;
      target.state = "已完成";
    }
    if (primaryNodeId) {
      const referenceFields = splitStoryboardReferences(references);
      try {
        await axios.post("/production/storyboard/editStoryboardInfo", {
          id: target.id,
          prompt,
          videoDesc: target.videoDesc,
          duration: target.duration,
          ...referenceFields,
        });
        target.prompt = prompt;
        target.associateAssetsIds = referenceFields.associateAssetsIds;
        target.referenceImages = referenceFields.referenceImages;
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
  const group = storyboardGroups.value.find((item) => item.items.some((story) => story.id === row.id));
  const sourceItems = (group?.items ?? storyboard.value).filter((item) => item.src && item.state === "已完成");
  openImageLightbox({
    images: sourceItems.map((item) => {
      const src = item.src || "";
      return {
        src: getThumbnailImageUrl(item.thumbnail || item.thumb || src),
        originalSrc: getOriginalImageUrl(item.originalUrl || item.imageUrl || src),
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
  const allIds = previewItems.value.map((s) => s.id!);
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
        url: media ? getMediaOriginalUrl(media) : item.url ?? item.src,
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
  let nodes: unknown[] = [];
  let edges: unknown[] = [];
  if (target.flowId) {
    const { data: flow } = await axios.post("/production/editImage/getImageFlow", { id: target.flowId });
    nodes = flow?.nodes ?? [];
    edges = flow?.edges ?? [];
  }
  const { data } = await axios.post("/production/editImage/saveImageFlow", {
    flowId: target.flowId ?? null,
    projectId: Number(project.value?.id),
    scriptId: Number(episodesId.value),
    targetType: "storyboard",
    targetId: target.id,
    nodes,
    edges,
    selectedMediaPath: getMediaPathForGeneration(item.media ?? normalizeMediaRef(item, "image")),
  });
  target.flowId = data?.flowId ?? data?.id;
  target.src = item.url;
  target.media = item.media;
  target.state = "已完成";
  historyVisible.value = false;
  window.$message.success($t("workbench.production.node.storyboard.historySelected"));
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
