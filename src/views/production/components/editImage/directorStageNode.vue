<template>
  <div class="directorStageNode">
    <Handle type="target" :position="Position.Left" />
    <div class="nodeCard">
      <div class="nodeHeader">
        <div>
          <div class="nodeTitle">3D导演台</div>
          <div class="nodeSub">{{ data.assets.length }} 个资产 · {{ data.items.length }} 个站位 · {{ data.cameras.length }} 个机位</div>
        </div>
        <t-button size="small" theme="primary" @click="openEditor">打开</t-button>
      </div>
      <div class="nodePreview" :style="previewBackgroundStyle">
        <span v-if="!previewUrl" class="empty">连接场景/角色素材后编辑</span>
        <div v-for="item in data.items.slice(0, 4)" :key="item.itemId" class="miniItem" :style="placedItemStyle(item, true)">
          <img v-if="getPreviewUrl(item)" :src="getPreviewUrl(item)" />
          <span v-else :style="{ backgroundColor: item.color || '#5585f7' }"></span>
        </div>
      </div>
      <div class="assetStrip">
        <div v-for="asset in data.assets.slice(0, 4)" :key="`${asset.sourceId}-${asset.image}`" class="assetThumb">
          <img :src="asset.previewImage || asset.image" />
        </div>
      </div>
    </div>
    <Handle type="source" :position="Position.Right" />

    <t-dialog v-model:visible="visible" attach="body" :footer="false" :header="false" mode="full-screen" class="directorDialog">
      <div class="directorShell">
        <header class="topBar">
          <strong>3D导演台</strong>
          <t-radio-group v-model="data.mode" variant="default-filled" size="small">
            <t-radio-button value="director">导演视角</t-radio-button>
            <t-radio-button value="camera">机位视角</t-radio-button>
          </t-radio-group>
          <div class="topActions">
            <t-button variant="outline" @click="saveAsset(false)" :loading="saving">保存为资产</t-button>
            <t-button theme="primary" @click="saveAsset(true)" :loading="saving">发送到画布</t-button>
            <t-button shape="circle" variant="text" @click="visible = false">
              <template #icon><i-close /></template>
            </t-button>
          </div>
        </header>

        <aside class="leftPane">
          <div class="paneTitle">场景</div>
          <t-input v-model="keyword" size="small" placeholder="搜索素材">
            <template #suffixIcon><i-search /></template>
          </t-input>
          <div class="treeList">
            <button v-for="ref in filteredReferences" :key="`${ref.source}-${ref.sourceId}-${ref.image}`" class="treeItem" @click="selectReference(ref)">
              <img v-if="getPreviewUrl(ref)" :src="getPreviewUrl(ref)" />
              <span>{{ ref.label || getSourceLabel(ref) }}</span>
            </button>
          </div>
          <div class="paneTitle">机位</div>
          <button v-for="camera in data.cameras" :key="camera.id" class="treeItem" :class="{ active: data.activeCameraId === camera.id }" @click="data.activeCameraId = camera.id">
            <i-video />
            <span>{{ camera.name }}</span>
          </button>
          <t-button block variant="outline" size="small" @click="addCamera">新增机位</t-button>
          <div class="paneTitle">角色/道具</div>
          <button v-for="item in data.items" :key="item.itemId" class="treeItem" :class="{ active: selectedItemId === item.itemId }" @click="selectedItemId = item.itemId">
            <span>{{ item.role === "actor" ? "人" : "物" }}</span>
            <span>{{ item.label || item.role }}</span>
          </button>
        </aside>

        <main class="stagePane">
          <div ref="stageRef" class="stageCanvas" :class="{ cameraMode: data.mode === 'camera' }" :style="stageBackgroundStyle" @mousedown.self="selectedItemId = ''">
            <div class="blurBg" :style="stageBackgroundStyle"></div>
            <div class="stageFrame">
              <div class="safeFrame"></div>
              <div class="thirdLine v one"></div>
              <div class="thirdLine v two"></div>
              <div class="thirdLine h one"></div>
              <div class="thirdLine h two"></div>
              <button
                v-for="item in data.items"
                :key="item.itemId"
                class="placedItem"
                :class="{ selected: selectedItemId === item.itemId }"
                :style="placedItemStyle(item)"
                @mousedown.stop="startDrag(item, $event)">
                <img v-if="getPreviewUrl(item)" :src="getPreviewUrl(item)" draggable="false" />
                <span v-else class="dummy" :style="{ backgroundColor: item.color || '#5585f7' }"></span>
                <strong>{{ item.label || (item.role === 'actor' ? '角色' : '道具') }}</strong>
              </button>
            </div>
          </div>
          <div class="bottomTools">
            <t-tooltip content="添加角色">
              <t-button shape="circle" @click="addSelectedAs('actor')">人</t-button>
            </t-tooltip>
            <t-tooltip content="添加道具">
              <t-button shape="circle" @click="addSelectedAs('prop')">物</t-button>
            </t-tooltip>
            <t-tooltip content="保存机位资产">
              <t-button shape="circle" @click="saveAsset(false)" :loading="saving"><template #icon><i-pic /></template></t-button>
            </t-tooltip>
            <t-tooltip content="适应视图">
              <t-button shape="circle" @click="resetView"><template #icon><i-full-screen-one /></template></t-button>
            </t-tooltip>
          </div>
        </main>

        <aside class="rightPane">
          <template v-if="selectedItem">
            <div class="paneTitle">角色</div>
            <t-tabs default-value="property" size="medium">
              <t-tab-panel value="property" label="属性">
                <t-form label-align="top">
                  <t-form-item label="名称"><t-input v-model="selectedItem.label" /></t-form-item>
                  <t-form-item label="位置">
                    <div class="triple"><t-input-number v-model="selectedItem.x" /><t-input-number v-model="selectedItem.y" /></div>
                  </t-form-item>
                  <t-form-item label="旋转"><t-slider v-model="selectedItem.rotation" :min="-45" :max="45" /></t-form-item>
                  <t-form-item label="缩放"><t-slider v-model="selectedItem.scale" :min="0.4" :max="2.4" :step="0.05" /></t-form-item>
                  <t-form-item label="颜色"><t-color-picker v-model="selectedItem.color" format="HEX" /></t-form-item>
                </t-form>
              </t-tab-panel>
              <t-tab-panel value="pose" label="姿势">
                <div class="poseGrid">
                  <button v-for="pose in poses" :key="pose" :class="{ active: selectedItem.pose === pose }" @click="selectedItem.pose = pose">{{ pose }}</button>
                </div>
              </t-tab-panel>
            </t-tabs>
            <t-button block variant="outline" theme="danger" @click="removeSelected">删除对象</t-button>
          </template>
          <template v-else>
            <div class="paneTitle">摄像机</div>
            <div v-if="activeCamera" class="cameraPanel">
              <t-form label-align="top">
                <t-form-item label="名称"><t-input v-model="activeCamera.name" /></t-form-item>
                <t-form-item label="视野角度"><t-slider v-model="activeCamera.fov" :min="20" :max="90" /></t-form-item>
                <t-form-item label="画面中心">
                  <div class="triple"><t-input-number v-model="activeCamera.x" /><t-input-number v-model="activeCamera.y" /></div>
                </t-form-item>
                <t-form-item label="镜头缩放"><t-slider v-model="activeCamera.zoom" :min="0.6" :max="2.2" :step="0.05" /></t-form-item>
                <t-form-item label="提示词片段"><t-textarea v-model="activeCamera.promptFragment" :autosize="{ minRows: 4, maxRows: 8 }" /></t-form-item>
              </t-form>
            </div>
            <div class="paneTitle">导演台资产</div>
            <div class="savedAssets">
              <button v-for="asset in data.assets" :key="`${asset.sourceId}-${asset.image}`" @click="previewAsset(asset)">
                <img :src="asset.previewImage || asset.image" />
                <span>{{ asset.label }}</span>
              </button>
            </div>
          </template>
        </aside>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import axios from "@/utils/axios";
import { openImageLightbox } from "@/composables/useImageLightbox";
import { getMediaOriginalUrl, getMediaPathForGeneration, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type { DirectorStageData, DirectorStagePlacedItem, ReferenceImage } from "../../utils/editImageType";

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

const visible = ref(false);
const saving = ref(false);
const keyword = ref("");
const selectedReference = ref<ReferenceImage | null>(null);
const selectedItemId = ref("");
const stageRef = ref<HTMLElement | null>(null);
let draggingItem: DirectorStagePlacedItem | null = null;

const poses = ["站立", "T型", "行走", "跑步", "坐姿", "蹲下", "看手机", "招手", "推近", "对视"];

const activeCamera = computed(() => props.data.cameras.find((camera) => camera.id === props.data.activeCameraId) || props.data.cameras[0]);
const selectedItem = computed(() => props.data.items.find((item) => item.itemId === selectedItemId.value));
const previewUrl = computed(() => getPreviewUrl(props.data.background) || getPreviewUrl(props.data.references[0]));
const previewBackgroundStyle = computed(() => (previewUrl.value ? { backgroundImage: `url("${previewUrl.value}")` } : {}));
const stageBackgroundStyle = computed(() => (previewUrl.value ? { backgroundImage: `url("${previewUrl.value}")` } : {}));
const filteredReferences = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return props.data.references;
  return props.data.references.filter((item) => `${item.label || ""} ${item.group || ""} ${item.source || ""}`.toLowerCase().includes(q));
});

watch(
  () => props.data.references,
  (refs) => {
    if (!props.data.background && refs.length) props.data.background = refs[0];
  },
  { immediate: true, deep: true },
);

onBeforeUnmount(() => {
  document.removeEventListener("mousemove", handleDrag);
});

function openEditor() {
  if (!props.data.cameras.length) addCamera();
  visible.value = true;
}

function selectReference(ref: ReferenceImage) {
  selectedReference.value = ref;
  if (!props.data.background) props.data.background = ref;
}

function addSelectedAs(role: "actor" | "prop") {
  const ref = selectedReference.value || props.data.references[0];
  const index = props.data.items.length + 1;
  props.data.items.push({
    ...(ref || { image: "", previewImage: "" }),
    itemId: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    label: ref?.label || (role === "actor" ? `角色${index}` : `道具${index}`),
    source: ref?.source || "directorStage",
    x: role === "actor" ? 48 + index * 4 : 36 + index * 3,
    y: role === "actor" ? 72 : 78,
    scale: role === "actor" ? 1 : 0.75,
    rotation: 0,
    color: role === "actor" ? (index % 2 ? "#5585f7" : "#ef5350") : "#10b981",
    pose: "站立",
  });
  emit("change");
}

function addCamera() {
  const index = props.data.cameras.length + 1;
  const id = `camera-${Date.now()}-${index}`;
  props.data.cameras.push({ id, name: `机位${index}`, fov: 45, x: 50, y: 52, zoom: 1, promptFragment: "" });
  props.data.activeCameraId = id;
  emit("change");
}

function startDrag(item: DirectorStagePlacedItem, event: MouseEvent) {
  selectedItemId.value = item.itemId;
  draggingItem = item;
  document.addEventListener("mousemove", handleDrag);
  document.addEventListener("mouseup", stopDrag, { once: true });
  handleDrag(event);
}

function handleDrag(event: MouseEvent) {
  if (!draggingItem || !stageRef.value) return;
  const frame = stageRef.value.querySelector(".stageFrame") as HTMLElement | null;
  const rect = (frame || stageRef.value).getBoundingClientRect();
  draggingItem.x = clamp(((event.clientX - rect.left) / rect.width) * 100, 4, 96);
  draggingItem.y = clamp(((event.clientY - rect.top) / rect.height) * 100, 8, 96);
}

function stopDrag() {
  draggingItem = null;
  document.removeEventListener("mousemove", handleDrag);
  emit("change");
}

function removeSelected() {
  if (!selectedItemId.value) return;
  props.data.items = props.data.items.filter((item) => item.itemId !== selectedItemId.value);
  selectedItemId.value = "";
  emit("change");
}

function resetView() {
  if (!activeCamera.value) return;
  activeCamera.value.x = 50;
  activeCamera.value.y = 52;
  activeCamera.value.zoom = 1;
  activeCamera.value.fov = 45;
}

async function saveAsset(sendToCanvas: boolean) {
  if (saving.value) return;
  saving.value = true;
  try {
    const flowId = await props.saveFlow();
    const base64Data = await composeSnapshot();
    const camera = activeCamera.value;
    const { data } = await axios.post("/production/editImage/createDirectorAsset", {
      base64Data,
      projectId: props.projectId,
      scriptId: props.scriptId,
      flowId,
      nodeId: props.id,
      targetType: props.targetType,
      targetId: props.targetId,
      assetType: sendToCanvas ? "cameraShot" : "blockingShot",
      name: `${camera?.name || "机位"}-${new Date().toLocaleTimeString()}`,
      promptFragment: camera?.promptFragment || props.data.promptFragment || buildPromptFragment(),
      sourceRefs: props.data.references
        .map((ref, index) => ({
          source: ref.source,
          sourceId: ref.sourceId,
          mediaPath: getMediaPathForGeneration(ref.media ?? normalizeMediaRef(ref, "image")),
          order: index,
          label: ref.label,
        }))
        .filter((item) => item.mediaPath || item.sourceId),
      camera: camera
        ? {
            id: camera.id,
            name: camera.name,
            fov: camera.fov,
            x: camera.x,
            y: camera.y,
            zoom: camera.zoom,
          }
        : undefined,
      stageDraft: {
        title: props.data.title,
        mode: props.data.mode,
        background: props.data.background,
        items: props.data.items,
      },
    });
    const media = normalizeMediaRef(data?.media ?? data?.asset?.media ?? data?.asset ?? data, "image");
    if (!media) throw new Error("后端未返回导演台资产媒体");
    const asset: ReferenceImage = {
      image: getMediaOriginalUrl(media),
      previewImage: getMediaPreviewUrl(media),
      media: { ...media, source: "directorAsset" },
      label: data?.name || data?.asset?.name || camera?.name || "导演台资产",
      source: "directorAsset",
      sourceId: data?.id ?? data?.assetId ?? data?.asset?.id ?? media.id,
      group: "directorStage",
      type: "image",
    };
    props.data.assets.unshift(asset);
    if (camera) camera.asset = asset;
    emit("change", asset);
    await props.saveFlow();
    window.$message.success(sendToCanvas ? "已发送到画布引用" : "导演台资产已保存");
  } catch (e) {
    window.$message.error((e as any)?.message || "导演台资产保存失败，请确认后端已支持 createDirectorAsset");
  } finally {
    saving.value = false;
  }
}

async function composeSnapshot() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前环境不支持截图");
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bg = getOriginalUrl(props.data.background) || getOriginalUrl(props.data.references[0]);
  if (bg) {
    try {
      const img = await loadImage(bg);
      drawCover(ctx, img, 0, 0, canvas.width, canvas.height);
    } catch {
      ctx.fillStyle = "#263241";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  drawGuide(ctx);
  for (const item of props.data.items) {
    await drawStageItem(ctx, item);
  }
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ctx.fillRect(20, 20, 260, 52);
  ctx.fillStyle = "#fff";
  ctx.font = "22px sans-serif";
  ctx.fillText(activeCamera.value?.name || "导演台截图", 36, 54);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function drawStageItem(ctx: CanvasRenderingContext2D, item: DirectorStagePlacedItem) {
  const x = (item.x / 100) * 1280;
  const y = (item.y / 100) * 720;
  const h = 160 * item.scale;
  const w = 72 * item.scale;
  const src = getOriginalUrl(item);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((item.rotation * Math.PI) / 180);
  if (src) {
    try {
      const img = await loadImage(src);
      drawContain(ctx, img, -w / 2, -h, w, h);
    } catch {
      drawDummy(ctx, item, w, h);
    }
  } else {
    drawDummy(ctx, item, w, h);
  }
  ctx.restore();
  ctx.fillStyle = "rgba(0,0,0,.62)";
  ctx.fillRect(x - 48, y - h - 34, 96, 24);
  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(item.label || "角色", x, y - h - 16);
  ctx.textAlign = "left";
}

function drawDummy(ctx: CanvasRenderingContext2D, item: DirectorStagePlacedItem, w: number, h: number) {
  ctx.fillStyle = item.color || (item.role === "actor" ? "#5585f7" : "#10b981");
  ctx.beginPath();
  ctx.arc(0, -h + 22, w * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-w * 0.22, -h + 44, w * 0.44, h * 0.48);
  ctx.fillRect(-w * 0.5, -h + 70, w * 0.25, h * 0.38);
  ctx.fillRect(w * 0.25, -h + 70, w * 0.25, h * 0.38);
  ctx.fillRect(-w * 0.26, -h * 0.28, w * 0.2, h * 0.28);
  ctx.fillRect(w * 0.06, -h * 0.28, w * 0.2, h * 0.28);
}

function drawGuide(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(255,255,255,.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(160, 90, 960, 540);
  ctx.strokeStyle = "rgba(255,255,255,.24)";
  ctx.beginPath();
  ctx.moveTo(480, 90);
  ctx.lineTo(480, 630);
  ctx.moveTo(800, 90);
  ctx.lineTo(800, 630);
  ctx.moveTo(160, 270);
  ctx.lineTo(1120, 270);
  ctx.moveTo(160, 450);
  ctx.lineTo(1120, 450);
  ctx.stroke();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + h - dh, dw, dh);
}

function placedItemStyle(item: DirectorStagePlacedItem, mini = false) {
  const scale = mini ? Math.max(0.35, item.scale * 0.45) : item.scale;
  return {
    left: `${item.x}%`,
    top: `${item.y}%`,
    transform: `translate(-50%, -100%) rotate(${item.rotation}deg) scale(${scale})`,
  };
}

function getPreviewUrl(item?: ReferenceImage) {
  if (!item) return "";
  return item.media ? getMediaPreviewUrl(item.media) : item.previewImage || item.image || "";
}

function getOriginalUrl(item?: ReferenceImage) {
  if (!item) return "";
  return item.media ? getMediaOriginalUrl(item.media) : item.image || item.previewImage || "";
}

function getSourceLabel(item: ReferenceImage) {
  const map: Record<string, string> = {
    asset: "资产",
    storyboard: "分镜",
    local: "本地",
    generated: "生成图",
    directorAsset: "导演台资产",
    directorStage: "导演台",
  };
  return map[item.source || ""] || "引用素材";
}

function previewAsset(asset: ReferenceImage) {
  const src = asset.previewImage || asset.image;
  if (!src) return;
  openImageLightbox({ images: [{ src, originalSrc: asset.image, title: asset.label }] });
}

function buildPromptFragment() {
  const bg = props.data.background?.label || "当前场景";
  const actors = props.data.items.filter((item) => item.role === "actor").map((item) => item.label || "角色").join("、") || "角色";
  return `${bg}内，${actors}按导演台站位构图，保持空间关系稳定，电影级画面。`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
</script>

<style scoped lang="scss">
.directorStageNode {
  width: 360px;
}

.nodeCard {
  overflow: hidden;
  border: 1px solid var(--td-border-level-2-color);
  border-radius: 10px;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-1);
}

.nodeHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
}

.nodeTitle {
  font-weight: 700;
}

.nodeSub {
  margin-top: 4px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.nodePreview {
  position: relative;
  height: 190px;
  overflow: hidden;
  background: #111827 center / cover no-repeat;
}

.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.7);
}

.miniItem {
  position: absolute;
  width: 42px;
  transform-origin: bottom center;
  pointer-events: none;

  img,
  span {
    display: block;
    width: 42px;
    height: 70px;
    border-radius: 12px 12px 8px 8px;
    object-fit: cover;
  }
}

.assetStrip {
  display: flex;
  gap: 6px;
  padding: 8px 12px 12px;
}

.assetThumb {
  width: 42px;
  height: 42px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--td-bg-color-component);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.directorShell {
  display: grid;
  grid-template-columns: 230px minmax(620px, 1fr) 280px;
  grid-template-rows: 64px 1fr;
  width: 100vw;
  height: 100vh;
  color: #f8fafc;
  background: #1f1f1f;
}

.topBar {
  grid-column: 1 / 4;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.topActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.leftPane,
.rightPane {
  overflow: auto;
  padding: 16px 12px;
  background: #202020;
}

.rightPane {
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.leftPane {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.paneTitle {
  margin: 12px 0 10px;
  font-weight: 700;
}

.treeList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.treeItem {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 8px;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  color: #f8fafc;
  background: transparent;
  cursor: pointer;
  text-align: left;

  &:hover,
  &.active {
    background: rgba(255, 255, 255, 0.1);
  }

  img {
    width: 28px;
    height: 28px;
    border-radius: 5px;
    object-fit: cover;
  }
}

.stagePane {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.stageCanvas {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #111827 center / cover no-repeat;
}

.blurBg {
  position: absolute;
  inset: -30px;
  opacity: 0.7;
  filter: blur(18px);
  background: center / cover no-repeat;
}

.stageFrame {
  position: relative;
  width: min(78vw, 1235px);
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: #0f172a center / cover no-repeat;
  background-image: inherit;
}

.safeFrame {
  position: absolute;
  inset: 16%;
  border: 1px solid rgba(125, 211, 252, 0.55);
}

.thirdLine {
  position: absolute;
  background: rgba(255, 255, 255, 0.22);

  &.v {
    top: 0;
    width: 1px;
    height: 100%;
  }

  &.h {
    left: 0;
    width: 100%;
    height: 1px;
  }

  &.one {
    left: 33.333%;
    top: 33.333%;
  }

  &.two {
    left: 66.666%;
    top: 66.666%;
  }
}

.placedItem {
  position: absolute;
  width: 84px;
  border: 0;
  background: transparent;
  transform-origin: bottom center;
  cursor: grab;

  img,
  .dummy {
    display: block;
    width: 84px;
    height: 150px;
    border-radius: 24px 24px 16px 16px;
    object-fit: cover;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
  }

  strong {
    position: absolute;
    left: 50%;
    top: -28px;
    transform: translateX(-50%);
    white-space: nowrap;
    color: #fff;
    text-shadow: 0 2px 8px #000;
  }

  &.selected img,
  &.selected .dummy {
    outline: 3px solid #14b8a6;
  }
}

.bottomTools {
  position: absolute;
  left: 50%;
  bottom: 26px;
  display: flex;
  gap: 10px;
  padding: 10px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.65);
  transform: translateX(-50%);
}

.triple {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.poseGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;

  button {
    border: 0;
    border-radius: 8px;
    padding: 8px 4px;
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.1);
    cursor: pointer;

    &.active {
      background: #2563eb;
    }
  }
}

.savedAssets {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  button {
    border: 0;
    border-radius: 8px;
    padding: 0;
    overflow: hidden;
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.08);
    cursor: pointer;
    text-align: left;
  }

  img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }

  span {
    display: block;
    padding: 6px;
    font-size: 12px;
  }
}
</style>
