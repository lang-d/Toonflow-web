<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="imageLightbox"
      tabindex="-1"
      data-testid="image-lightbox"
      @mousedown.self="close"
      @wheel.prevent="handleWheel">
      <header class="lightboxHeader">
        <div class="titleBlock">
          <strong>{{ currentImage?.title || $t("components.imageLightbox.preview") }}</strong>
          <span v-if="images.length > 1">{{ index + 1 }} / {{ images.length }}</span>
        </div>
        <t-button variant="text" shape="square" :title="$t('components.imageLightbox.close')" @click="close">
          <template #icon><i-close /></template>
        </t-button>
      </header>

      <button
        v-if="images.length > 1"
        class="navButton navPrevious"
        :disabled="index <= 0"
        :title="$t('components.imageLightbox.previous')"
        @click="showPrevious">
        <i-left />
      </button>

      <main ref="stageRef" class="lightboxStage" @mousedown="startPan" @dblclick="fitToWindow">
        <div
          v-if="currentImage"
          class="imageTransform"
          :class="{ dragging: isDragging }"
          :style="transformStyle">
          <img
            ref="displayImageRef"
            :key="displayUrl"
            :src="displayUrl"
            :alt="currentImage.title || ''"
            draggable="false"
            @load="handleDisplayLoad" />
        </div>

        <div v-if="originalStatus === 'loading'" class="loadStatus">
          <t-loading size="small" />
          <span>{{ $t("components.imageLightbox.loadingOriginal") }}</span>
        </div>
        <div v-else-if="originalStatus === 'failed'" class="loadStatus loadFailed">
          <i-caution />
          <span>{{ $t("components.imageLightbox.originalLoadFailed") }}</span>
        </div>
      </main>

      <button
        v-if="images.length > 1"
        class="navButton navNext"
        :disabled="index >= images.length - 1"
        :title="$t('components.imageLightbox.next')"
        @click="showNext">
        <i-right />
      </button>

      <footer class="lightboxToolbar">
        <t-button variant="text" :title="$t('components.imageLightbox.fit')" @click="fitToWindow">
          <template #icon><i-full-screen-one /></template>
          {{ $t("components.imageLightbox.fit") }}
        </t-button>
        <t-button variant="text" :title="$t('components.imageLightbox.actualSize')" @click="showActualSize">
          1:1
        </t-button>
        <span class="scaleValue">{{ Math.round(scale * 100) }}%</span>
        <t-button
          variant="text"
          :loading="downloadLoading"
          :title="$t('components.imageLightbox.download')"
          @click="downloadOriginal">
          <template #icon><i-download /></template>
          {{ $t("components.imageLightbox.download") }}
        </t-button>
      </footer>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { useImageLightbox } from "@/composables/useImageLightbox";
import { getOriginalImageUrl } from "@/utils/imageUrl";

type OriginalStatus = "idle" | "loading" | "loaded" | "failed";

const { visible, images, index, openVersion, close } = useImageLightbox();
const stageRef = ref<HTMLElement | null>(null);
const displayImageRef = ref<HTMLImageElement | null>(null);
const displayUrl = ref("");
const naturalSize = reactive({ width: 0, height: 0 });
const scale = ref(1);
const translate = reactive({ x: 0, y: 0 });
const isDragging = ref(false);
const originalStatus = ref<OriginalStatus>("idle");
const downloadLoading = ref(false);
const loadedOriginals = new Set<string>();
let loadRequestId = 0;
let dragOrigin = { x: 0, y: 0, translateX: 0, translateY: 0 };

const currentImage = computed(() => images.value[index.value]);
const currentOriginalUrl = computed(() => {
  const item = currentImage.value;
  return item ? getOriginalImageUrl(item.originalSrc || item.src) : "";
});
const transformStyle = computed(() => ({
  transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale(${scale.value})`,
}));

function resetTransform() {
  scale.value = 1;
  translate.x = 0;
  translate.y = 0;
}

function loadCurrentImage() {
  const item = currentImage.value;
  if (!item) return;

  const requestId = ++loadRequestId;
  const originalUrl = currentOriginalUrl.value;
  displayUrl.value = item.src;
  originalStatus.value = "loading";
  resetTransform();

  if (!originalUrl || originalUrl === item.src) {
    originalStatus.value = "loaded";
    if (originalUrl) loadedOriginals.add(originalUrl);
    return;
  }

  if (loadedOriginals.has(originalUrl)) {
    displayUrl.value = originalUrl;
    originalStatus.value = "loaded";
    return;
  }

  const original = new Image();
  original.onload = () => {
    if (requestId !== loadRequestId) return;
    loadedOriginals.add(originalUrl);
    originalStatus.value = "loaded";
    displayUrl.value = originalUrl;
  };
  original.onerror = () => {
    if (requestId !== loadRequestId) return;
    originalStatus.value = "failed";
  };
  original.src = originalUrl;
}

function handleDisplayLoad(event: Event) {
  const image = event.target as HTMLImageElement;
  naturalSize.width = image.naturalWidth;
  naturalSize.height = image.naturalHeight;
  nextTick(fitToWindow);
}

function fitToWindow() {
  const stage = stageRef.value;
  if (!stage || !naturalSize.width || !naturalSize.height) return;
  const availableWidth = Math.max(stage.clientWidth - 96, 1);
  const availableHeight = Math.max(stage.clientHeight - 96, 1);
  scale.value = Math.max(0.1, Math.min(4, availableWidth / naturalSize.width, availableHeight / naturalSize.height));
  translate.x = 0;
  translate.y = 0;
}

function showActualSize() {
  scale.value = 1;
  translate.x = 0;
  translate.y = 0;
}

function handleWheel(event: WheelEvent) {
  const stage = stageRef.value;
  if (!stage || !displayImageRef.value) return;

  const oldScale = scale.value;
  const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
  const nextScale = Math.min(8, Math.max(0.1, oldScale * factor));
  if (nextScale === oldScale) return;

  const rect = stage.getBoundingClientRect();
  const pointerX = event.clientX - (rect.left + rect.width / 2);
  const pointerY = event.clientY - (rect.top + rect.height / 2);
  const ratio = nextScale / oldScale;
  translate.x = pointerX - (pointerX - translate.x) * ratio;
  translate.y = pointerY - (pointerY - translate.y) * ratio;
  scale.value = nextScale;
}

function startPan(event: MouseEvent) {
  if (event.button !== 0 || event.target === stageRef.value) return;
  event.preventDefault();
  isDragging.value = true;
  dragOrigin = {
    x: event.clientX,
    y: event.clientY,
    translateX: translate.x,
    translateY: translate.y,
  };
  document.addEventListener("mousemove", handlePan);
  document.addEventListener("mouseup", stopPan, { once: true });
}

function handlePan(event: MouseEvent) {
  if (!isDragging.value) return;
  translate.x = dragOrigin.translateX + event.clientX - dragOrigin.x;
  translate.y = dragOrigin.translateY + event.clientY - dragOrigin.y;
}

function stopPan() {
  isDragging.value = false;
  document.removeEventListener("mousemove", handlePan);
}

function showPrevious() {
  if (index.value > 0) index.value -= 1;
}

function showNext() {
  if (index.value < images.value.length - 1) index.value += 1;
}

function triggerDownload(href: string, filename: string, newTab = false) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  if (newTab) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function getDownloadName() {
  const item = currentImage.value;
  if (item?.downloadName) return item.downloadName;
  try {
    return new URL(currentOriginalUrl.value, window.location.origin).pathname.split("/").pop() || "image";
  } catch {
    return "image";
  }
}

async function downloadOriginal() {
  const url = currentOriginalUrl.value;
  if (!url || downloadLoading.value) return;

  downloadLoading.value = true;
  let objectUrl = "";
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("download failed");
    objectUrl = URL.createObjectURL(await response.blob());
    triggerDownload(objectUrl, getDownloadName());
  } catch {
    triggerDownload(url, getDownloadName(), true);
    window.$message.warning($t("components.imageTools.msg.downloadBlockedOpenNewWindow"));
  } finally {
    downloadLoading.value = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!visible.value) return;
  if (event.key === "Escape") close();
  if (event.key === "ArrowLeft") showPrevious();
  if (event.key === "ArrowRight") showNext();
}

watch([visible, index, openVersion], ([isVisible]) => {
  if (isVisible) {
    loadCurrentImage();
    return;
  }
  loadRequestId += 1;
  stopPan();
});

useEventListener(window, "keydown", handleKeydown);
useEventListener(window, "resize", () => {
  if (visible.value) fitToWindow();
});

onBeforeUnmount(() => {
  loadRequestId += 1;
  stopPan();
});
</script>

<style scoped lang="scss">
.imageLightbox {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr) 64px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  user-select: none;
}

.lightboxHeader {
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: rgba(10, 10, 10, 0.82);
}

.titleBlock {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 12px;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
  }
}

.lightboxStage {
  position: relative;
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: grab;
}

.imageTransform {
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center;
  will-change: transform;
  transition: transform 0.12s ease;

  &.dragging {
    cursor: grabbing;
    transition: none;
  }

  img {
    display: block;
    max-width: none;
    max-height: none;
    animation: imageFadeIn 0.18s ease;
    pointer-events: none;
    user-select: none;
  }
}

@keyframes imageFadeIn {
  from {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
}

.loadStatus {
  position: absolute;
  bottom: 18px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  transform: translateX(-50%);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.66);
  font-size: 12px;

  &.loadFailed {
    color: #ffb9b9;
  }
}

.navButton {
  position: absolute;
  z-index: 3;
  top: 50%;
  display: flex;
  width: 44px;
  height: 56px;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  border: 0;
  background: rgba(0, 0, 0, 0.48);
  color: #fff;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.25;
  }
}

.navPrevious {
  left: 16px;
}

.navNext {
  right: 16px;
}

.lightboxToolbar {
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(10, 10, 10, 0.82);
}

.scaleValue {
  width: 58px;
  color: rgba(255, 255, 255, 0.78);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

:deep(.t-button) {
  color: #fff;
}
</style>
