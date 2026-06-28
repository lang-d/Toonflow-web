<template>
  <t-dialog
    :footer="false"
    :header="false"
    :closeBtn="false"
    v-model:visible="visible"
    attach="body"
    placement="center"
    mode="full-screen"
    class="fullscreenDialog">
    <div class="closure">
      <i-close-small theme="outline" size="24" fill="#4a4a4a" @click="closeFn" />
    </div>
    <VueFlow
      id="editImage"
      class="editImageCls"
      v-model:nodes="nodes"
      v-model:edges="edges"
      :min-zoom="0.01"
      fit-view-on-init
      @connect="onConnect"
      @edges-change="syncReferences">
      <template #node-upload="{ id, data }">
        <uploadNode :id="id" :data="data" @upload="syncReferences" @keep="sureNode" />
      </template>

      <template #node-generated="{ id, data }">
        <generatedNode
          :id="id"
          :data="data"
          :projectId="+project!.id"
          :flowId="localFlowId"
          :saveFlow="() => persistFlow('', id)"
          :targetType="flowData.targetType"
          :targetId="flowData.targetId"
          @keep="sureNode"
          @select-image="selectFinalImage" />
      </template>
      <template #node-directorStage="{ id, data }">
        <directorStageNode
          :id="id"
          :data="data"
          :projectId="+project!.id"
          :scriptId="episodesId"
          :flowId="localFlowId"
          :saveFlow="persistFlow"
          :targetType="flowData.targetType"
          :targetId="flowData.targetId"
          @change="onDirectorStageChange" />
      </template>
      <template #edge-removeLine="edgeProps">
        <removeLine v-bind="edgeProps" />
      </template>
      <Background></Background>
      <Controls />

      <Panel position="top-left">
        <div class="ac" style="gap: 8px">
          <t-dropdown
            :options="[
              { content: $t('workbench.production.editImage.upload'), value: 1 },
              { content: $t('workbench.production.editImage.generate'), value: 2 },
              { content: '3D导演台', value: 3 },
            ]"
            @click="clickHandler">
            <t-button theme="primary" shape="circle">
              <template #icon><i-plus /></template>
            </t-button>
          </t-dropdown>
          <t-tooltip theme="primary" :content="$t('workbench.production.autoLayoutLR')">
            <t-button class="guide-layout-btn" @click="layoutGraph('LR')" variant="outline" shape="circle">
              <template #icon>
                <i-tree-diagram />
              </template>
            </t-button>
          </t-tooltip>
        </div>
      </Panel>
    </VueFlow>
    <storyboardImageCheck v-model="storyboardVisible" :scriptId="episodesId!" @confirm="onStoryboardConfirm" @cancel="onStoryboardCancel" />
  </t-dialog>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import { VueFlow, useVueFlow, Panel, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import uploadNode from "./uploadNode.vue";
import generatedNode from "./generatedNode.vue";
import directorStageNode from "./directorStageNode.vue";
import storyboardImageCheck from "@/components/storyboardImageCheck.vue";
import type { Storyboard } from "../../utils/flowBuilder";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import removeLine from "./removeLine.vue";
import projectStore from "@/stores/project";

import axios from "@/utils/axios";
import type {
  NodeType,
  UploadNodeData,
  GeneratedNodeData,
  DirectorStageData,
  ReferenceImage,
  ImageFlowSavePayload,
} from "../../utils/editImageType";
import {
  DEFAULT_EDGE_OPTIONS,
  createGeneratedData,
  createDirectorStageData,
  cleanNodes,
  cleanEdges,
  isActiveImageTask,
  normalizeGeneratedNodeData,
  normalizeDirectorStageData,
  getDirectorStageGenerationReferences,
  resolvePrimaryGeneratedNode as resolvePrimaryGeneratedNodeFromFlow,
} from "../../utils/editImageType";
import { useLayout } from "../../utils/dagre";
import { v4 as uuid } from "uuid";
import { getOriginalImageUrl } from "@/utils/imageUrl";
import { getMediaOriginalUrl, getMediaPathForGeneration, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";

const episodesId = inject<Ref<number>>("episodesId");
const { project } = storeToRefs(projectStore());

// ---- storyboardImageCheck 统一管理 ----
const storyboardVisible = ref(false);
let storyboardResolve: ((rows: Storyboard[]) => void) | null = null;

provide("openStoryboardCheck", openStoryboardCheck);

const { toObject, fromObject, fitView } = useVueFlow({ id: "editImage" });
const { layout } = useLayout("editImage");

const props = withDefaults(
  defineProps<{
    flowData: {
      flowId?: number | null;
      targetType?: "deriveAsset" | "storyboard";
      targetId?: number | null;
      resultImages: { src: string; prompt: string }[]; // 结果图 url 和提示词
      referanceImages: (string | ReferenceImage)[]; // 参考图url
    };
    type?: string;
  }>(),
  {
    flowData: () => ({
      resultImages: [],
      referanceImages: [],
    }),
  },
);

const emit = defineEmits<{
  save: [payload: ImageFlowSavePayload];
}>();

const visible = defineModel({
  type: Boolean,
  default: false,
});
const { addEdges, getEdges } = useVueFlow("editImage");

const nodes = ref<NodeType[]>([]);
const edges = ref<Edge<any, any, string>[]>([]);
const localFlowId = ref<number | null>(props.flowData.flowId ?? null);
const selectedImageUrl = ref("");
let saveQueue: Promise<number | null> = Promise.resolve(localFlowId.value);

// 防抖定时器
let syncTimer: ReturnType<typeof setTimeout> | null = null;
function openStoryboardCheck(): Promise<Storyboard[]> {
  storyboardVisible.value = true;
  return new Promise<Storyboard[]>((resolve) => {
    storyboardResolve = resolve;
  });
}

function onStoryboardConfirm(rows: Storyboard[]) {
  storyboardVisible.value = false;
  storyboardResolve?.(rows);
  storyboardResolve = null;
}

function onStoryboardCancel() {
  storyboardVisible.value = false;
  storyboardResolve?.([]);
  storyboardResolve = null;
}

// 根据当前连线，将 upload 节点的图片同步到 generated 节点的 references
function syncReferences() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(_doSyncReferences, 60);
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

function getSortedConnectedNodes(sourceIds: string[], nodeMap: Map<string, NodeType>) {
  return sortConnectedSourceNodes(
    sourceIds
      .map((id, order) => ({ node: nodeMap.get(id), order }))
      .filter((item): item is { node: NodeType; order: number } => Boolean(item.node)),
  );
}

function _doSyncReferences() {
  const allNodes = nodes.value;
  const allEdges = edges.value;

  // 用 Map 预索引节点，避免重复 find（O(n) → O(1)）
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  // 按 target 分组 edges，减少重复遍历
  const edgesByTarget = new Map<string, string[]>();
  for (const e of allEdges) {
    const list = edgesByTarget.get(e.target);
    if (list) list.push(e.source);
    else edgesByTarget.set(e.target, [e.source]);
  }

  // 找出所有 generated 节点并同步 references
  for (const directorNode of allNodes) {
    if (directorNode.type !== "directorStage") continue;
    const sourceIds = edgesByTarget.get(directorNode.id) ?? [];
    const connectedRefs = getSortedConnectedNodes(sourceIds, nodeMap)
      .flatMap((n) => {
        if (n.type === "upload") return [normalizeReferenceImage(n.data as UploadNodeData)];
        if (n.type === "generated") return [normalizeGeneratedReference(n.data as GeneratedNodeData)];
        if (n.type === "directorStage") return normalizeDirectorAssetReferences(n.data as DirectorStageData);
        return [];
      })
      .filter((i) => i.image);
    const data = directorNode.data as DirectorStageData;
    if (!sameReferenceList(data.references ?? [], connectedRefs)) {
      data.references = connectedRefs;
      if (!data.scene.background && connectedRefs.length) data.scene.background = connectedRefs[0];
    }
  }

  for (const genNode of allNodes) {
    if (genNode.type !== "generated") continue;

    const sourceIds = edgesByTarget.get(genNode.id) ?? [];
    const connectedImages = getSortedConnectedNodes(sourceIds, nodeMap)
      .flatMap((n) => {
        if (n.type === "upload") {
          return [normalizeReferenceImage(n.data as UploadNodeData)];
        } else if (n.type === "generated") {
          return [normalizeGeneratedReference(n.data as GeneratedNodeData)];
        } else if (n.type === "directorStage") {
          return normalizeDirectorAssetReferences(n.data as DirectorStageData);
        }
        return [];
      })
      .filter((i) => i.image);

    // 仅在数据变化时才更新，避免无效的响应式触发
    const currentRefs: ReferenceImage[] = (genNode.data as GeneratedNodeData).references ?? [];
    const isSame = sameReferenceList(currentRefs, connectedImages);
    if (!isSame) {
      (genNode.data as GeneratedNodeData).references = connectedImages;
    }
  }
}

// 连接处理
const onConnect = (params: any) => {
  // 禁止自己连接自己
  if (params.source === params.target) return;

  // 禁止重复连线及反向连线：A→B 或 B→A 已存在则忽略
  const isDuplicate = getEdges.value.some(
    (e) => (e.source === params.source && e.target === params.target) || (e.source === params.target && e.target === params.source),
  );
  if (isDuplicate) return;

  addEdges([
    {
      id: uuid(),
      source: params.source,
      target: params.target,
      ...DEFAULT_EDGE_OPTIONS,
    },
  ]);
  // 连线建立后立即同步
  nextTick(syncReferences);
};
function clickHandler(value: any) {
  const type = value.value === 1 ? "upload" : value.value === 2 ? "generated" : "directorStage";
  addUploadNode(type);
}

function normalizeReferenceImage(input: string | ReferenceImage | UploadNodeData): ReferenceImage {
  if (typeof input === "string") {
    const media = normalizeMediaRef(input, "image");
    return { image: media ? getMediaOriginalUrl(media) : input, previewImage: media ? getMediaPreviewUrl(media) : input, media };
  }
  const media = normalizeMediaRef(input.media ?? input, "image");
  return {
    image: media ? getMediaOriginalUrl(media) : input.image || "",
    previewImage: media ? getMediaPreviewUrl(media) : input.previewImage || input.image || "",
    media,
    label: input.label,
    source: input.source,
    sourceId: input.sourceId,
    group: input.group,
    type: input.type,
  };
}

// 添加新的上传节点
function normalizeGeneratedReference(data: GeneratedNodeData): ReferenceImage {
  const media = normalizeMediaRef(data.resultMedia ?? data.selectedResult?.media ?? data.generatedImage, "image");
  return {
    image: media ? getMediaOriginalUrl(media) : data.selectedResult?.url || data.generatedImage || "",
    previewImage: media ? getMediaPreviewUrl(media) : data.generatedImage || data.selectedResult?.url || "",
    media,
    label: data.selectedResult?.prompt || data.prompt || "生成图",
    source: "generated",
    sourceId: data.historyId ?? data.taskId ?? undefined,
    type: "image",
  };
}

function normalizeDirectorAssetReferences(data: DirectorStageData): ReferenceImage[] {
  return getDirectorStageGenerationReferences(data).map((asset) => ({
    ...normalizeReferenceImage(asset),
    source: asset.source || "directorAsset",
    group: "directorStage",
    type: "image",
  }));
}

function sameReferenceList(left: ReferenceImage[], right: ReferenceImage[]) {
  return (
    left.length === right.length &&
    right.every(
      (img, idx) =>
        left[idx]?.image === img.image &&
        left[idx]?.previewImage === img.previewImage &&
        left[idx]?.label === img.label &&
        left[idx]?.source === img.source &&
        left[idx]?.sourceId === img.sourceId,
    )
  );
}

const addUploadNode = (type: "upload" | "generated" | "directorStage", image: string | ReferenceImage = "", prompt: string = "") => {
  const newNodeId = uuid();
  const lastNode = nodes.value.filter((n) => n.type === type).pop();
  const newY = lastNode ? lastNode.position.y + (type === "generated" ? 350 : 240) : 100;
  const newX = type === "generated" ? 700 : type === "directorStage" ? 380 : 100;
  const referenceImage = normalizeReferenceImage(image);

  const data =
    type === "generated"
      ? {
          ...createGeneratedData(referenceImage.image, prompt),
          isPrimary: !nodes.value.some((node) => node.type === "generated"),
        }
      : type === "directorStage"
        ? createDirectorStageData()
      : referenceImage;

  nodes.value.push({
    id: newNodeId,
    type,
    position: { x: newX, y: newY },
    data,
  } as NodeType);

  return newNodeId;
};
function getFlowTarget() {
  const projectId = Number(project.value?.id);
  const scriptId = Number(episodesId?.value);
  const { targetType, targetId } = props.flowData;
  if (!projectId || !scriptId || !targetType || !targetId) {
    throw new Error($t("workbench.production.editImage.targetMissing"));
  }
  return { projectId, scriptId, targetType, targetId };
}

async function persistFlowNow(selectedImageUrl = "", preferredNodeId = "") {
  resolvePrimaryGeneratedNodeFromFlow(nodes.value, {
    preferredNodeId,
    selectedMedia: selectedImageUrl,
    fallbackToLast: true,
  });
  const selectedMedia = normalizeMediaRef(
    nodes.value
      .filter((node): node is Extract<NodeType, { type: "generated" }> => node.type === "generated")
      .find((node) => sameImageUrl(node.data.generatedImage, selectedImageUrl) || sameImageUrl(node.data.selectedResult?.url, selectedImageUrl))
      ?.data.resultMedia ?? selectedImageUrl,
    "image",
  );
  const payload = {
    flowId: localFlowId.value,
    ...getFlowTarget(),
    nodes: cleanNodes(nodes.value),
    edges: cleanEdges(edges.value),
    selectedMediaPath: selectedMedia ? getMediaPathForGeneration(selectedMedia) : undefined,
  };

  const { data } = await axios.post("/production/editImage/saveImageFlow", { ...payload });
  localFlowId.value = data?.flowId ?? data?.id;
  if (!localFlowId.value) throw new Error($t("workbench.production.editImage.saveFailed"));
  return localFlowId.value;
}

function persistFlow(selectedImageUrl = "", preferredNodeId = "") {
  const save = saveQueue.catch(() => localFlowId.value).then(() => persistFlowNow(selectedImageUrl, preferredNodeId));
  saveQueue = save;
  return save;
}

function sameImageUrl(left = "", right = "") {
  return Boolean(left && right && getOriginalImageUrl(left) === getOriginalImageUrl(right));
}

function getPrimarySnapshot(imageUrl = "", preferredNodeId = "") {
  _doSyncReferences();
  const primary = resolvePrimaryGeneratedNodeFromFlow(nodes.value, {
    preferredNodeId,
    selectedMedia: imageUrl,
    fallbackToLast: true,
  });
  const nodeMap = new Map(nodes.value.map((node) => [node.id, node]));
  const references: ReferenceImage[] = [];
  if (primary) {
    for (const edge of edges.value) {
      if (edge.target !== primary.id) continue;
      const sourceNode = nodeMap.get(edge.source);
      if (sourceNode?.type === "upload") references.push(normalizeReferenceImage(sourceNode.data));
      if (sourceNode?.type === "directorStage") references.push(...normalizeDirectorAssetReferences(sourceNode.data as DirectorStageData));
    }
  }
  return {
    primaryNodeId: primary?.id,
    prompt: primary?.data.prompt ?? "",
    references,
  };
}

function emitSave(imageUrl: string, flowId: number, preferredNodeId = "") {
  const primary = resolvePrimaryGeneratedNodeFromFlow(nodes.value, {
    preferredNodeId,
    selectedMedia: imageUrl,
    fallbackToLast: true,
  });
  emit("save", {
    imageUrl,
    media: primary?.data.resultMedia ?? normalizeMediaRef(imageUrl, "image"),
    flowId,
    ...getPrimarySnapshot(imageUrl, preferredNodeId),
  });
}

async function selectFinalImage(imageUrl: string, nodeId = "") {
  if (!imageUrl) return;
  selectedImageUrl.value = imageUrl;
  resolvePrimaryGeneratedNodeFromFlow(nodes.value, {
    preferredNodeId: nodeId,
    selectedMedia: imageUrl,
    fallbackToLast: true,
  });
  try {
    const flowId = await persistFlow(imageUrl, nodeId);
    emitSave(imageUrl, flowId, nodeId);
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.editImage.saveFailed"));
  }
}

function onDirectorStageChange() {
  syncReferences();
}

function hasActiveImageTask() {
  return nodes.value.some((node) => {
    if (node.type !== "generated") return false;
    return Boolean(node.data.taskRequestPending || isActiveImageTask(node.data));
  });
}

function normalizeLoadedGeneratedData(data: GeneratedNodeData): GeneratedNodeData {
  return normalizeGeneratedNodeData({
    ...data,
    references: (data.references ?? []).map(normalizeReferenceImage),
  });
}

async function rebuildEmptyFlow() {
  nodes.value = [];
  edges.value = [];
  buildFlow();
  await nextTick();
  _doSyncReferences();
  const flowId = await persistFlow();
  emitSave("", flowId);
}

//保存节点
async function sureNode(imageUrl: string, nodeId = "") {
  try {
    selectedImageUrl.value = imageUrl;
    resolvePrimaryGeneratedNodeFromFlow(nodes.value, {
      preferredNodeId: nodeId,
      selectedMedia: imageUrl,
      fallbackToLast: true,
    });
    const flowId = await persistFlow(imageUrl, nodeId);
    emitSave(imageUrl, flowId, nodeId);
    visible.value = false;
  } catch (e) {
    window.$message.error((e as any).message || $t("workbench.production.editImage.saveFailed"));
  }
}
onMounted(async () => {
  try {
    localFlowId.value = props.flowData.flowId ?? null;
    if (!localFlowId.value) {
      await rebuildEmptyFlow();
      return;
    }
    const { data } = await axios.post("/production/editImage/getImageFlow", {
      id: localFlowId.value,
    });
    if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) {
      await rebuildEmptyFlow();
      return;
    }
    edges.value = (Array.isArray(data.edges) ? data.edges : []).map((e: any) => ({ ...e, ...DEFAULT_EDGE_OPTIONS }));
    nodes.value = data.nodes.map((node: NodeType) => {
      if (node.type === "upload") {
        return {
          ...node,
          data: normalizeReferenceImage(node.data as UploadNodeData),
        };
      }
      if (node.type === "directorStage") {
        return {
          ...node,
          data: normalizeDirectorStageData(node.data as DirectorStageData),
        };
      }
      return {
        ...node,
        data: normalizeLoadedGeneratedData(node.data as GeneratedNodeData),
      };
    });
    const selectedMedia = normalizeMediaRef(data.selectedMedia ?? props.flowData.resultImages[0], "image");
    selectedImageUrl.value = selectedMedia ? getMediaOriginalUrl(selectedMedia) : props.flowData.resultImages[0]?.src || "";
    resolvePrimaryGeneratedNodeFromFlow(nodes.value, {
      selectedMedia: selectedImageUrl.value,
      fallbackToLast: true,
    });
    await nextTick();
    _doSyncReferences();
    setTimeout(() => fitView({ duration: 300 }), 100);
  } catch (e) {
    window.$message.error((e as any).message || $t("workbench.production.editImage.fetchFailed"));
  }
});

function buildFlow() {
  const uploadIds: string[] = [];
  const generatedIds: string[] = [];
  props.flowData.referanceImages.forEach((i) => {
    uploadIds.push(addUploadNode("upload", i));
  });
  props.flowData.resultImages.forEach((i: { src: string; prompt: string }) => {
    const media = normalizeMediaRef(i, "image");
    generatedIds.push(addUploadNode("generated", media ? { image: getMediaOriginalUrl(media), previewImage: getMediaPreviewUrl(media), media } : i.src, i.prompt));
  });
  // 将每个 upload 节点连接到每个 generated 节点
  for (const sourceId of uploadIds) {
    for (const targetId of generatedIds) {
      edges.value.push({
        id: uuid(),
        source: sourceId,
        target: targetId,
        ...DEFAULT_EDGE_OPTIONS,
      });
    }
  }
  nextTick(() => {
    syncReferences();
    setTimeout(() => fitView({ duration: 300 }), 100);
  });
}

function closeFn() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.production.editImage.closeConfirmTitle"),
    body: $t("workbench.production.editImage.closeConfirmBody"),
    confirmBtn: $t("workbench.production.editImage.saveAndExit"),
    cancelBtn: $t("workbench.production.editImage.discardExit"),
    onConfirm: async () => {
      try {
        // 生成任务的节点状态由后端持续更新，生成前也已保存完整画布。
        // 生成中直接退出，避免前端 processing 快照覆盖后端刚完成的结果。
        const imageUrl = selectedImageUrl.value;
        const flowId = hasActiveImageTask() ? localFlowId.value : await persistFlow(imageUrl);
        if (!flowId) throw new Error($t("workbench.production.editImage.saveFailed"));
        emitSave(imageUrl, flowId);
        visible.value = false;
        dialog.destroy();
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.editImage.saveFailed"));
      }
    },
    onCancel: () => {
      visible.value = false;
      dialog.destroy();
    },
  });
}
async function layoutGraph(direction: "LR" | "TB") {
  const oldData = toObject();
  oldData.nodes = layout(oldData.nodes, oldData.edges, direction);
  await fromObject(oldData);
  await nextTick();
  fitView({ duration: 300 });
}
</script>

<style lang="scss" scoped>
.fullscreenDialog {
  .closure {
    position: absolute;
    margin-top: 10px;
    top: var(--td-comp-paddingTB-xl);
    right: var(--td-comp-paddingLR-xxl);
    z-index: 9999;
    cursor: pointer;
  }
  .editImageCls {
    width: 100%;
  }
}

:deep(.fullscreenDialog) {
  .t-dialog__header {
    display: none !important;
  }
  .t-dialog__body {
    padding: 0 !important;
  }
  .t-dialog__wrap {
    padding: 0 !important;
  }
}
.item {
  width: 45px;
  padding: 5px;
  color: var(--mainColor);
  &:hover {
    background-color: var(--td-bg-color-container-hover);
    border-radius: 4px;
    cursor: pointer;
  }
}

$handelSize: 12px;

:deep(.source) {
  height: $handelSize;
  width: $handelSize;
}
:deep(.target) {
  height: $handelSize;
  width: $handelSize;
}
</style>
