<template>
  <div class="generatedNode">
    <Handle type="target" :position="Position.Left" />
    <GeneratedResultPanel
      :data="data"
      :generating="generating"
      :selected="selected"
      :options="options"
      @toggle-selected="selectedFn"
      @upload-option="clickHandler"
      @annotate="openAnnotator"
      @remove="removeNodes(props.id)" />
    <GenerateControls
      :data="data"
      :selected="selected"
      :generating="generating"
      :target-ready="targetReady"
      :reference-images="referenceImages"
      :references="references"
      @generate="handleGenerate"
      @open-history="openHistory"
      @keep="handleKeep" />
    <Handle type="source" :position="Position.Right" style="z-index: 999999" />
    <GenerationHistoryDialog
      v-model:visible="historyVisible"
      :history-loading="historyLoading"
      :history-items="historyItems"
      :selected-history-id="selectedHistoryId"
      @select-history="selectHistory" />
    <ImageAnnotatorDialog v-model:visible="annotatorVisible" :src="currentOriginalImage" @save="handleAnnotatorSave" />
  </div>
</template>

<script setup lang="ts">
import { Handle, useVueFlow, Position } from "@vue-flow/core";
import type { Ref } from "vue";
import axios from "@/utils/axios";
import {
  ACTIVE_IMAGE_TASK_STATUSES,
  isActiveImageTask,
  normalizeGeneratedNodeData,
  type GeneratedNodeData,
} from "../../utils/editImageType";
import type { DropdownOption } from "tdesign-vue-next/es/dropdown";
import type { Storyboard } from "../../utils/flowBuilder";
import openAssetsSelector from "@/utils/assetsCheck";
import { useFileDialog } from "@vueuse/core";
import projectStore from "@/stores/project";
import GeneratedResultPanel from "./generatedNode/GeneratedResultPanel.vue";
import GenerateControls from "./generatedNode/GenerateControls.vue";
import GenerationHistoryDialog from "./generatedNode/GenerationHistoryDialog.vue";
import ImageAnnotatorDialog from "./ImageAnnotatorDialog.vue";
import useTaskCenterStore, { createTaskKey, type RuntimeTask } from "@/stores/taskCenter";
import { getMediaOriginalUrl, getMediaPathForGeneration, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type { MediaRef } from "@/types/api";

interface ImageHistoryItem {
  id: number;
  url: string;
  previewUrl?: string;
  media?: MediaRef;
  prompt?: string;
  model?: string;
  ratio?: string;
  quality?: string;
  createTime?: string;
}

const props = defineProps<{
  id: string;
  data: GeneratedNodeData;
  projectId: number;
  flowId: number | null;
  saveFlow: () => Promise<number | null>;
  targetType?: "deriveAsset" | "storyboard";
  targetId?: number | null;
}>();

const emit = defineEmits<{
  keep: [imageUrl: string, nodeId: string];
  selectImage: [imageUrl: string, nodeId: string];
}>();
const { project } = storeToRefs(projectStore());
const openStoryboardCheck = inject<() => Promise<Storyboard[]>>("openStoryboardCheck")!;
const episodesId = inject<Ref<number>>("episodesId")!;
const { open, onChange, onCancel } = useFileDialog({ multiple: false, reset: true, accept: ".png,.jpg,.jpeg,.webp" });
const { removeNodes } = useVueFlow("editImage");

const selected = ref(true);
const historyVisible = ref(false);
const historyLoading = ref(false);
const historyItems = ref<ImageHistoryItem[]>([]);
const selectedHistoryId = ref<number | null>(null);
const annotatorVisible = ref(false);
const taskCenter = useTaskCenterStore();
let releaseTaskListener: (() => void) | null = null;
let lastAppliedTaskUpdate = 0;

const options = [
  { content: $t("workbench.production.editImage.uploadImage"), value: 1 },
  { content: $t("workbench.production.editImage.uploadStoryboardImage"), value: 2 },
  { content: $t("workbench.production.generatedNode.localUpload"), value: 3 },
];

const targetReady = computed(() => Boolean(props.flowId && props.targetType && props.targetId));
const generating = computed(() => Boolean(props.data.taskRequestPending || isActiveImageTask(props.data)));
const referenceImages = computed(() =>
  (props.data.references ?? []).map((item) => {
    const media = normalizeMediaRef(item.media, "image");
    if (!media) return item;
    return {
      ...item,
      media,
      image: getMediaOriginalUrl(media),
      previewImage: getMediaPreviewUrl(media),
    };
  }),
);
const references = computed(() => {
  return referenceImages.value.map((i) => ({ type: "image" as const, src: i.previewImage || i.image, label: i.label })).filter((i) => i.src);
});
const currentOriginalImage = computed(() =>
  props.data.resultMedia
    ? getMediaOriginalUrl(props.data.resultMedia)
    : props.data.selectedResult?.url || props.data.generatedImage || "",
);

function selectedFn() {
  selected.value = !selected.value;
}

function clickHandler(data: DropdownOption) {
  if (data.value == 1) {
    uploadFn();
  } else if (data.value == 2) {
    getStoryboardImage();
  } else if (data.value == 3) {
    localUpload();
  }
}

async function localUpload() {
  const files = await new Promise<FileList | null>((resolve) => {
    open();
    onChange((f) => resolve(f));
    onCancel(() => resolve(null));
  });
  if (!files?.length) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const { data } = await axios.post("/production/editImage/uploadImage", {
        base64Data: reader.result as string,
        projectId: props.projectId,
        scriptId: episodesId.value,
      });
      const media = normalizeMediaRef(data?.media ?? data, "image");
      const url = media ? getMediaOriginalUrl(media) : data;
      props.data.resultMedia = media;
      props.data.generatedImage = media ? getMediaPreviewUrl(media) : url;
      props.data.selectedResult = { url, media, prompt: props.data.prompt };
      await saveManualChange();
    } catch (e) {
      window.$message.error((e as any)?.message || $t("workbench.production.editImage.uploadFailed"));
    }
  };
  reader.readAsDataURL(files[0]);
}

async function uploadFn() {
  const selectedAssets = await openAssetsSelector({
    multiple: false,
    title: $t("workbench.production.editImage.selectImage"),
  });
  if (selectedAssets.length > 0) {
    const media = normalizeMediaRef((selectedAssets[0] as any).media ?? selectedAssets[0], "image");
    const filePath = media ? getMediaOriginalUrl(media) : selectedAssets[0].src!;
    props.data.resultMedia = media;
    props.data.generatedImage = media ? getMediaPreviewUrl(media) : filePath;
    props.data.selectedResult = { url: filePath, media, prompt: props.data.prompt };
    await saveManualChange();
  }
}

async function getStoryboardImage() {
  const rows = await openStoryboardCheck();
  if (rows.length > 0) {
    const media = normalizeMediaRef((rows[0] as any).media ?? rows[0], "image");
    const filePath = media ? getMediaOriginalUrl(media) : rows[0].src!;
    props.data.resultMedia = media;
    props.data.generatedImage = media ? getMediaPreviewUrl(media) : filePath;
    props.data.selectedResult = { url: filePath, media, prompt: props.data.prompt };
    await saveManualChange();
  }
}

async function saveManualChange() {
  Object.assign(props.data, normalizeGeneratedNodeData(props.data));
  try {
    await props.saveFlow();
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.editImage.saveFailed"));
  }
}

function openAnnotator() {
  if (!currentOriginalImage.value) return window.$message.error($t("workbench.production.editImage.noImage"));
  annotatorVisible.value = true;
}

async function handleAnnotatorSave(base64Data: string) {
  try {
    const { data } = await axios.post("/production/editImage/uploadImage", {
      base64Data,
      projectId: props.projectId,
      scriptId: episodesId.value,
    });
    const media = normalizeMediaRef(data?.media ?? data, "image");
    const url = media ? getMediaOriginalUrl(media) : data;
    props.data.resultMedia = media;
    props.data.generatedImage = media ? getMediaPreviewUrl(media) : url;
    props.data.selectedResult = {
      url,
      media,
      prompt: props.data.prompt,
      model: props.data.model,
      ratio: props.data.ratio,
      quality: props.data.quality,
    };
    props.data.status = "completed";
    props.data.state = "success";
    props.data.taskId = null;
    props.data.unifiedTaskId = null;
    props.data.legacyTaskId = null;
    props.data.reason = "";
    await saveManualChange();
    emit("selectImage", url, props.id);
    window.$message.success($t("workbench.production.editImage.annotateSaved"));
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.editImage.annotateSaveFailed"));
  }
}

async function handleGenerate() {
  if (!props.data.model) return window.$message.error($t("workbench.production.editImage.selectModel"));
  if (!props.data.quality) return window.$message.error($t("workbench.production.editImage.selectQuality"));
  if (!props.data.ratio) return window.$message.error($t("workbench.production.editImage.selectRatio"));
  if (!targetReady.value) return window.$message.error($t("workbench.production.editImage.targetMissing"));
  try {
    props.data.taskRequestPending = true;
    const flowId = await props.saveFlow();
    if (!flowId) throw new Error($t("workbench.production.editImage.saveFailed"));
    props.data.reason = "";
    const { data } = await axios.post("/production/editImage/generateFlowImageTask", {
      referenceMediaPaths: referenceImages.value
        .map((i) => getMediaPathForGeneration(i.media ?? normalizeMediaRef(i, "image")))
        .filter(Boolean),
      model: props.data.model,
      quality: props.data.quality,
      ratio: props.data.ratio,
      prompt: props.data.prompt,
      projectId: props.projectId,
      scriptId: episodesId.value,
      flowId,
      nodeId: props.id,
      targetType: props.targetType,
      targetId: props.targetId,
    });
    const legacyTaskId = data?.legacyTaskId ?? (data?.unifiedTaskId ? data?.taskId : data?.taskId ?? data?.id);
    const unifiedTaskId = data?.unifiedTaskId ?? (typeof data?.taskId === "string" && !/^\d+$/.test(data.taskId) ? data.taskId : undefined);
    const taskId = unifiedTaskId ?? legacyTaskId;
    if (taskId) {
      props.data.taskId = taskId;
      props.data.unifiedTaskId = unifiedTaskId ?? null;
      props.data.legacyTaskId = legacyTaskId ?? null;
      props.data.status = data?.status ?? "processing";
      props.data.state = "generating";
      bindTask({ unifiedTaskId, legacyTaskId, status: props.data.status });
      return;
    }
    if (data?.media || data?.url || data?.src) {
      applyTaskResult(data);
      const media = normalizeMediaRef(data?.media ?? data, "image");
      emit("selectImage", media ? getMediaOriginalUrl(media) : data.url ?? data.src, props.id);
      return;
    }
    throw new Error($t("workbench.production.editImage.taskCreateFailed"));
  } catch (e) {
    props.data.status = "failed";
    props.data.state = "failed";
    props.data.reason = (e as any)?.message || "";
    window.$message.error((e as any)?.message || $t("workbench.production.editImage.generateFailed"));
  } finally {
    props.data.taskRequestPending = false;
  }
}

function handleKeep() {
  const imageUrl = props.data.resultMedia ? getMediaOriginalUrl(props.data.resultMedia) : props.data.selectedResult?.url || props.data.generatedImage;
  if (!imageUrl) return window.$message.error($t("workbench.production.editImage.generateFirst"));
  emit("keep", imageUrl, props.id);
}

function applyTaskResult(data: any) {
  const media = normalizeMediaRef(data?.media ?? data, "image");
  const url = media ? getMediaOriginalUrl(media) : data?.url ?? data?.src;
  if (url) {
    props.data.resultMedia = media;
    props.data.generatedImage = media ? getMediaPreviewUrl(media) : url;
    props.data.selectedResult = {
      id: data?.historyId ?? data?.id ?? null,
      url,
      media,
      prompt: props.data.prompt,
      model: props.data.model,
      ratio: props.data.ratio,
      quality: props.data.quality,
      createTime: data?.createTime,
    };
  }
  props.data.historyId = data?.historyId ?? props.data.selectedResult?.id ?? null;
  props.data.status = "completed";
  props.data.state = "success";
  props.data.taskId = null;
  props.data.unifiedTaskId = null;
  props.data.legacyTaskId = null;
  props.data.reason = "";
}

function getTaskKey() {
  return createTaskKey("flowImage", props.projectId, props.targetId ?? props.flowId ?? props.id, props.id);
}

function applyRuntimeTask(task: RuntimeTask) {
  if (task.updatedAt < lastAppliedTaskUpdate) return;
  lastAppliedTaskUpdate = task.updatedAt;
  const data = (task.result ?? {}) as any;
  if (task.status === "completed") {
    applyTaskResult(data);
    const media = normalizeMediaRef(data?.media ?? data, "image");
    const url = media ? getMediaOriginalUrl(media) : data?.url ?? data?.src;
    if (url) emit("selectImage", url, props.id);
    return;
  }
  if (task.status === "failed" || task.status === "cancelled") {
    props.data.taskId = null;
    props.data.unifiedTaskId = null;
    props.data.legacyTaskId = null;
    if (props.data.generatedImage || props.data.selectedResult?.url) {
      props.data.status = "completed";
      props.data.state = "success";
      props.data.reason = "";
    } else {
      props.data.status = task.status;
      props.data.state = "failed";
      props.data.reason = task.reason || $t("workbench.production.editImage.generateFailed");
    }
    return;
  }
  if (ACTIVE_IMAGE_TASK_STATUSES.includes(task.status)) {
    props.data.taskId = task.unifiedTaskId ?? task.legacyTaskId ?? task.taskId;
    props.data.unifiedTaskId = task.unifiedTaskId ?? null;
    props.data.legacyTaskId = task.legacyTaskId ?? null;
    props.data.status = task.status;
    props.data.state = "generating";
    props.data.reason = task.reason ?? "";
  }
}

function bindTask(task: { unifiedTaskId?: string | null; legacyTaskId?: string | number | null; status?: GeneratedNodeData["status"] }) {
  releaseTaskListener?.();
  const taskId = task.unifiedTaskId ?? task.legacyTaskId ?? props.data.taskId;
  releaseTaskListener = taskCenter.registerTask(
    {
      key: getTaskKey(),
      domain: "flowImage",
      taskId: taskId ?? undefined,
      unifiedTaskId: task.unifiedTaskId ?? undefined,
      legacyTaskId: task.legacyTaskId ?? undefined,
      targetType: props.targetType,
      targetId: props.targetId ?? props.flowId ?? props.id,
      projectId: props.projectId,
      scriptId: episodesId.value,
      nodeId: props.id,
      status: task.status && ACTIVE_IMAGE_TASK_STATUSES.includes(task.status) ? task.status : "processing",
    },
    applyRuntimeTask,
  );
}

async function openHistory() {
  if (!targetReady.value) return;
  historyVisible.value = true;
  historyLoading.value = true;
  selectedHistoryId.value = props.data.historyId ?? null;
  try {
    const { data } = await axios.post("/production/editImage/getImageHistory", {
      projectId: props.projectId,
      scriptId: episodesId.value,
      targetType: props.targetType,
      targetId: props.targetId,
    });
    historyItems.value = (data ?? [])
      .map((item: any) => {
        const media = normalizeMediaRef(item.media ?? item, "image");
        return {
        id: item.id,
        url: media ? getMediaOriginalUrl(media) : item.url ?? item.src,
        previewUrl: media ? getMediaPreviewUrl(media) : item.previewUrl ?? item.thumbnail ?? item.thumb ?? item.url ?? item.src,
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

function selectHistory(item: ImageHistoryItem) {
  selectedHistoryId.value = item.id;
  props.data.resultMedia = item.media;
  props.data.generatedImage = item.media ? getMediaPreviewUrl(item.media) : item.url;
  props.data.historyId = item.id;
  props.data.selectedResult = item;
  props.data.status = "completed";
  props.data.state = "success";
  props.data.taskId = null;
  props.data.unifiedTaskId = null;
  props.data.legacyTaskId = null;
  props.data.reason = "";
  taskCenter.updateTask(getTaskKey(), { status: "completed", result: { media: item.media, historyId: item.id }, reason: "" });
  historyVisible.value = false;
  emit("selectImage", item.url, props.id);
}

onMounted(() => {
  props.data.model ||= project.value?.imageModel ?? "";
  props.data.quality ||= project.value?.imageQuality ?? "";
  props.data.ratio ||= props.targetType === "storyboard" ? (project.value?.videoRatio ?? "16:9") : "16:9";
  Object.assign(props.data, normalizeGeneratedNodeData(props.data));
  if (isActiveImageTask(props.data)) {
    bindTask({ unifiedTaskId: props.data.unifiedTaskId, legacyTaskId: props.data.legacyTaskId ?? props.data.taskId, status: props.data.status });
  }
});

onBeforeUnmount(() => {
  releaseTaskListener?.();
  releaseTaskListener = null;
});
</script>

<style lang="scss" scoped>
.generatedNode {
  position: relative;
  width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;

  .data {
    width: 100%;
    cursor: pointer;

    .title {
      height: 30px;
      padding: 5px;

      .titleText {
        margin-left: 5px;
        color: var(--td-text-color-secondary);
      }
    }

    .image {
      height: 320px;
      width: 100%;
      position: relative;
      .remove {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 9999;
        padding: 5px;
        border-radius: 10px;
        background-color: rgba(220, 50, 50, 0.7);
        cursor: pointer;
        &:hover {
          background-color: rgba(220, 50, 50, 1);
        }
      }
      .upload {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 9999;
        padding: 5px 10px;
        border-radius: 10px;
        background-color: rgba(0, 0, 0, 0.5);
      }
      .imageLoading {
        width: 100%;
        height: 100%;
        background-color: var(--td-bg-color-component);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;

        .loadingSpinner {
          width: 36px;
          height: 36px;
          border: 3px solid #d0d0d0;
          border-top-color: #5bccb3;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .loadingText {
          font-size: 14px;
          color: var(--td-text-color-secondary);
        }
      }

      .imageWrapper {
        position: relative;
        width: 100%;
        height: 100%;

        :deep(.nodeImage) {
          width: 100%;
          height: 100%;
          border-radius: 10px;
          border: 3px solid transparent;
          box-sizing: border-box;

          &.selected {
            border-color: var(--td-text-color-primary);
          }
        }
      }
      .imageToolsWrap {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      &:hover {
        .imageToolsWrap {
          opacity: 1;
          pointer-events: auto;
        }
      }
    }
  }

  .parameter {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 10px;
    width: 500px;
    border: 1px solid var(--td-border-level-2-color);
    background-color: var(--td-bg-color-container);
    border-radius: 10px;
    z-index: 9999;

    :deep(.image-refs),
    :deep(.imageRefs) {
      display: flex !important;
      align-items: center;
      height: 66px;
      max-height: 66px;
      overflow-x: auto;
      overflow-y: hidden;
      gap: 8px;
      padding: 10px;
      box-sizing: border-box;
    }

    :deep(.ref-thumb),
    :deep(.refThumb) {
      flex: 0 0 45px !important;
      width: 45px !important;
      height: 45px !important;
      min-width: 45px !important;
      max-width: 45px !important;
      min-height: 45px !important;
      max-height: 45px !important;
      overflow: hidden;
      border-radius: 10px;
      background: var(--td-bg-color-container-hover);
    }

    :deep(.ref-img),
    :deep(.refImg),
    :deep(.ref-img img),
    :deep(.refImg img) {
      display: block;
      width: 45px !important;
      height: 45px !important;
      min-width: 45px !important;
      max-width: 45px !important;
      min-height: 45px !important;
      max-height: 45px !important;
      object-fit: cover !important;
    }

    .text {
      height: 200px;
      min-height: 100px;
      max-height: 500px;
      display: flex;
      position: relative;
      overflow: auto;
      resize: vertical;
    }

    .operate {
      padding: 10px;
      height: 50px;

      .paramSelect {
        min-width: 100px;
        width: 100px;
      }

      .ml-5 {
        margin-left: 5px;
      }

      .generateBtn {
        margin-left: auto;
        --td-brand-color: #5bccb3;
        --td-brand-color-hover: #4ab8a0;
      }
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
