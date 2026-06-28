<template>
  <div class="directorStageNode">
    <Handle type="target" :position="Position.Left" />
    <div class="nodeCard">
      <div class="nodeHeader">
        <div class="nodeHeading">
          <strong>{{ data.title || "3D导演台" }}</strong>
          <span>{{ data.items.length }} 个对象 · {{ data.cameras.length }} 个机位</span>
        </div>
        <div class="nodeActions">
          <t-button size="small" theme="primary" @click="openEditor">打开</t-button>
          <t-tooltip content="删除导演台节点">
            <t-button size="small" shape="square" theme="danger" variant="outline" @click="confirmDeleteNode">
              <template #icon><i-delete /></template>
            </t-button>
          </t-tooltip>
        </div>
      </div>
      <button class="nodePreview" type="button" :style="previewBackgroundStyle" @dblclick="openEditor">
        <span v-if="!previewUrl" class="emptyPreview">
          <i-picture size="30" />
          <span>打开导演台搭建场景</span>
        </span>
        <span v-else class="previewBadge">{{ activeCamera?.name || "当前机位" }}</span>
      </button>
      <div class="nodeSummary">
        <span>角色 {{ actorCount }}</span>
        <span>道具 {{ propCount }}</span>
        <span>引用 {{ data.references.length }}</span>
      </div>
    </div>
    <Handle type="source" :position="Position.Right" />

    <t-dialog
      v-model:visible="visible"
      attach="body"
      :footer="false"
      :header="false"
      :close-btn="false"
      :destroy-on-close="true"
      mode="full-screen"
      class="directorStageDialog">
      <div class="directorShell">
        <header class="topBar">
          <div class="brandBlock">
            <strong>3D导演台</strong>
            <span :class="['saveState', saveState]">{{ saveStateLabel }}</span>
          </div>
          <t-radio-group v-model="data.mode" variant="default-filled" size="small" @change="scheduleSave">
            <t-radio-button value="director">导演视角</t-radio-button>
            <t-radio-button value="camera">机位视角</t-radio-button>
          </t-radio-group>
          <div class="topActions">
            <t-tooltip content="快捷键：V 移动，R 旋转，S 缩放，Esc 退出">
              <t-button shape="square" variant="text">?</t-button>
            </t-tooltip>
            <t-button variant="outline" :loading="saving" @click="saveSnapshot(false)">保存截图</t-button>
            <t-button theme="primary" :loading="saving" @click="saveSnapshot(true)">发送到画布</t-button>
            <t-button shape="square" variant="text" :disabled="closing" @click="closeEditor">
              <template #icon><i-close /></template>
            </t-button>
          </div>
        </header>

        <aside class="leftPane" :class="{ collapsed: leftCollapsed }">
          <button class="collapseButton" type="button" @click="leftCollapsed = !leftCollapsed">{{ leftCollapsed ? ">" : "<" }}</button>
          <template v-if="!leftCollapsed">
            <div class="paneSection">
              <div class="sectionHeader"><strong>场景引用</strong><span>{{ filteredReferences.length }}</span></div>
              <t-input v-model="keyword" size="small" placeholder="搜索素材">
                <template #suffix-icon><i-search /></template>
              </t-input>
              <div class="referenceGrid">
                <button
                  v-for="ref in filteredReferences"
                  :key="referenceKey(ref)"
                  type="button"
                  class="referenceCard"
                  :class="{ active: selectedReference === ref }"
                  @click="selectReference(ref)">
                  <img v-if="getPreviewUrl(ref)" :src="getPreviewUrl(ref)" alt="" />
                  <span>{{ ref.label || "未命名引用" }}</span>
                </button>
                <div v-if="!filteredReferences.length" class="emptyList">请先把图片节点连接到导演台</div>
              </div>
              <div class="referenceActions">
                <t-button size="small" variant="outline" :disabled="!selectedReference" @click="setSceneReference">设为场景</t-button>
                <t-button size="small" variant="outline" :disabled="!selectedReference" @click="addItem('actor')">添加角色</t-button>
                <t-button size="small" variant="outline" :disabled="!selectedReference" @click="addItem('prop')">添加道具</t-button>
              </div>
            </div>

            <div class="paneSection hierarchySection">
              <div class="sectionHeader"><strong>层级</strong></div>
              <button type="button" class="treeRow" :class="{ active: selectedKind === 'scene' }" @click="selectScene">
                <i-picture /><span>3D场景</span>
              </button>
              <div class="treeGroup">机位</div>
              <button
                v-for="camera in data.cameras"
                :key="camera.id"
                type="button"
                class="treeRow"
                :class="{ active: selectedKind === 'camera' && selectedCameraId === camera.id }"
                @click="selectCamera(camera.id)">
                <i-video /><span>{{ camera.name }}</span>
              </button>
              <div class="treeGroup">角色 / 道具</div>
              <button
                v-for="item in data.items"
                :key="item.itemId"
                type="button"
                class="treeRow"
                :class="{ active: selectedKind === 'item' && selectedItemId === item.itemId }"
                @click="selectItem(item.itemId)">
                <span class="objectType">{{ item.role === "actor" ? "人" : "物" }}</span>
                <span>{{ item.label || (item.role === "actor" ? "角色" : "道具") }}</span>
                <span v-if="!item.visible" class="muted">隐藏</span>
              </button>
            </div>
          </template>
        </aside>

        <main class="viewportPane">
          <DirectorStageViewport
            v-if="visible"
            ref="viewportRef"
            :data="data"
            :selected-item-id="selectedItemId"
            :transform-mode="transformMode"
            @select="selectItem"
            @change="scheduleSave"
            @commit="flushSave" />
          <div class="viewLabel">{{ data.mode === "camera" ? activeCamera?.name || "机位视角" : "导演视角" }}</div>
          <div class="bottomToolbar">
            <t-tooltip content="选择"><button type="button" :class="{ active: toolMode === 'select' }" @click="toolMode = 'select'">↖</button></t-tooltip>
            <t-tooltip content="移动 (V)"><button type="button" :class="{ active: transformMode === 'translate' }" @click="setTransformMode('translate')">V</button></t-tooltip>
            <t-tooltip content="旋转 (R)"><button type="button" :class="{ active: transformMode === 'rotate' }" @click="setTransformMode('rotate')">R</button></t-tooltip>
            <t-tooltip content="缩放 (S)"><button type="button" :class="{ active: transformMode === 'scale' }" @click="setTransformMode('scale')">S</button></t-tooltip>
            <span class="toolbarDivider"></span>
            <t-tooltip content="添加角色"><button type="button" @click="addItem('actor')">人</button></t-tooltip>
            <t-tooltip content="添加道具"><button type="button" @click="addItem('prop')">物</button></t-tooltip>
            <t-tooltip content="从导演视角创建机位"><button type="button" @click="addCamera"><i-video /></button></t-tooltip>
            <t-tooltip content="当前机位截图"><button type="button" :disabled="saving" @click="saveSnapshot(false)"><i-picture /></button></t-tooltip>
            <t-tooltip content="AI视图导入"><button type="button" @click="openHistory"><i-history /></button></t-tooltip>
            <t-tooltip content="适应视图"><button type="button" @click="viewportRef?.fitView()"><i-full-screen-one /></button></t-tooltip>
          </div>
        </main>

        <aside class="rightPane" :class="{ collapsed: rightCollapsed }">
          <button class="collapseButton right" type="button" @click="rightCollapsed = !rightCollapsed">{{ rightCollapsed ? "<" : ">" }}</button>
          <template v-if="!rightCollapsed">
            <div v-if="selectedKind === 'scene'" class="inspector">
              <h3>3D场景</h3>
              <label>背景模式</label>
              <t-radio-group v-model="data.scene.backgroundMode" size="small" variant="default-filled" @change="scheduleSave">
                <t-radio-button value="flat">平面背景</t-radio-button>
                <t-radio-button value="panorama">全景背景</t-radio-button>
              </t-radio-group>
              <template v-if="data.scene.backgroundMode === 'flat'">
                <label>背景适配</label>
                <t-radio-group v-model="data.scene.backgroundFit" size="small" variant="default-filled" @change="scheduleSave">
                  <t-radio-button value="cover">填充画面</t-radio-button>
                  <t-radio-button value="contain">完整显示</t-radio-button>
                </t-radio-group>
                <label>背景缩放</label>
                <t-slider v-model="data.scene.backgroundScale" :min="0.5" :max="3" :step="0.05" @change-end="flushSave" />
                <label>水平偏移</label>
                <t-slider v-model="data.scene.backgroundOffsetX" :min="-100" :max="100" @change-end="flushSave" />
                <label>垂直偏移</label>
                <t-slider v-model="data.scene.backgroundOffsetY" :min="-100" :max="100" @change-end="flushSave" />
              </template>
              <template v-else>
                <label>全景旋转</label>
                <t-slider v-model="data.scene.panoramaRotation" :min="-180" :max="180" @change-end="flushSave" />
                <label>球体半径</label>
                <t-slider v-model="data.scene.panoramaRadius" :min="10" :max="80" @change-end="flushSave" />
              </template>
              <label>天空颜色</label>
              <t-color-picker v-model="data.scene.skyColor" format="HEX" @change="scheduleSave" />
              <div v-if="data.scene.background" class="inspectorImage">
                <img :src="getPreviewUrl(data.scene.background)" alt="" />
                <span>{{ data.scene.background.label || "当前场景" }}</span>
              </div>
            </div>

            <div v-else-if="selectedKind === 'item' && selectedItem" class="inspector">
              <h3>{{ selectedItem.role === "actor" ? "角色" : "道具" }}</h3>
              <label>名称</label>
              <t-input v-model="selectedItem.label" @change="flushSave" />
              <t-checkbox v-model="selectedItem.visible" @change="flushSave">在当前构图中显示</t-checkbox>
              <template v-if="selectedItem.role === 'actor'">
                <label>体型</label>
                <t-select v-model="selectedItem.mannequinType" @change="flushSave">
                  <t-option value="neutral" label="中性" />
                  <t-option value="female" label="女性" />
                  <t-option value="male" label="男性" />
                  <t-option value="youth" label="少年" />
                </t-select>
              </template>
              <template v-else>
                <label>占位模型</label>
                <t-select v-model="selectedItem.primitiveType" @change="flushSave">
                  <t-option value="box" label="立方体" />
                  <t-option value="sphere" label="球体" />
                  <t-option value="cylinder" label="圆柱体" />
                  <t-option value="cone" label="圆锥体" />
                  <t-option value="capsule" label="胶囊体" />
                </t-select>
              </template>
              <label>位置</label>
              <Vec3Input v-model="selectedItem.position" @change="flushSave" />
              <label>旋转</label>
              <Vec3Input v-model="selectedItem.rotation" @change="flushSave" />
              <label>缩放</label>
              <Vec3Input v-model="selectedItem.scale3d" :step="0.1" @change="flushSave" />
              <label>颜色</label>
              <t-color-picker v-model="selectedItem.color" format="HEX" @change="scheduleSave" />

              <template v-if="selectedItem.role === 'actor'">
                <label>姿势预设</label>
                <div class="poseGrid">
                  <button
                    v-for="pose in DIRECTOR_POSES"
                    :key="pose.id"
                    type="button"
                    :class="{ active: selectedItem.poseId === pose.id }"
                    @click="applyPose(pose.id)">{{ pose.label }}</button>
                </div>
                <t-collapse class="jointCollapse">
                  <t-collapse-panel value="joints" header="关节微调">
                    <div v-for="joint in DIRECTOR_JOINTS" :key="joint.key" class="jointRow">
                      <span>{{ joint.label }}</span>
                      <Vec3Input :model-value="jointValue(joint.key)" :step="5" @update:model-value="setJointValue(joint.key, $event)" @change="flushSave" />
                    </div>
                  </t-collapse-panel>
                </t-collapse>
              </template>
              <t-button theme="danger" variant="outline" block @click="removeSelectedItem">删除对象</t-button>
            </div>

            <div v-else-if="selectedKind === 'camera' && selectedCamera" class="inspector cameraInspector">
              <h3>摄像机</h3>
              <label>名称</label>
              <t-input v-model="selectedCamera.name" @change="flushSave" />
              <label>位置</label>
              <Vec3Input v-model="selectedCamera.position" @change="flushSave" />
              <label>注视目标</label>
              <Vec3Input v-model="selectedCamera.target" @change="flushSave" />
              <label>视野角度 (FOV)</label>
              <t-slider v-model="selectedCamera.fov" :min="20" :max="90" @change-end="flushSave" />
              <label>提示词片段</label>
              <t-textarea v-model="selectedCamera.promptFragment" :autosize="{ minRows: 3, maxRows: 6 }" @change="flushSave" />
              <div class="inspectorActions">
                <t-button size="small" variant="outline" @click="useSelectedCamera">切到此机位</t-button>
                <t-button size="small" variant="outline" @click="saveSnapshot(false)">截图</t-button>
              </div>
              <div class="sectionHeader galleryHeader"><strong>机位图库</strong><span>{{ selectedCamera.views.length }}</span></div>
              <div class="cameraGallery">
                <button
                  v-for="view in selectedCamera.views"
                  :key="view.viewId"
                  type="button"
                  :class="{ active: selectedCamera.activeViewId === view.viewId }"
                  @click="setActiveView(view)">
                  <img :src="getPreviewUrl(view)" alt="" />
                  <span>{{ view.kind === "ai" ? "AI视图" : "机位截图" }}</span>
                  <span class="galleryActions">
                    <i-preview-open @click.stop="previewAsset(view)" />
                    <i-delete @click.stop="removeView(view.viewId)" />
                  </span>
                </button>
                <div v-if="!selectedCamera.views.length" class="emptyList">暂无截图或 AI 视图</div>
              </div>
              <t-button v-if="data.cameras.length > 1" theme="danger" variant="outline" block @click="removeSelectedCamera">删除机位</t-button>
            </div>
          </template>
        </aside>
      </div>
    </t-dialog>

    <GenerationHistoryDialog
      v-model:visible="historyVisible"
      :history-loading="historyLoading"
      :history-items="historyItems"
      :selected-history-id="selectedHistoryId"
      @select-history="importHistoryView" />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position, useVueFlow } from "@vue-flow/core";
import { DialogPlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import { openImageLightbox } from "@/composables/useImageLightbox";
import { getMediaOriginalUrl, getMediaPathForGeneration, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type {
  DirectorJointName,
  DirectorStageCamera,
  DirectorStageData,
  DirectorStagePlacedItem,
  DirectorStageView,
  DirectorVec3,
  ReferenceImage,
} from "../../utils/editImageType";
import { getDirectorStageGenerationReferences } from "../../utils/editImageType";
import DirectorStageViewport from "./directorStage/DirectorStageViewport.vue";
import { DIRECTOR_JOINTS, DIRECTOR_POSES, getPoseJoints } from "./directorStage/posePresets";
import GenerationHistoryDialog from "./generatedNode/GenerationHistoryDialog.vue";
import Vec3Input from "./directorStage/Vec3Input.vue";

interface ImageHistoryItem {
  id: number;
  url: string;
  previewUrl: string;
  media?: any;
  prompt?: string;
  createTime?: string;
}

interface ViewportExpose {
  capture: () => Promise<string>;
  fitView: () => void;
  getDirectorCameraState: () => { position: DirectorVec3; target: DirectorVec3; fov: number };
}

const props = defineProps<{
  id: string;
  data: DirectorStageData;
  projectId: number;
  scriptId?: number;
  flowId: number | null;
  targetType?: "deriveAsset" | "storyboard";
  targetId?: number | null;
  saveFlow: () => Promise<number | null>;
}>();

const emit = defineEmits<{
  change: [asset?: ReferenceImage];
}>();

const { removeNodes } = useVueFlow("editImage");
const visible = ref(false);
const saving = ref(false);
const closing = ref(false);
const saveState = ref<"saved" | "dirty" | "saving">("saved");
const keyword = ref("");
const selectedReference = ref<ReferenceImage | null>(null);
const selectedItemId = ref("");
const selectedCameraId = ref(props.data.activeCameraId || props.data.cameras[0]?.id || "");
const selectedKind = ref<"scene" | "item" | "camera">("scene");
const transformMode = ref<"translate" | "rotate" | "scale">("translate");
const toolMode = ref<"select" | "transform">("select");
const viewportRef = ref<ViewportExpose | null>(null);
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
const historyVisible = ref(false);
const historyLoading = ref(false);
const historyItems = ref<ImageHistoryItem[]>([]);
const selectedHistoryId = ref<number | null>(null);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const activeCamera = computed(() => props.data.cameras.find((camera) => camera.id === props.data.activeCameraId) || props.data.cameras[0]);
const selectedCamera = computed(() => props.data.cameras.find((camera) => camera.id === selectedCameraId.value));
const selectedItem = computed(() => props.data.items.find((item) => item.itemId === selectedItemId.value));
const actorCount = computed(() => props.data.items.filter((item) => item.role === "actor").length);
const propCount = computed(() => props.data.items.filter((item) => item.role === "prop").length);
const activeView = computed(() => activeCamera.value?.views.find((view) => view.viewId === activeCamera.value?.activeViewId) || activeCamera.value?.views[0]);
const previewUrl = computed(() => getPreviewUrl(activeView.value) || getPreviewUrl(props.data.scene.background));
const previewBackgroundStyle = computed(() => (previewUrl.value ? { backgroundImage: `url("${previewUrl.value}")` } : {}));
const saveStateLabel = computed(() => ({ saved: "已保存", dirty: "有未保存更改", saving: "保存中" })[saveState.value]);
const filteredReferences = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) return props.data.references;
  return props.data.references.filter((item) => `${item.label || ""} ${item.group || ""}`.toLowerCase().includes(query));
});

onMounted(() => window.addEventListener("keydown", handleKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  if (saveTimer) clearTimeout(saveTimer);
});

function openEditor() {
  ensureCamera();
  selectedCameraId.value = props.data.activeCameraId || props.data.cameras[0].id;
  visible.value = true;
}

async function closeEditor() {
  if (closing.value) return;
  closing.value = true;
  try {
    await flushSave();
    visible.value = false;
  } catch (error) {
    window.$message.error((error as any)?.message || "导演台保存失败");
  } finally {
    closing.value = false;
  }
}

function confirmDeleteNode() {
  const dialog = DialogPlugin.confirm({
    header: "删除3D导演台",
    body: "将删除此节点及关联连线，已经生成的导演资产不会被删除。",
    confirmBtn: "删除",
    theme: "danger",
    onConfirm: async () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      visible.value = false;
      removeNodes([props.id]);
      try {
        await nextTick();
        await props.saveFlow();
        dialog.destroy();
      } catch (error) {
        window.$message.error((error as any)?.message || "导演台节点删除保存失败");
      }
    },
    onCancel: () => dialog.destroy(),
  });
}

function ensureCamera() {
  if (props.data.cameras.length) return;
  props.data.cameras.push(createCamera(1));
  props.data.activeCameraId = props.data.cameras[0].id;
}

function selectReference(ref: ReferenceImage) {
  selectedReference.value = ref;
}

function selectScene() {
  selectedKind.value = "scene";
  selectedItemId.value = "";
}

function selectItem(itemId: string) {
  selectedItemId.value = itemId;
  if (itemId) selectedKind.value = "item";
}

function selectCamera(cameraId: string) {
  selectedKind.value = "camera";
  selectedCameraId.value = cameraId;
  props.data.activeCameraId = cameraId;
  scheduleSave();
}

function setSceneReference() {
  if (!selectedReference.value) return;
  props.data.scene.background = cloneReference(selectedReference.value);
  selectedKind.value = "scene";
  flushSave();
}

function addItem(role: "actor" | "prop") {
  const ref = selectedReference.value;
  const index = props.data.items.filter((item) => item.role === role).length + 1;
  const item: DirectorStagePlacedItem = {
    ...(ref ? cloneReference(ref) : { image: "", previewImage: "", type: "image" as const }),
    itemId: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    modelKind: role === "actor" ? "mannequin" : "primitive",
    mannequinType: "neutral",
    primitiveType: "box",
    label: ref?.label || `${role === "actor" ? "角色" : "道具"}${index}`,
    position: { x: role === "actor" ? (index - 1) * 1.4 - 0.7 : (index - 1) * 1.2, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale3d: { x: 1, y: 1, z: 1 },
    color: role === "actor" ? (index % 2 ? "#5585f7" : "#f75353") : "#10b981",
    poseId: "stand",
    joints: {},
    visible: true,
  };
  props.data.items.push(item);
  selectItem(item.itemId);
  flushSave();
}

function removeSelectedItem() {
  if (!selectedItemId.value) return;
  props.data.items = props.data.items.filter((item) => item.itemId !== selectedItemId.value);
  selectedItemId.value = "";
  selectedKind.value = "scene";
  flushSave();
}

function addCamera() {
  const state = viewportRef.value?.getDirectorCameraState();
  const camera = createCamera(props.data.cameras.length + 1, state);
  props.data.cameras.push(camera);
  props.data.activeCameraId = camera.id;
  selectCamera(camera.id);
  props.data.mode = "camera";
  flushSave();
}

function createCamera(index: number, state?: { position: DirectorVec3; target: DirectorVec3; fov: number }): DirectorStageCamera {
  return {
    id: `camera-${Date.now()}-${index}`,
    name: `机位${index}`,
    fov: state?.fov ?? 45,
    position: state?.position ?? { x: 6, y: 3.2, z: 8 },
    target: state?.target ?? { x: 0, y: 1.4, z: 0 },
    promptFragment: "",
    views: [],
  };
}

function removeSelectedCamera() {
  const camera = selectedCamera.value;
  if (!camera || props.data.cameras.length <= 1) return;
  props.data.cameras = props.data.cameras.filter((item) => item.id !== camera.id);
  const next = props.data.cameras[0];
  props.data.activeCameraId = next.id;
  selectedCameraId.value = next.id;
  flushSave();
}

function useSelectedCamera() {
  if (!selectedCamera.value) return;
  props.data.activeCameraId = selectedCamera.value.id;
  props.data.mode = "camera";
  scheduleSave();
}

function setTransformMode(mode: "translate" | "rotate" | "scale") {
  toolMode.value = "transform";
  transformMode.value = mode;
}

function applyPose(poseId: string) {
  if (!selectedItem.value) return;
  selectedItem.value.poseId = poseId;
  selectedItem.value.joints = {};
  flushSave();
}

function jointValue(joint: DirectorJointName): DirectorVec3 {
  return selectedItem.value?.joints?.[joint] || getPoseJoints(selectedItem.value?.poseId || "stand")[joint] || { x: 0, y: 0, z: 0 };
}

function setJointValue(joint: DirectorJointName, value: DirectorVec3) {
  if (!selectedItem.value) return;
  selectedItem.value.joints ||= {};
  selectedItem.value.joints[joint] = value;
  scheduleSave();
}

function setActiveView(view: DirectorStageView) {
  if (!selectedCamera.value) return;
  selectedCamera.value.activeViewId = view.viewId;
  flushSave();
}

function removeView(viewId: string) {
  if (!selectedCamera.value) return;
  selectedCamera.value.views = selectedCamera.value.views.filter((view) => view.viewId !== viewId);
  if (selectedCamera.value.activeViewId === viewId) selectedCamera.value.activeViewId = selectedCamera.value.views[0]?.viewId;
  flushSave();
}

async function saveSnapshot(sendToCanvas: boolean) {
  if (saving.value || !viewportRef.value) return;
  saving.value = true;
  try {
    const base64Data = await viewportRef.value.capture();
    const flowId = await props.saveFlow();
    const camera = activeCamera.value;
    const sourceReferences = getDirectorStageGenerationReferences(props.data);
    const { data } = await axios.post("/production/editImage/createDirectorAsset", {
      base64Data,
      projectId: props.projectId,
      scriptId: props.scriptId,
      flowId,
      nodeId: props.id,
      targetType: props.targetType,
      targetId: props.targetId,
      assetType: "cameraShot",
      name: `${camera?.name || "机位"}-${new Date().toLocaleTimeString()}`,
      promptFragment: camera?.promptFragment || props.data.promptFragment || buildPromptFragment(),
      sourceRefs: sourceReferences
        .map((ref, index) => ({
          source: ref.source,
          sourceId: ref.sourceId,
          mediaPath: getMediaPathForGeneration(normalizeMediaRef(ref.media ?? ref, "image")),
          order: index + 1,
          label: ref.label,
        }))
        .filter((item) => item.mediaPath || item.sourceId),
      camera: camera
        ? { id: camera.id, name: camera.name, fov: camera.fov, position: camera.position, target: camera.target }
        : undefined,
      stageDraft: props.data,
    });
    const media = normalizeMediaRef(data?.media ?? data?.asset?.media ?? data?.asset ?? data, "image");
    if (!media) throw new Error("后端未返回导演台截图媒体");
    const view: DirectorStageView = {
      viewId: `rendered-${data?.id ?? data?.assetId ?? media.id ?? Date.now()}`,
      kind: "rendered",
      image: getMediaOriginalUrl(media),
      previewImage: getMediaPreviewUrl(media),
      media: { ...media, source: "directorAsset" },
      label: data?.name || data?.asset?.name || camera?.name || "机位截图",
      source: "directorAsset",
      sourceId: data?.id ?? data?.assetId ?? data?.asset?.id ?? media.id,
      group: "directorStage",
      type: "image",
      createTime: new Date().toISOString(),
    };
    if (camera) {
      camera.views.unshift(view);
      camera.activeViewId = view.viewId;
    }
    emit("change", sendToCanvas ? view : undefined);
    await props.saveFlow();
    saveState.value = "saved";
    window.$message.success(sendToCanvas ? "已发送当前机位到画布" : "当前机位截图已保存");
  } catch (error) {
    window.$message.error((error as any)?.message || "导演台截图保存失败");
  } finally {
    saving.value = false;
  }
}

async function openHistory() {
  historyVisible.value = true;
  historyLoading.value = true;
  selectedHistoryId.value = null;
  try {
    const { data } = await axios.post("/production/editImage/getImageHistory", {
      projectId: props.projectId,
      scriptId: props.scriptId,
      targetType: props.targetType,
      targetId: props.targetId,
    });
    historyItems.value = (data ?? [])
      .map((item: any) => {
        const media = normalizeMediaRef(item.media ?? item, "image");
        return {
          id: item.id,
          url: media ? getMediaOriginalUrl(media) : item.url ?? item.src,
          previewUrl: media ? getMediaPreviewUrl(media) : item.previewUrl ?? item.thumbnail ?? item.url ?? item.src,
          media,
          prompt: item.prompt,
          createTime: item.createTime,
        };
      })
      .filter((item: ImageHistoryItem) => item.url);
  } catch (error) {
    window.$message.error((error as any)?.message || "AI视图历史加载失败");
  } finally {
    historyLoading.value = false;
  }
}

function importHistoryView(item: ImageHistoryItem) {
  ensureCamera();
  const camera = selectedCamera.value || activeCamera.value || props.data.cameras[0];
  const view: DirectorStageView = {
    viewId: `ai-${item.id}-${Date.now()}`,
    kind: "ai",
    image: item.url,
    previewImage: item.previewUrl,
    media: item.media,
    label: item.prompt || `AI视图 ${item.id}`,
    source: "generated",
    sourceId: item.id,
    group: "directorStage",
    type: "image",
    createTime: item.createTime,
  };
  camera.views.unshift(view);
  camera.activeViewId = view.viewId;
  props.data.activeCameraId = camera.id;
  selectedCameraId.value = camera.id;
  selectedHistoryId.value = item.id;
  historyVisible.value = false;
  flushSave();
  window.$message.success("AI视图已加入当前机位图库");
}

function previewAsset(asset: ReferenceImage) {
  const src = getPreviewUrl(asset);
  if (!src) return;
  openImageLightbox({ images: [{ src, originalSrc: asset.image || src, title: asset.label }] });
}

function buildPromptFragment() {
  return props.data.items
    .filter((item) => item.visible)
    .map((item) => `${item.label || (item.role === "actor" ? "角色" : "道具")}${item.role === "actor" ? `，${DIRECTOR_POSES.find((pose) => pose.id === item.poseId)?.label || "站立"}` : ""}`)
    .join("；");
}

function scheduleSave() {
  saveState.value = "dirty";
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), 500);
}

async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveState.value = "saving";
  emit("change");
  try {
    await props.saveFlow();
    saveState.value = "saved";
  } catch (error) {
    saveState.value = "dirty";
    throw error;
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!visible.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    void closeEditor();
  } else if (event.key.toLowerCase() === "v") {
    setTransformMode("translate");
  } else if (event.key.toLowerCase() === "r") {
    setTransformMode("rotate");
  } else if (event.key.toLowerCase() === "s") {
    setTransformMode("scale");
  }
}

function cloneReference(ref: ReferenceImage): ReferenceImage {
  return { ...ref, media: ref.media ? { ...ref.media } : undefined };
}

function getPreviewUrl(ref?: ReferenceImage | null) {
  if (!ref) return "";
  const media = normalizeMediaRef(ref.media ?? ref, "image");
  return (media ? getMediaPreviewUrl(media) : "") || ref.previewImage || ref.image || "";
}

function referenceKey(ref: ReferenceImage) {
  return `${ref.source || ""}-${ref.sourceId ?? ""}-${ref.image}`;
}
</script>

<style scoped lang="scss">
.directorStageNode {
  position: relative;
  width: 360px;
}

.nodeCard {
  overflow: hidden;
  background: #fff;
  border: 1px solid #d7dce3;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 10%);
}

.nodeHeader,
.nodeActions,
.nodeSummary,
.sectionHeader,
.referenceActions,
.topBar,
.topActions,
.brandBlock,
.inspectorActions {
  display: flex;
  align-items: center;
}

.nodeHeader {
  justify-content: space-between;
  min-height: 58px;
  padding: 10px 12px;
}

.nodeHeading {
  display: grid;
  gap: 3px;
}

.nodeHeading strong {
  font-size: 15px;
}

.nodeHeading span,
.nodeSummary {
  color: #7b8494;
  font-size: 12px;
}

.nodeActions {
  gap: 6px;
}

.nodePreview {
  position: relative;
  display: grid;
  width: 100%;
  height: 194px;
  padding: 0;
  overflow: hidden;
  background: #111827 center / cover no-repeat;
  border: 0;
  cursor: pointer;
}

.emptyPreview {
  display: grid;
  place-content: center;
  gap: 8px;
  color: #aeb8c8;
}

.previewBadge {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 5px 8px;
  color: #fff;
  font-size: 12px;
  background: rgb(0 0 0 / 58%);
  border-radius: 5px;
}

.nodeSummary {
  gap: 14px;
  padding: 9px 12px;
}

.directorShell {
  --panel: #1f1f1f;
  --panel-soft: #282828;
  --line: #343434;
  position: fixed;
  z-index: 1;
  inset: 0;
  display: grid;
  grid-template: 64px minmax(0, 1fr) / auto minmax(0, 1fr) auto;
  width: 100vw;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;
  max-height: 100vh;
  max-height: 100dvh;
  overflow: hidden;
  color: #f4f4f5;
  background: #111;
  box-sizing: border-box;
}

.topBar {
  z-index: 8;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  min-width: 0;
  justify-content: space-between;
  padding: 0 18px 0 22px;
  background: #1b1b1b;
  border-bottom: 1px solid var(--line);
  box-sizing: border-box;
}

.brandBlock {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 250px;
}

.brandBlock strong {
  font-size: 16px;
}

.saveState {
  color: #8b95a5;
  font-size: 12px;
}

.saveState.dirty {
  color: #f4c95d;
}

.saveState.saving {
  color: #58b7ff;
}

.topActions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 320px;
}

.leftPane,
.rightPane {
  position: relative;
  z-index: 5;
  width: 260px;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--panel);
  box-sizing: border-box;
}

.leftPane {
  border-right: 1px solid var(--line);
}

.rightPane {
  width: 292px;
  border-left: 1px solid var(--line);
}

.leftPane.collapsed,
.rightPane.collapsed {
  width: 28px;
  overflow: visible;
}

.collapseButton {
  position: absolute;
  z-index: 7;
  top: 50%;
  right: -14px;
  width: 28px;
  height: 44px;
  color: #fff;
  background: #2563eb;
  border: 0;
  border-radius: 0 7px 7px 0;
  cursor: pointer;
}

.collapseButton.right {
  right: auto;
  left: -14px;
  border-radius: 7px 0 0 7px;
}

.paneSection,
.inspector {
  padding: 16px 12px;
}

.paneSection + .paneSection {
  border-top: 1px solid var(--line);
}

.sectionHeader {
  justify-content: space-between;
  margin-bottom: 10px;
}

.sectionHeader span,
.muted {
  color: #8c96a5;
  font-size: 11px;
}

.referenceGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-height: 212px;
  margin-top: 10px;
  overflow: auto;
}

.referenceCard,
.treeRow,
.poseGrid button,
.bottomToolbar button,
.cameraGallery button {
  color: inherit;
  font: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.referenceCard {
  min-width: 0;
  padding: 4px;
  text-align: left;
  background: #292929;
  border: 1px solid transparent;
  border-radius: 5px;
}

.referenceCard.active {
  border-color: #3b82f6;
}

.referenceCard img {
  display: block;
  width: 100%;
  height: 56px;
  object-fit: cover;
  border-radius: 3px;
}

.referenceCard span {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.referenceActions {
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.hierarchySection {
  min-height: 260px;
}

.treeGroup {
  margin: 14px 8px 5px;
  color: #7f8997;
  font-size: 11px;
  text-transform: uppercase;
}

.treeRow {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 7px 9px;
  text-align: left;
  border-radius: 5px;
}

.treeRow:hover,
.treeRow.active {
  background: #333;
}

.treeRow .muted {
  margin-left: auto;
}

.objectType {
  display: grid;
  width: 19px;
  height: 19px;
  place-items: center;
  font-size: 10px;
  background: #404040;
  border-radius: 50%;
}

.viewportPane {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #111827;
}

.viewLabel {
  position: absolute;
  top: 14px;
  left: 50%;
  z-index: 4;
  padding: 6px 10px;
  color: #fff;
  font-size: 12px;
  background: rgb(0 0 0 / 55%);
  border-radius: 5px;
  transform: translateX(-50%);
  pointer-events: none;
}

.bottomToolbar {
  position: absolute;
  z-index: 5;
  bottom: 22px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px;
  background: rgb(24 24 24 / 92%);
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgb(0 0 0 / 35%);
  transform: translateX(-50%);
}

.bottomToolbar button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 5px;
}

.bottomToolbar button:hover,
.bottomToolbar button.active {
  color: #fff;
  background: #2563eb;
}

.bottomToolbar button:disabled {
  opacity: 0.45;
  cursor: wait;
}

.toolbarDivider {
  width: 1px;
  height: 24px;
  margin: 0 2px;
  background: #4a4a4a;
}

.inspector {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px;
}

.inspector h3 {
  margin: 0 0 6px;
  font-size: 16px;
}

.inspector label {
  margin-top: 5px;
  color: #aeb6c3;
  font-size: 12px;
}

.inspectorImage {
  display: grid;
  gap: 6px;
  margin-top: 10px;
}

.inspectorImage img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: 5px;
}

.poseGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}

.poseGrid button {
  min-height: 30px;
  padding: 4px;
  font-size: 11px;
  background: #303030;
  border: 1px solid transparent;
  border-radius: 5px;
}

.poseGrid button:hover,
.poseGrid button.active {
  border-color: #3b82f6;
}

.jointCollapse {
  margin: 4px 0;
}

.jointRow {
  display: grid;
  gap: 5px;
  margin-bottom: 9px;
}

.jointRow > span {
  color: #9ba4b2;
  font-size: 11px;
}

.inspectorActions {
  gap: 7px;
}

.galleryHeader {
  margin-top: 8px;
}

.cameraGallery {
  display: grid;
  gap: 8px;
}

.cameraGallery button {
  position: relative;
  display: grid;
  grid-template-columns: 68px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 5px;
  text-align: left;
  background: #292929;
  border: 1px solid transparent;
  border-radius: 5px;
}

.cameraGallery button.active {
  border-color: #3b82f6;
}

.cameraGallery img {
  width: 68px;
  height: 45px;
  object-fit: cover;
  border-radius: 3px;
}

.galleryActions {
  position: absolute;
  right: 6px;
  bottom: 5px;
  display: flex;
  gap: 8px;
}

.emptyList {
  grid-column: 1 / -1;
  padding: 18px 8px;
  color: #7d8794;
  font-size: 12px;
  text-align: center;
}

@media (max-width: 1100px) {
  .directorShell {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .leftPane,
  .rightPane {
    width: 220px;
  }

  .rightPane {
    width: 248px;
  }

  .topActions {
    min-width: auto;
  }
}

@media (max-width: 820px) {
  .leftPane,
  .rightPane {
    width: 28px;
  }

  .leftPane > :not(.collapseButton),
  .rightPane > :not(.collapseButton) {
    display: none;
  }

  .brandBlock {
    min-width: auto;
  }

  .topBar {
    padding-inline: 10px;
  }

  .topActions > button:nth-of-type(2),
  .topActions > button:nth-of-type(3) {
    display: none;
  }
}
</style>

<style lang="scss">
.directorStageDialog.t-dialog__ctx .t-dialog,
.directorStageDialog .t-dialog {
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  padding: 0 !important;
  overflow: hidden;
  background: #111 !important;
}

.directorStageDialog .t-dialog__body {
  height: 100vh;
  height: 100dvh;
  padding: 0 !important;
  overflow: hidden;
}

.directorStageDialog.t-dialog__ctx,
.directorStageDialog .t-dialog__wrap,
.directorStageDialog .t-dialog__position {
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  overflow: hidden !important;
}

.directorStageDialog .t-radio-button.t-is-checked {
  color: #111827 !important;
}

.directorStageDialog .t-radio-group,
.directorStageDialog .t-input,
.directorStageDialog .t-textarea,
.directorStageDialog .t-select,
.directorStageDialog .t-input-number {
  --td-bg-color-specialcomponent: #2f2f2f;
  --td-bg-color-container: #2f2f2f;
  --td-text-color-primary: #f5f5f5;
  --td-border-level-2-color: #444;
}
</style>
