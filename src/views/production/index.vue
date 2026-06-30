<template>
  <VueFlow
    v-if="hasProject"
    class="flowMain"
    :class="{
      'is-interacting': isInteracting && otherSetting.interacting,
      'is-layouting': loading,
      'space-dragging': isSpacePressed,
    }"
    id="mainFlowBox"
    @mousedown="onSpaceMouseDown"
    :nodes="episodesId ? nodes : []"
    :edges="episodesId ? edges : []"
    :nodes-draggable="!isSpacePressed"
    :nodes-connectable="!isSpacePressed"
    :elements-selectable="!isSpacePressed"
    :only-render-visible-elements="false"
    :max-zoom="10"
    :min-zoom="0.02"
    :nodes-focusable="false"
    :edges-focusable="false"
    :edges-updatable="false"
    :elevate-nodes-on-select="true"
    :elevate-edges-on-select="false"
    :disable-keyboard-a11y="true"
    :select-nodes-on-drag="false"
    :auto-pan-on-node-drag="false"
    :auto-pan-on-connect="false"
    :zoom-on-double-click="false"
    :delete-key-code="null"
    :zoom-activation-key-code="null"
    :pan-activation-key-code="null"
    :pan-on-scroll="canvasWheelEvent == 'scroll' ? true : false"
    :zoom-on-scroll="canvasWheelEvent == 'zoom' ? true : false"
    :selection-key-code="null"
    :multi-selection-key-code="null">
    <template #node-script="props">
      <scriptNode :id="props.id" v-model="flowData.script" :handleIds="props.data.handleIds" />
    </template>
    <template #node-scriptPlan="props">
      <scriptPlan :id="props.id" v-model="flowData.scriptPlan" :handleIds="props.data.handleIds" />
    </template>
    <template #node-storyboardTable="props">
      <storyboardTable
        :id="props.id"
        v-model="flowData.storyboardTable"
        :meta="flowData.storyboardTableMeta"
        :last-failure="flowData.storyboardGenerationLastFailure"
        :storyboard-count="flowData.storyboard.length"
        :handleIds="props.data.handleIds" />
    </template>
    <template #node-assets="props">
      <assets :id="props.id" v-model="flowData.assets" :handleIds="props.data.handleIds" />
    </template>
    <template #node-storyboard="props">
      <storyboard :id="props.id" v-model="flowData.storyboard" :assetsData="flowData.assets" :handleIds="props.data.handleIds" />
    </template>
    <template #node-workbench="props">
      <workbench :id="props.id" v-model="flowData.workbench" :handleIds="props.data.handleIds" />
    </template>
    <!-- <template #node-poster="props">
      <poster :id="props.id" v-model="flowData.poster" :handleIds="props.data.handleIds" />
    </template> -->
    <Background></Background>
    <Controls />
    <div class="floatingWindow">
      <div class="episodesSelect f ac">
        <t-select
          :value="episodesId"
          :placeholder="$t('workbench.production.selectPlaceholder')"
          autoWidth
          :options="episodesOptions"
          filterable
          @change="handleEpisodesChange">
          <template #label>
            <i-document-folder size="24" />
          </template>
        </t-select>
        <t-tooltip placement="bottom" theme="primary" :content="$t('workbench.production.getFlowData')">
          <t-button class="guide-refresh-btn" @click="refFlowData" variant="outline">
            <template #icon>
              <i-refresh size="16" />
            </template>
          </t-button>
        </t-tooltip>
        <t-tooltip placement="bottom" theme="primary" :content="$t('workbench.production.autoLayoutLR')">
          <t-button class="guide-layout-btn" @click="layoutGraph()" variant="outline" style="margin-left: 8px">
            <template #icon>
              <i-tree-diagram size="16" />
            </template>
          </t-button>
        </t-tooltip>
        <i-loading-four class="spin" size="16" style="margin-left: 0.5rem" v-show="loading"></i-loading-four>
        <!-- <t-tooltip theme="primary" content="$t('workbench.production.autoLayoutTB')">
          <div class="item c" @click="layoutGraph('TB')">
            <i-branch-one theme="outline" size="24" />
          </div>
        </t-tooltip> -->
      </div>
      <div class="openRightChatBoxBtn c" v-show="!openShowVisible" @click.stop="openShowVisible = true">
        <i-menu-unfold-one theme="outline" size="24" />
      </div>
      <transition name="slide" v-show="openShowVisible" v-if="episodesId">
        <rightChatBox :title="title" v-model="flowData" @close="openShowVisible = false" />
      </transition>
    </div>
    <t-guide v-model="current" :steps="steps" @finish="() => (current = -1)" />
    <t-tag variant="outline" class="fps" v-if="!openShowVisible">{{ fps }}</t-tag>
  </VueFlow>
  <div v-else class="productionEmptyState c">
    <div class="emptyCard">
      <h3>未选择项目</h3>
      <p>生产台需要先选择一个项目。请返回项目列表后重新进入。</p>
      <t-button theme="primary" @click="goProjectList">返回项目列表</t-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocalStorage, useEventListener } from "@vueuse/core";
import { VueFlow, useVueFlow } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
//子node组件
import scriptNode from "./node/script.vue";
import scriptPlan from "./node/scriptPlan.vue";
import assets from "./node/assets.vue";
import storyboardTable from "./node/storyboardTable.vue";
import storyboard from "./node/storyboard.vue";
import workbench from "./node/workbench.vue";
import poster from "./node/poster.vue";
import rightChatBox from "./components/rightChatBox/index.vue";
import { useLayout } from "./utils/dagre";
import { useFlowBuilder } from "./utils/flowBuilder";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import useTaskCenterStore from "@/stores/taskCenter";

const { project } = storeToRefs(projectStore());
const hasProject = computed(() => Boolean(project.value?.id));
const router = useRouter();
import settingStore from "@/stores/setting";
const { canvasWheelEvent, otherSetting } = storeToRefs(settingStore());
const openShowVisible = ref(true);
const {
  toObject,
  fromObject,
  fitView,
  findNode,
  onNodeDragStart,
  onNodeDragStop,
  onMoveStart,
  onMoveEnd,
  updateNodeInternals,
  getNodes,
  getViewport,
  setViewport,
} = useVueFlow({ id: "mainFlowBox" });

// 按住空格+左键拖拽画布（即使在节点上）
const isSpacePressed = ref(false);
let dragOrigin = { x: 0, y: 0, vx: 0, vy: 0 };

function isEditableEventTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, button")) return true;

  const editable = target.closest("[contenteditable]");
  if (editable instanceof HTMLElement && editable.contentEditable !== "false") return true;

  return Boolean(target.closest(".t-input, .t-input__inner, .t-textarea, .t-textarea__inner, .t-select, .t-select-input"));
}

function onSpaceMouseDown(e: MouseEvent) {
  if (!isSpacePressed.value || e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const vp = getViewport();
  dragOrigin = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y };
  document.addEventListener("mousemove", onSpaceMouseMove);
  document.addEventListener("mouseup", onSpaceMouseUp, { once: true });
}
function onSpaceMouseMove(e: MouseEvent) {
  setViewport({ x: dragOrigin.vx + e.clientX - dragOrigin.x, y: dragOrigin.vy + e.clientY - dragOrigin.y, zoom: getViewport().zoom });
}
function onSpaceMouseUp() {
  document.removeEventListener("mousemove", onSpaceMouseMove);
  saveCurrentCanvasMemory();
}

useEventListener(document, "keydown", (e: KeyboardEvent) => {
  if (isEditableEventTarget(e.target)) return;
  if (e.code === "Space" && !e.repeat) {
    e.preventDefault();
    isSpacePressed.value = true;
  }
});
useEventListener(document, "keyup", (e: KeyboardEvent) => {
  if (e.code === "Space") {
    isSpacePressed.value = false;
  }
});

// 拖拽/平移期间降低渲染复杂度，优化性能
const isInteracting = ref(false);
let interactionTimer: ReturnType<typeof setTimeout> | null = null;

function startInteracting() {
  if (interactionTimer) clearTimeout(interactionTimer);
  isInteracting.value = true;
  taskCenter.beginInteraction();
}
function stopInteracting() {
  // 延迟恢复，避免频繁切换
  if (interactionTimer) clearTimeout(interactionTimer);
  interactionTimer = setTimeout(() => {
    isInteracting.value = false;
    taskCenter.endInteraction();
  }, 150);
}

onNodeDragStart(() => startInteracting());
onMoveStart(() => startInteracting());
onMoveEnd(() => {
  stopInteracting();
  saveCurrentCanvasMemory();
});
const { layout } = useLayout("mainFlowBox");

import productionAgentStore from "@/stores/productionAgent";
const agentStore = productionAgentStore();
const taskCenter = useTaskCenterStore();
const { episodesId, flowData } = storeToRefs(agentStore);
provide("episodesId", episodesId);

const loading = ref(false);

function goProjectList() {
  void router.replace("/project");
}

interface ProductionCanvasMemory {
  episodesId?: number;
}

const isBootstrapping = ref(true);
const canvasMemoryKey = computed(() => `productionCanvasMemory:${project.value?.id ?? "unknown"}`);
let episodeLoadRequestId = 0;
let layoutRequestId = 0;

function readCanvasMemory(): ProductionCanvasMemory | null {
  try {
    const raw = localStorage.getItem(canvasMemoryKey.value);
    return raw ? (JSON.parse(raw) as ProductionCanvasMemory) : null;
  } catch {
    return null;
  }
}

function writeCanvasMemory(memory: ProductionCanvasMemory) {
  try {
    localStorage.setItem(canvasMemoryKey.value, JSON.stringify(memory));
  } catch {}
}

function saveCurrentCanvasMemory() {
  if (!project.value?.id || !episodesId.value) return;
  writeCanvasMemory({
    episodesId: episodesId.value,
  });
}

// 节点位置
const nodePositions = ref<Record<string, { x: number; y: number }>>({
  script: { x: 0, y: 0 },
  scriptPlan: { x: 900, y: 0 },
  assets: { x: 1200, y: 4000 },
  storyboardTable: { x: 1800, y: 0 },
  storyboard: { x: 2500, y: 0 },
  workbench: { x: 3000, y: 0 },
  // poster: { x: 4500, y: 0 },
});
const { nodes, edges } = useFlowBuilder(flowData, nodePositions);

function getRenderedNodeDimensions(id: string) {
  const element = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${id}"]`);
  const node = findNode(id);
  return {
    width: element?.offsetWidth || node?.dimensions?.width || 0,
    height: element?.offsetHeight || node?.dimensions?.height || 0,
  };
}

// 用户拖拽节点后，同步位置到 nodePositions，防止 flowData 更新时位置被复原
onNodeDragStop(async ({ nodes: draggedNodes }) => {
  await nextTick();
  stopInteracting();
  for (const node of draggedNodes) {
    nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
  }
});

async function waitForNodesReady(maxRetries = 60, delay = 100, isCurrent: () => boolean = () => true) {
  while (maxRetries-- > 0) {
    if (!isCurrent()) return false;
    const nodes = getNodes.value;
    if (nodes.length > 0) {
      // 等待所有节点的 DOM 尺寸都已被 VueFlow 测量完成
      const allMeasured = nodes.every((node) => getRenderedNodeDimensions(node.id).width > 0);
      if (allMeasured) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return false;
}

onMounted(async () => {
  if (!hasProject.value) {
    isBootstrapping.value = false;
    void router.replace("/project");
    return;
  }
  await getScriptData();
  if (!episodesId.value) {
    isBootstrapping.value = false;
    return;
  }
  await loadEpisodeFlow();
  isBootstrapping.value = false;
});

const episodesOptions = ref<{ label: string; value: number }[]>([]);
function handleEpisodesChange(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const nextEpisodesId = Number(rawValue);
  if (!Number.isFinite(nextEpisodesId) || nextEpisodesId === episodesId.value) return;

  episodesId.value = nextEpisodesId;
}

async function getScriptData() {
  if (!project.value?.id) return;
  //获取剧本
  const { data: scriptRes } = await axios.post("/script/getScrptApi", {
    projectId: project.value?.id,
    name: "",
  });
  episodesOptions.value = scriptRes.map((ep: any) => ({
    label: ep.name,
    value: ep.id,
  }));
  if (episodesOptions.value.length) {
    const memory = readCanvasMemory();
    const savedEpisode = episodesOptions.value.find((option) => option.value === memory?.episodesId);
    episodesId.value = savedEpisode?.value ?? episodesOptions.value[0].value;
  }
}

interface LayoutGraphOptions {
  isCurrent?: () => boolean;
  manageLoading?: boolean;
  stabilizationPass?: number;
}

async function layoutGraph(direction: "LR" | "TB" = "LR", options: LayoutGraphOptions = {}) {
  const requestId = ++layoutRequestId;
  const isCurrent = () => requestId === layoutRequestId && (options.isCurrent?.() ?? true);
  const manageLoading = options.manageLoading ?? true;
  if (manageLoading) loading.value = true;

  try {
    // 等待 DOM 渲染完成
    await nextTick();

    // 强制 VueFlow 重新测量所有节点尺寸
    if (!isCurrent()) return false;
    if (!(await waitForNodesReady(60, 100, isCurrent))) return false;
    const nodeIds = getNodes.value.map((n) => n.id);
    updateNodeInternals(nodeIds);
    await nextTick();
    if (!isCurrent()) return false;

    // 等待所有节点的 dimensions 都已被 VueFlow 正确测量且尺寸稳定
    let retries = 30;
    let lastSnapshot = "";
    let stableCount = 0;
    while (retries-- > 0) {
      if (!isCurrent()) return false;
      const allMeasured = nodeIds.every((id) => {
        return getRenderedNodeDimensions(id).width > 0;
      });
      if (allMeasured) {
        // 检查尺寸是否稳定（连续两次相同才算就绪）
        const snapshot = nodeIds
          .map((id) => {
            const dimensions = getRenderedNodeDimensions(id);
            return `${id}:${dimensions.width}x${dimensions.height}`;
          })
          .join(",");
        if (snapshot === lastSnapshot) {
          stableCount++;
          if (stableCount >= 2) break;
        } else {
          stableCount = 0;
          lastSnapshot = snapshot;
        }
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    if (!isCurrent()) return false;
    const oldData = toObject();

    // 从 VueFlow 内部获取已测量的尺寸（流坐标系，无需 zoom 换算）
    const dims = new Map<string, { w: number; h: number }>();
    for (const n of oldData.nodes) {
      const dimensions = getRenderedNodeDimensions(n.id);
      dims.set(n.id, {
        w: dimensions.width || 150,
        h: dimensions.height || 50,
      });
    }

    const gap = 80; // 节点之间的最小留白

    if (direction === "LR") {
      // 手动布局：主链从左到右排列，assets 放在 script 正下方
      const mainChain = ["script", "scriptPlan", "storyboardTable", "storyboard", "workbench", "poster"];
      const chainNodes = mainChain.filter((id) => oldData.nodes.some((n) => n.id === id));

      // 逐个排列主链节点，x 基于前一个节点的右边缘 + gap，顶部对齐
      let curX = 0;
      for (const id of chainNodes) {
        const node = oldData.nodes.find((n) => n.id === id);
        const dim = dims.get(id);
        if (!node || !dim) continue;
        node.position.x = curX;
        node.position.y = 0;
        curX += dim.w + gap;
      }

      // assets 放在 script 正下方
      const scriptNode = oldData.nodes.find((n) => n.id === "script");
      const assetsNode = oldData.nodes.find((n) => n.id === "assets");
      const scriptDim = dims.get("script");
      if (scriptNode && assetsNode && scriptDim) {
        assetsNode.position.x = scriptNode.position.x;
        assetsNode.position.y = scriptNode.position.y + scriptDim.h + gap;
      }

      // 确保 assets 不与主链中其他节点重叠（检查水平方向）
      if (assetsNode) {
        const assetsDim = dims.get("assets");
        if (assetsDim) {
          const assetsRight = assetsNode.position.x + assetsDim.w;
          const assetsTop = assetsNode.position.y;
          const assetsBottom = assetsTop + assetsDim.h;
          for (const id of chainNodes) {
            if (id === "script") continue;
            const node = oldData.nodes.find((n) => n.id === id);
            const dim = dims.get(id);
            if (!node || !dim) continue;
            const nodeTop = node.position.y;
            const nodeBottom = nodeTop + dim.h;
            // 检查垂直范围是否有交集
            const vertOverlap = assetsTop < nodeBottom && assetsBottom > nodeTop;
            if (vertOverlap && node.position.x < assetsRight) {
              // 将该节点及其后续都右移
              const shift = assetsRight + gap - node.position.x;
              const idx = chainNodes.indexOf(id);
              for (let i = idx; i < chainNodes.length; i++) {
                const shiftNode = oldData.nodes.find((n) => n.id === chainNodes[i]);
                if (shiftNode) shiftNode.position.x += shift;
              }
              break;
            }
          }
        }
      }
    } else {
      // TB 方向使用 dagre 自动布局
      const widths = [...dims.values()].map((d) => d.w);
      const heights = [...dims.values()].map((d) => d.h);
      const avgWidth = widths.length ? widths.reduce((a, b) => a + b, 0) / widths.length : 150;
      const avgHeight = heights.length ? heights.reduce((a, b) => a + b, 0) / heights.length : 50;
      const ranksep = avgHeight * 0.5 + gap;
      const nodesep = avgWidth * 0.3 + gap;
      oldData.nodes = layout(oldData.nodes, oldData.edges, direction, nodesep, ranksep);
    }

    if (!isCurrent()) return false;
    await fromObject(oldData);
    await nextTick();
    if (!isCurrent()) return false;

    // 富文本和图片节点可能在位置更新后继续改变尺寸，最终 fitView 前再次等待稳定。
    updateNodeInternals(nodeIds);
    let finalRetries = 30;
    let finalSnapshot = "";
    let finalStableCount = 0;
    while (finalRetries-- > 0) {
      if (!isCurrent()) return false;
      const snapshot = nodeIds
        .map((id) => {
          const dimensions = getRenderedNodeDimensions(id);
          return `${id}:${dimensions.width}x${dimensions.height}`;
        })
        .join(",");
      if (snapshot === finalSnapshot) {
        finalStableCount++;
        if (finalStableCount >= 8) break;
      } else {
        finalStableCount = 0;
        finalSnapshot = snapshot;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const dimensionsChanged = oldData.nodes.some((node) => {
      const previous = dims.get(node.id);
      const current = getRenderedNodeDimensions(node.id);
      if (!previous || !current.width || !current.height) return false;
      return Math.abs(previous.w - current.width) > 1 || Math.abs(previous.h - current.height) > 1;
    });
    const stabilizationPass = options.stabilizationPass ?? 0;
    if (dimensionsChanged && stabilizationPass < 4) {
      return layoutGraph(direction, {
        ...options,
        stabilizationPass: stabilizationPass + 1,
      });
    }

    // 布局后同步新位置到 nodePositions，防止后续 flowData 变化时回跳
    for (const node of getNodes.value) {
      nodePositions.value[node.id] = { x: node.position.x, y: node.position.y };
    }

    await fitView({ duration: 300, padding: "5%" });
    return true;
  } finally {
    if (manageLoading && requestId === layoutRequestId) loading.value = false;
  }
}

const title = computed(() => {
  const episode = episodesOptions.value.find((option) => option.value === episodesId.value);
  return episode ? episode.label : "";
});

watch(
  () => episodesId.value,
  async (newVal) => {
    if (!newVal || newVal < 0) return;
    if (isBootstrapping.value) return;
    await loadEpisodeFlow();
  },
);

async function refFlowData() {
  await loadEpisodeFlow();
}

async function loadEpisodeFlow() {
  const scriptId = episodesId.value;
  if (!hasProject.value || !scriptId) return;

  const requestId = ++episodeLoadRequestId;
  const isCurrent = () => requestId === episodeLoadRequestId && episodesId.value === scriptId;
  loading.value = true;
  try {
    await agentStore.getFlowData(scriptId);
    if (!isCurrent()) return;
    agentStore.updateContext(scriptId);
    await agentStore.getHistory(scriptId);
    if (!isCurrent()) return;
    await layoutGraph("LR", { isCurrent, manageLoading: false });
    if (isCurrent()) saveCurrentCanvasMemory();
  } finally {
    if (isCurrent()) loading.value = false;
  }
}

const current = useLocalStorage("productionCurrent", 0);
const steps = [
  {
    element: ".episodesSelect",
    title: $t("workbench.production.guideSwitchEpisode"),
    body: $t("workbench.production.guideSwitchEpisodeBody"),
    placement: "bottom",
  },
  {
    element: ".guide-refresh-btn",
    title: $t("workbench.production.guideRefresh"),
    body: $t("workbench.production.guideRefreshBody"),
    placement: "bottom",
  },
  {
    element: ".guide-layout-btn",
    title: $t("workbench.production.guideLayoutBtn"),
    body: $t("workbench.production.guideLayoutBtnBody"),
    placement: "bottom",
  },
  {
    element: ".vue-flow__controls",
    title: $t("workbench.production.guideCanvasNav"),
    body: $t("workbench.production.guideCanvasNavBody"),
    placement: "right",
  },
] as any;

const fps = ref(0);
let lastFrameTime = performance.now();
let frameCount = 0;
function animate() {
  const now = performance.now();
  frameCount++;
  const elapsed = now - lastFrameTime;
  if (elapsed >= 500) {
    fps.value = Math.round((frameCount * 1000) / elapsed);
    frameCount = 0;
    lastFrameTime = now;
  }
  if (!openShowVisible.value) {
    requestAnimationFrame(animate);
  }
}

watch(openShowVisible, (val) => {
  if (!val) {
    animate();
  }
});

onBeforeUnmount(() => {
  if (interactionTimer) clearTimeout(interactionTimer);
  document.removeEventListener("mousemove", onSpaceMouseMove);
  taskCenter.endInteraction();
});
</script>
<style lang="scss" scoped>
.flowMain {
  height: 100%;
  &.space-dragging {
    cursor: grab !important;
    :deep(*) {
      cursor: grab !important;
    }
  }
  .floatingWindow {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    .episodesSelect {
      position: absolute;
      top: 10px;
      left: 0px;
      z-index: 9999;
      cursor: pointer;

      .item {
        width: 50px;
        padding: 5px;
        color: var(--mainColor);
        &:hover {
          background-color: var(--td-bg-color-container-hover);
          border-radius: 4px;
          cursor: pointer;
        }
      }
    }
    .openRightChatBoxBtn {
      position: absolute;
      top: 10px;
      right: 0;
      width: 40px;
      height: 40px;
      background-color: var(--td-bg-color-secondarycontainer);
      border-radius: 10px;
      z-index: 10;
      cursor: pointer;
    }
  }
  :deep(.slide-enter-active),
  :deep(.slide-leave-active) {
    transition: transform 0.3s ease-out;
  }
  :deep(.slide-enter-from) {
    transform: translateX(100%);
  }
  :deep(.slide-leave-to) {
    transform: translateX(100%);
  }
}

// 拖拽/平移时优化渲染性能
.productionEmptyState {
  width: 100%;
  height: 100%;
  min-height: 420px;
  .emptyCard {
    width: min(420px, 90%);
    padding: 24px;
    border: 1px solid var(--td-border-level-1-color);
    border-radius: 8px;
    background: var(--td-bg-color-container);
    box-shadow: var(--td-shadow-2);
    text-align: center;
    h3 {
      margin: 0 0 12px;
    }
    p {
      margin: 0 0 18px;
      color: var(--td-text-color-secondary);
      line-height: 1.6;
    }
  }
}

.flowMain.is-interacting {
  :deep(.vue-flow__node) {
    will-change: transform;
    contain: layout style paint;
  }
  :deep(.vue-flow__transformationpane) {
    will-change: transform;
  }
  :deep(.t-image),
  :deep(.assetImage),
  :deep(.frameImg),
  :deep(.assetImageWrap) {
    pointer-events: none;
    contain: strict;
  }
  // 禁用 hover 效果，减少样式重算
  :deep(.imageToolsWrap),
  :deep(.addBetween) {
    display: none !important;
  }
}

.flowMain.is-layouting {
  :deep(.assetItemBox) {
    content-visibility: visible;
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
:deep(.dragHandle) {
  padding: 4px;
  border-radius: 4px;
  transition: backdrop-filter 0.3s ease-out;
  &:hover {
    cursor: move;
    backdrop-filter: brightness(0.95);
  }
}
.fps {
  position: absolute;
  bottom: 10px;
  right: 0px;
  padding: 2px 6px;
  font-size: 12px;
  border-radius: 4px;
}
</style>
