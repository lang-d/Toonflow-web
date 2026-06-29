<template>
  <t-card class="assets">
    <Handle :id="props.handleIds.target" type="target" :position="Position.Top" />
    <div class="titleBar dragHandle">
      <div class="title">{{ $t("workbench.production.node.assets.title") }}</div>
    </div>
    <div class="content">
      <AssetsGrid :assets="assets" @generate="generateDeriveAsset" @edit="openEdit" @remove="removeFn" @add="openAddDialog" />
    </div>
    <editImage v-model="visible" v-if="visible" :flowData="currentRow" @save="save" @task-start="handleFlowTaskStart" />
    <AddDeriveAssetDialog
      v-model:visible="addVisible"
      :form="addForm"
      :parent-name="currentParentAsset?.name"
      :confirm-loading="addSubmitting"
      @confirm="submitAddDerive" />
  </t-card>
</template>

<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import editImage from "../../components/editImage/index.vue";
import { type AssetItem, type DeriveAsset } from "../../utils/flowBuilder";
import type { ImageFlowSavePayload } from "../../utils/editImageType";
import axios from "@/utils/axios";
import useProjectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import type { TaskStatus } from "@/types/api";
import { getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import AssetsGrid from "./components/AssetsGrid.vue";
import AddDeriveAssetDialog from "./components/AddDeriveAssetDialog.vue";
import "./styles.scss";

const { project } = storeToRefs(useProjectStore());
const productionStore = productionAgentStore();
const { episodesId } = storeToRefs(productionStore);
const taskCenter = useTaskCenterStore();
const props = defineProps<{
  id: string;
  handleIds: {
    target: string;
  };
}>();

const assets = defineModel<AssetItem[]>({ required: true });
const currentRow = ref<{
  flowId?: number | null;
  targetType?: "deriveAsset";
  targetId?: number | null;
  resultImages: { src: string; prompt: string }[];
  referanceImages: string[];
}>({
  flowId: null,
  targetType: "deriveAsset",
  targetId: null,
  resultImages: [],
  referanceImages: [],
});
const visible = ref(false);
const currentAssetsId = ref<number | null>(null);
const addVisible = ref(false);
const addSubmitting = ref(false);
const currentParentAsset = ref<AssetItem | null>(null);
const addForm = reactive({
  name: "",
  desc: "",
});
const flowTaskReleases = new Map<number, () => void>();

type FlowTaskStartPayload = {
  flowId: number;
  nodeId: string;
  targetType?: "deriveAsset" | "storyboard";
  targetId?: number | null;
  taskId: string | number;
  unifiedTaskId?: string | null;
  legacyTaskId?: string | number | null;
  status?: TaskStatus;
};

function toAssetState(status: TaskStatus): DeriveAsset["state"] {
  if (status === "completed") return "已完成";
  if (status === "failed" || status === "cancelled") return "生成失败";
  if (status === "queued" || status === "submitting" || status === "processing") return "生成中";
  return "未生成";
}

function findCurrentDeriveAsset(targetId: number) {
  for (const asset of assets.value) {
    const target = asset.derive.find((item) => item.id === targetId);
    if (target) return target;
  }
  return null;
}

function releaseFlowTask(targetId: number) {
  flowTaskReleases.get(targetId)?.();
  flowTaskReleases.delete(targetId);
}

function applyFlowTask(targetId: number, task: RuntimeTask) {
  const target = findCurrentDeriveAsset(targetId);
  if (!target) {
    queueMicrotask(() => releaseFlowTask(targetId));
    return;
  }
  const record = (task.result ?? {}) as any;
  target.status = task.status;
  target.state = toAssetState(task.status);
  target.taskId = task.unifiedTaskId ?? String(task.legacyTaskId ?? task.taskId ?? target.taskId ?? "");
  target.unifiedTaskId = task.unifiedTaskId ?? target.unifiedTaskId ?? null;
  target.legacyTaskId =
    task.legacyTaskId == null || !Number.isFinite(Number(task.legacyTaskId))
      ? target.legacyTaskId
      : Number(task.legacyTaskId);
  target.flowId = Number(record.flowId ?? target.flowId) || target.flowId;
  target.nodeId = record.nodeId ?? task.nodeId ?? target.nodeId;
  target.errorReason = task.status === "completed" ? "" : (task.reason ?? "");
  if (record.prompt !== undefined) target.prompt = record.prompt;
  const media = normalizeMediaRef(record.media ?? record, "image");
  if (media && task.status === "completed") {
    target.media = media;
    target.src = getMediaPreviewUrl(media);
  }
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    queueMicrotask(() => releaseFlowTask(targetId));
  }
}

function openEdit(row: DeriveAsset, referanceImageUrl: string) {
  currentRow.value = {
    flowId: row?.flowId ?? null,
    targetType: "deriveAsset",
    targetId: row.id,
    resultImages: [{ src: row.src, prompt: row.prompt }],
    referanceImages: referanceImageUrl ? [referanceImageUrl] : [],
  };
  currentAssetsId.value = row.id;
  visible.value = true;
}

async function generateDeriveAsset(row: DeriveAsset) {
  if (!row.id || ["queued", "submitting", "processing"].includes(normalizeTaskStatus(row.status ?? row.state, "pending"))) return;
  row.errorReason = "";
  try {
    await productionStore.batchGenerateAssets([row.id]);
  } catch (e) {
    row.errorReason = (e as any)?.message ?? "";
    window.$message.error(row.errorReason || $t("workbench.novel.genFailed"));
  }
}

function openAddDialog(asset: AssetItem) {
  currentParentAsset.value = asset;
  addForm.name = "";
  addForm.desc = "";
  addVisible.value = true;
}

async function submitAddDerive() {
  const parent = currentParentAsset.value;
  if (!parent || addSubmitting.value) return;
  if (!addForm.name.trim()) return window.$message.warning($t("workbench.production.node.assets.assetNameRequired"));
  addSubmitting.value = true;
  try {
    const { data } = await axios.post("/production/assets/addDeriveAsset", {
      projectId: project.value?.id,
      scriptId: episodesId.value,
      assetsId: parent.id,
      name: addForm.name.trim(),
      desc: addForm.desc.trim(),
    });
    parent.derive ||= [];
    parent.derive.push({
      id: data.id,
      assetsId: data.assetsId ?? parent.id,
      name: data.name ?? addForm.name.trim(),
      prompt: data.prompt ?? "",
      desc: data.desc ?? addForm.desc.trim(),
      src: data.src ?? "",
      flowId: data.flowId,
      nodeId: data.nodeId,
      promptMode: data.promptMode,
      state: data.state ?? "未生成",
      type: data.type ?? parent.type,
      errorReason: data.errorReason ?? "",
    });
    addVisible.value = false;
    window.$message.success($t("common.addSuccess"));
  } catch (e) {
    window.$message.error((e as any)?.message || $t("common.addFailed"));
  } finally {
    addSubmitting.value = false;
  }
}

async function save({ imageUrl, media, flowId, primaryNodeId, prompt }: ImageFlowSavePayload) {
  const targetId = currentRow.value.targetId ?? currentAssetsId.value;
  if (!targetId || !flowId) return;

  for (const asset of assets.value) {
    const target = asset.derive.find((item) => item.id === targetId);
    if (!target) continue;
    target.flowId = flowId;
    target.nodeId = primaryNodeId ?? target.nodeId;
    if (prompt !== undefined) target.prompt = prompt;
    if (imageUrl) {
      target.src = imageUrl;
      target.media = media;
      target.status = "completed";
      target.state = "已完成";
      target.errorReason = "";
      delete target.taskId;
      delete target.unifiedTaskId;
      delete target.legacyTaskId;
      delete target.imageId;
    }
    break;
  }

  currentRow.value.flowId = flowId;
  if (prompt !== undefined && currentRow.value.resultImages[0]) {
    currentRow.value.resultImages[0].prompt = prompt;
  }
  if (imageUrl) {
    currentRow.value.resultImages = [
      {
        src: imageUrl,
        prompt: prompt ?? currentRow.value.resultImages[0]?.prompt ?? "",
      },
    ];
  }
}

function handleFlowTaskStart(payload: FlowTaskStartPayload) {
  if (payload.targetType !== "deriveAsset") return;
  const targetId = Number(payload.targetId ?? currentRow.value.targetId ?? currentAssetsId.value);
  if (!Number.isFinite(targetId)) return;
  const target = findCurrentDeriveAsset(targetId);
  if (!target) return;
  const status = normalizeTaskStatus(payload.status, "processing");
  target.flowId = payload.flowId ?? target.flowId;
  target.nodeId = payload.nodeId ?? target.nodeId;
  target.taskId = String(payload.taskId);
  target.unifiedTaskId = payload.unifiedTaskId ?? (typeof payload.taskId === "string" && !/^\d+$/.test(payload.taskId) ? payload.taskId : undefined);
  target.legacyTaskId =
    payload.legacyTaskId == null || !Number.isFinite(Number(payload.legacyTaskId))
      ? undefined
      : Number(payload.legacyTaskId);
  target.status = status;
  target.state = toAssetState(status);
  target.errorReason = "";
  currentRow.value.flowId = payload.flowId ?? currentRow.value.flowId;
  releaseFlowTask(target.id);
  const release = taskCenter.registerTask(
    {
      key: createTaskKey("flowImage", Number(project.value?.id), target.id, payload.nodeId, payload.unifiedTaskId ?? undefined),
      domain: "flowImage",
      taskId: payload.taskId,
      unifiedTaskId: payload.unifiedTaskId ?? undefined,
      legacyTaskId: payload.legacyTaskId ?? undefined,
      targetType: "deriveAsset",
      targetId: target.id,
      projectId: Number(project.value?.id),
      scriptId: Number(episodesId.value),
      nodeId: payload.nodeId,
      status,
    },
    (task) => applyFlowTask(target.id, task),
  );
  flowTaskReleases.set(target.id, release);
}

onUnmounted(() => {
  flowTaskReleases.forEach((release) => release());
  flowTaskReleases.clear();
});

async function removeFn(id: number) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.assets.confirmDeleteBody"),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        await axios.post("/production/assets/deleteAssetsDireve", {
          id,
          projectId: project.value?.id,
        });
        assets.value.forEach((item) => {
          const targetIndex = item.derive.findIndex((s) => s.id === id);
          if (targetIndex !== -1) {
            item.derive.splice(targetIndex, 1);
          }
        });
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.assets.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}
</script>
