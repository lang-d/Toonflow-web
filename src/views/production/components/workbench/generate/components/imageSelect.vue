<template>
  <div class="imageUploadBox ac">
    <!-- 单图模式 -->
    <template v-if="mode == 'singleImage' || isMultiReferenceMode">
      <VueDraggable v-if="isMultiReferenceMode" v-model="imageList" class="referenceDragList" :animation="150" handle=".dragHandle">
        <div class="uploadBtn c fc" v-for="(item, index) in imageList" :key="`${item.sources}-${item.id ?? index}-${index}`">
          <div class="dragHandle">
            <i-drag />
          </div>
          <template v-if="item.src">
            <div v-if="item.fileType == 'image'" class="imagePreviewTrigger" @click.stop="openImagePreview(item)">
              <t-image :src="getReferenceThumbnail(item)" fit="contain" class="uploadPreview">
                <template #overlayContent></template>
              </t-image>
            </div>
            <t-tooltip theme="primary" v-else-if="item.fileType == 'audio'" :content="item?.prompt || ''">
              <div
                class="mediaPreview audioPreview audioPreviewTrigger"
                role="button"
                tabindex="0"
                @click.stop="previewAudio(item)"
                @keydown.enter.stop.prevent="previewAudio(item)"
                @keydown.space.stop.prevent="previewAudio(item)">
                <i-acoustic size="20" />
                <span class="mediaLabel">音频</span>
                <span class="audioPreviewBadge"><i-play size="12" /></span>
              </div>
            </t-tooltip>
            <div v-else-if="item.fileType == 'video'" class="mediaPreview videoPreview">
              <video class="uploadPreview" :src="item.src" preload="metadata" muted />
            </div>
          </template>
          <template v-else>
            <t-tooltip theme="primary" :content="item?.prompt ? '音频内容：' + item.prompt : ''">
              <span style="font-size: 20px">文</span>
            </t-tooltip>
          </template>
          <div class="imageToolsWrap" v-if="item.sources == 'storyboard' && item.index != null">
            {{ `P${item.index + 1}` }}
          </div>
          <div class="clearBtn" @click="splitImage(index)">
            <i-close size="12" />
          </div>
          <div class="source">
            <t-tag size="small" :title="getSourceTip(item)">{{ getReferenceLabel(item, index) }}</t-tag>
          </div>
        </div>
      </VueDraggable>
      <div class="uploadBtn c fc" v-else v-for="(item, index) in imageList.slice(0, 1)" :key="index">
        <template v-if="item.src">
          <div v-if="item.fileType == 'image'" class="imagePreviewTrigger" @click.stop="openImagePreview(item)">
            <t-image :src="getReferenceThumbnail(item)" fit="contain" class="uploadPreview">
              <template #overlayContent></template>
            </t-image>
          </div>
          <t-tooltip theme="primary" v-else-if="item.fileType == 'audio'" :content="item?.prompt || ''">
            <div
              class="mediaPreview audioPreview audioPreviewTrigger"
              role="button"
              tabindex="0"
              @click.stop="previewAudio(item)"
              @keydown.enter.stop.prevent="previewAudio(item)"
              @keydown.space.stop.prevent="previewAudio(item)">
              <i-acoustic size="20" />
              <span class="mediaLabel">音频</span>
              <span class="audioPreviewBadge"><i-play size="12" /></span>
            </div>
          </t-tooltip>
          <div v-else-if="item.fileType == 'video'" class="mediaPreview videoPreview">
            <video class="uploadPreview" :src="item.src" preload="metadata" muted />
          </div>
        </template>
        <template v-else>
          <t-tooltip theme="primary" :content="item?.prompt ? '音频内容：' + item.prompt : ''">
            <span style="font-size: 20px">文</span>
          </t-tooltip>
        </template>
        <div class="imageToolsWrap" v-if="item.sources == 'storyboard' && item.index != null">
          {{ `P${item.index + 1}` }}
        </div>
        <div class="clearBtn" @click="splitImage(index)">
          <i-close size="12" />
        </div>
        <div class="source">
          <t-tag size="small" :title="getSourceTip(item)">{{ getReferenceLabel(item, index) }}</t-tag>
        </div>
      </div>
    </template>
    <template v-else-if="mode == 'endFrameOptional' || mode == 'startFrameOptional' || mode == 'startEndRequired'">
      <div class="uploadBtn c fc" v-for="(item, index) in buildLabel" :key="item.value" @click="handleMixedAdd(item.value as 'start' | 'end')">
        <div v-if="!isEmptySlot(imageList?.[index])" style="flex: 1; width: 100%" class="ac">
          <template v-if="imageList?.[index]?.src">
            <div
              v-if="imageList?.[index]?.fileType == 'image'"
              class="imagePreviewTrigger"
              @click.stop="openImagePreview(imageList?.[index])">
              <t-image :src="getReferenceThumbnail(imageList?.[index])" fit="contain" class="uploadPreview">
                <template #overlayContent></template>
              </t-image>
            </div>
            <div
              v-else-if="imageList?.[index]?.fileType == 'audio'"
              class="mediaPreview audioPreview audioPreviewTrigger"
              role="button"
              tabindex="0"
              @click.stop="previewAudio(imageList?.[index])"
              @keydown.enter.stop.prevent="previewAudio(imageList?.[index])"
              @keydown.space.stop.prevent="previewAudio(imageList?.[index])">
              <i-acoustic size="20" />
              <span class="mediaLabel">音频</span>
              <span class="audioPreviewBadge"><i-play size="12" /></span>
            </div>
            <div v-else-if="imageList?.[index]?.fileType == 'video'" class="mediaPreview videoPreview">
              <video class="uploadPreview" :src="imageList?.[index]!.src" preload="metadata" muted />
            </div>
          </template>
          <template v-else>
            <t-tooltip theme="primary" :content="imageList?.[index]?.prompt || ''">
              <span style="font-size: 20px">文</span>
            </t-tooltip>
          </template>
          <div class="imageToolsWrap" v-if="imageList?.[index]?.sources == 'storyboard' && imageList?.[index]?.index != null">
            {{ `P${imageList[index]?.index + 1}` }}
          </div>
          <div class="clearBtn" @click.stop="clearImage(index)">
            <i-close size="12" />
          </div>
          <div class="source">
            <t-tag size="small" :title="getSourceTip(imageList?.[index])">{{ getReferenceLabel(imageList?.[index], index) }}</t-tag>
          </div>
        </div>
        <template v-else>
          <i-plus size="24"></i-plus>
          {{ item.label }}
        </template>
      </div>
    </template>
    <div class="uploadBtn c fc" v-if="isShowAddImage" @click="handleMixedAdd()">
      <i-plus size="24"></i-plus>
      {{ $t("workbench.generate.addReference") }}
    </div>

    <!-- 分镜选择弹窗 -->
    <t-dialog
      v-model:visible="storyboardDialogVisible"
      :header="$t('workbench.generate.selectStoryboard')"
      :footer="false"
      width="800px"
      placement="center">
      <div class="storyboardGrid">
        <div
          class="storyboardItem"
          v-for="sb in storyboardList"
          :key="sb.id"
          :class="{ selected: isStoryboardSelected(sb) }"
          @click="handleStoryboardClick(sb)">
          <div class="imageToolsWrap" v-if="sb?.index != null">
            {{ `P${sb?.index + 1}` }}
          </div>
          <img v-if="sb.src" :src="sb.src" />
          <div v-else class="textBox ac jc">
            <t-tooltip theme="primary" :content="getStoryboardFactSummary(sb)">
              <span style="font-size: 20px">{{ `分镜 ${sb?.index + 1 || ""}` }}</span>
            </t-tooltip>
          </div>
        </div>
      </div>
      <div v-if="canMultiPickStoryboard" class="storyboardDialogActions">
        <span class="storyboardSelectedCount">{{ $t("workbench.production.node.storyboard.selectedCount", { count: selectedStoryboardIds.length }) }}</span>
        <div class="storyboardActionButtons">
          <t-button variant="outline" @click="storyboardDialogVisible = false">{{ $t("common.cancel") }}</t-button>
          <t-button theme="primary" :disabled="!selectedStoryboardIds.length" @click="confirmStoryboardSelection">
            {{ $t("common.confirm") }}
          </t-button>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import "@/views/production/components/workbench/type/type";
import assetsCheck, { type ClipMediaType } from "@/utils/assetsCheck";
import axios from "@/utils/axios";
import { openImageLightbox } from "@/composables/useImageLightbox";
import { getOriginalImageUrl, getThumbnailImageUrl } from "@/utils/imageUrl";
import { getMediaOriginalUrl, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import { deriveReferenceTokens, getDerivedReferenceToken } from "../referenceTokens";

const props = defineProps<{
  mode: VideoMode;
  storyboardList: StoryboardItem[];
}>();
const imageList = defineModel<UploadItem[]>({
  default: () => [],
});
const emit = defineEmits<{
  previewAudio: [item: UploadItem];
}>();
//分镜选择弹窗
const storyboardDialogVisible = ref(false);
const selectedStoryboardIds = ref<number[]>([]);

function getReferenceThumbnail(item?: UploadItem) {
  if (!item) return "";
  if (item.media) return getMediaPreviewUrl(item.media);
  return getThumbnailImageUrl(item.thumbnail || item.thumb || item.src || "");
}

function openImagePreview(item?: UploadItem) {
  if (!item?.src) return;
  const previewItems = imageList.value.filter((candidate) => candidate.fileType === "image" && candidate.src);
  const previewIndex = Math.max(0, previewItems.indexOf(item));
  openImageLightbox({
    images: previewItems.map((candidate) => ({
      src: getReferenceThumbnail(candidate),
      originalSrc: candidate.media ? getMediaOriginalUrl(candidate.media) : getOriginalImageUrl(candidate.originalUrl || candidate.imageUrl || candidate.src || ""),
      title: candidate.name,
    })),
    index: previewIndex,
  });
}

function previewAudio(item?: UploadItem) {
  if (!item || item.fileType !== "audio") return;
  emit("previewAudio", item);
}

/** 空占位项，用于首尾帧模式中未设置的槽位 */
const EMPTY_SLOT: UploadItem = { fileType: "image", id: null, src: "" } as any;
function isEmptySlot(item: UploadItem | undefined): boolean {
  return !item || !item.id;
}

const buildLabel = computed(() => {
  const startOptional = props.mode === "startFrameOptional";
  const endOptional = props.mode === "endFrameOptional";
  return [
    { label: startOptional ? "首帧(可选)" : "首帧", value: "start" },
    { label: endOptional ? "尾帧(可选)" : "尾帧", value: "end" },
  ];
});

/** 确保 imageList 始终有两个槽位（首帧 index=0，尾帧 index=1） */
function ensureFrameSlots(): UploadItem[] {
  const list = [...imageList.value];
  while (list.length < 2) list.push({ ...EMPTY_SLOT });
  return list;
}

/** 将 item 设置到首帧或尾帧槽位 */
function setFrameSlot(slot: "start" | "end", item: UploadItem) {
  const list = ensureFrameSlots();
  list[slot === "start" ? 0 : 1] = item;
  imageList.value = list;
}

/** 解析模式值（字符串或 JSON 数组） */
function parseMode(value: string): VideoMode | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as ReferenceType[];
  } catch {
    return value as Exclude<VideoMode, ReferenceType[]>;
  }
  return value as Exclude<VideoMode, ReferenceType[]>;
}

const parsedMode = computed(() => parseMode(props.mode as string));
const isMultiReferenceMode = computed(() => Array.isArray(parsedMode.value));
const derivedReferenceItems = computed(() => deriveReferenceTokens(imageList.value as any[]));

function normalizeCategory(type: string | undefined): UploadCategory {
  if (type === "role" || type === "scene" || type === "tool" || type === "clip" || type === "audio") return type;
  return "other";
}

function getSourceLabel(item?: UploadItem) {
  if (!item) return "";
  if (item.sources == "storyboard") return $t("workbench.generate.storyboard");
  if (item.sources == "merged") return "合图参考";
  if (item.sources == "directorAsset") return "导演资产";
  return $t("workbench.generate.assets");
}

function getReferenceLabel(item?: UploadItem, index?: number) {
  const derived = typeof index === "number" ? derivedReferenceItems.value[index] : undefined;
  return getDerivedReferenceToken(derived) || getSourceLabel(item);
}

function getSourceTip(item?: UploadItem) {
  if (item?.sources === "merged") return "合图只是视觉参考快照，不代表单个分镜，也不会替代分镜组明细。";
  return "";
}

//判断是否显示添加参考图
const isShowAddImage = computed(() => {
  const mode = props.mode;
  if (mode == "singleImage" && imageList.value.length >= 1) {
    return false;
  }
  if (mode == "endFrameOptional" || mode == "startEndRequired" || mode == "startFrameOptional") {
    return false;
  }
  if (mode == "text") return false;
  //多参模式默认 true
  return true;
});

/** 根据文件扩展名推断媒体类型 */
function getFileTypeByExt(src: string | undefined): "image" | "video" | "audio" {
  const cleanSrc = src?.split(/[?#]/)[0] ?? "";
  const ext = cleanSrc.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
  return "image";
}
/** 根据混合模式推导当前允许的 clip 媒体类型 */
const mixedClipMediaTypes = computed<ClipMediaType[]>(() => {
  const mode = parsedMode.value;
  if (!Array.isArray(mode)) return [];
  const map: Record<string, ClipMediaType> = { audioReference: "audio", imageReference: "image", videoReference: "video" };
  return mode.filter((m) => m in map).map((m) => map[m]);
});
const currentSlot = ref<"start" | "end" | "">("");
const canMultiPickStoryboard = computed(() => !currentSlot.value && props.mode !== "singleImage");
function handleMixedAdd(slot: "start" | "end" | "" = "") {
  if (!props.mode) return window.$message.error($t("workbench.generate.notSelectMode"));
  currentSlot.value = slot;
  selectedStoryboardIds.value = [];
  const multiple = !slot && props.mode !== "singleImage";
  const dlg = DialogPlugin.confirm({
    header: $t("workbench.generate.selectSource"),
    confirmBtn: $t("workbench.generate.confirm"),
    cancelBtn: $t("workbench.generate.cancel"),
    onConfirm: async () => {
      dlg.destroy();
      const assets = await assetsCheck({ types: ["role", "tool", "scene", "clip", "audio"], clipMediaTypes: mixedClipMediaTypes.value, multiple });

      if (!assets.length) return;

      const newItems: UploadItem[] = assets.flatMap((asset) => {
        if (asset.type === "audio" && asset?.sonAssets?.length) {
          return asset.sonAssets.map((sub: any) => {
            const media = normalizeMediaRef(sub.media ?? sub, sub.type === "audio" ? "audio" : "image");
            const fileType = (media?.type === "image" || media?.type === "video" || media?.type === "audio" ? media.type : getFileTypeByExt(sub.src)) as "image" | "video" | "audio";
            return {
              fileType,
              sources: "assets",
              src: media ? getMediaPreviewUrl(media) || getMediaOriginalUrl(media) : sub.src,
              media,
              originalUrl: sub.originalUrl,
              imageUrl: sub.imageUrl,
              thumbnail: sub.thumbnail,
              thumb: sub.thumb,
              id: sub.id,
              prompt: sub.prompt,
              name: sub.name,
              parentName: sub.parentName,
              category: normalizeCategory(sub.parentType || sub.type),
            } as UploadItem;
          });
        }
        const media = normalizeMediaRef((asset as any).media ?? asset, asset.type === "audio" ? "audio" : "image");
        const fileType = (media?.type === "image" || media?.type === "video" || media?.type === "audio" ? media.type : getFileTypeByExt(asset.src)) as "image" | "video" | "audio";
        return [
          {
            fileType,
            sources: "assets",
            src: media ? getMediaPreviewUrl(media) || getMediaOriginalUrl(media) : asset.src,
            media,
            originalUrl: (asset as any).originalUrl,
            imageUrl: (asset as any).imageUrl,
            thumbnail: (asset as any).thumbnail,
            thumb: (asset as any).thumb,
            id: asset.id,
            prompt: asset.prompt,
            name: asset.name,
            parentName: (asset as any).parentName,
            category: normalizeCategory((asset as any).parentType || asset.type),
          } as UploadItem,
        ];
      });
      if (slot === "start" || slot === "end") {
        setFrameSlot(slot, newItems[0]);
      } else if (props.mode === "singleImage") {
        imageList.value = [newItems[0]];
      } else {
        const assetsNotAudioIds = newItems.filter((i) => i.fileType !== "audio");
        const { data } = await axios.post("/production/workbench/getAudioBindAssetsList", {
          assetsIds: assetsNotAudioIds.map((i) => i.id),
        });
        imageList.value = [...imageList.value, ...newItems, ...(data ?? [])];
      }
    },
    onCancel: () => {
      dlg.destroy();
      selectedStoryboardIds.value = [];
      storyboardDialogVisible.value = true;
    },
  });
}
function clearImage(index: number) {
  const list = ensureFrameSlots();
  list[index] = { ...EMPTY_SLOT };
  imageList.value = list;
}
function createStoryboardUploadItem(sb: StoryboardItem): UploadItem {
  const fileType = "image";
  const media = normalizeMediaRef((sb as any).media ?? sb, "image");
  return {
    fileType,
    sources: "storyboard",
    src: media ? getMediaPreviewUrl(media) : sb.src,
    media,
    originalUrl: sb.originalUrl ?? undefined,
    imageUrl: sb.imageUrl ?? undefined,
    thumbnail: sb.thumbnail ?? undefined,
    thumb: sb.thumb ?? undefined,
    id: sb.id,
    prompt: getStoryboardFactSummary(sb) || undefined,
    name: `P${sb.index + 1}`,
    index: sb.index,
  } as UploadItem;
}

function getStoryboardFactSummary(sb: StoryboardItem) {
  return [sb.location, sb.timeOfDay, sb.picture, sb.action, sb.dialogue, sb.sound]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" 路 ");
}

function isStoryboardSelected(sb: StoryboardItem) {
  return selectedStoryboardIds.value.includes(sb.id);
}

function toggleStoryboardSelection(sb: StoryboardItem) {
  selectedStoryboardIds.value = isStoryboardSelected(sb)
    ? selectedStoryboardIds.value.filter((id) => id !== sb.id)
    : [...selectedStoryboardIds.value, sb.id];
}

function handleStoryboardClick(sb: StoryboardItem) {
  if (canMultiPickStoryboard.value) {
    toggleStoryboardSelection(sb);
    return;
  }
  pickStoryboard(sb);
}

/** 分镜弹窗选中回调 */
function pickStoryboard(sb: StoryboardItem) {
  storyboardDialogVisible.value = false;
  const newItem = createStoryboardUploadItem(sb);

  if (currentSlot.value === "start" || currentSlot.value === "end") {
    setFrameSlot(currentSlot.value, newItem);
  } else {
    imageList.value = [...imageList.value, newItem];
  }
}

function confirmStoryboardSelection() {
  const selectedItems = props.storyboardList
    .filter((item) => selectedStoryboardIds.value.includes(item.id))
    .map(createStoryboardUploadItem);
  if (!selectedItems.length) return;
  imageList.value = [...imageList.value, ...selectedItems];
  selectedStoryboardIds.value = [];
  storyboardDialogVisible.value = false;
}
function splitImage(index: number) {
  const list = [...imageList.value];
  list.splice(index, 1);
  imageList.value = list;
}
</script>

<style lang="scss" scoped>
.imageUploadBox {
  gap: 8px;
  overflow-x: auto;
  flex-wrap: nowrap;
  padding-bottom: 6px;
  &::-webkit-scrollbar {
    height: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #696969;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-track {
    background-color: var(--td-bg-color-secondarycontainer);
    border-radius: 4px;
  }
  .referenceDragList {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
  }
  .imageToolsWrap {
    z-index: 99999;
    position: absolute;
    left: 4px;
    top: 4px;
    padding: 0 5px;
    font-size: 11px;
    line-height: 18px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    border-radius: 4px;
    backdrop-filter: blur(4px);
    user-select: none;
    white-space: nowrap;
  }
  .uploadBtn {
    width: 80px;
    min-width: 80px;
    height: 80px;
    flex-shrink: 0;
    position: relative;
    border: 1px dashed var(--td-component-border);
    border-radius: 8px;
    &:hover {
      border-color: var(--td-text-color);
      cursor: pointer;
    }
    .dragHandle {
      position: absolute;
      left: 2px;
      bottom: 2px;
      z-index: 3;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: grab;
      font-size: 12px;
    }
    &:hover .dragHandle {
      display: flex;
    }

    .uploadPreview {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
    }
    .imagePreviewTrigger {
      width: 100%;
      height: 100%;
      cursor: zoom-in;
    }
    .mediaPreview {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      gap: 4px;
      .mediaLabel {
        font-size: 11px;
        color: var(--td-text-color-secondary);
      }
      &.audioPreview {
        position: relative;
        background: var(--td-bg-color-secondarycontainer);
        color: var(--td-brand-color);
      }
      &.audioPreviewTrigger {
        cursor: pointer;
      }
      &.audioPreviewTrigger:hover {
        background: var(--td-brand-color-light);
      }
      .audioPreviewBadge {
        position: absolute;
        right: 6px;
        bottom: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        color: #fff;
        background: var(--td-brand-color);
      }
      &.videoPreview {
        background: #000;
        overflow: hidden;
      }
    }
    .clearBtn {
      z-index: 999999999999999;
      position: absolute;
      top: 2px;
      right: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      &:hover {
        background: rgba(0, 0, 0, 0.85);
      }
    }
    &:hover .clearBtn {
      display: flex;
    }
    .source {
      position: absolute;
      bottom: 2px;
      right: 2px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      &:hover {
        background: rgba(0, 0, 0, 0.85);
      }
    }
    &:hover .source {
      display: flex;
    }
  }
  .storyboardGrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    max-height: 60vh;
    overflow-y: auto;
    padding: 4px;
    .storyboardItem {
      cursor: pointer;
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      border: 2px solid transparent;
      transition:
        border-color 0.2s,
        box-shadow 0.2s;
      &:hover {
        border-color: var(--td-brand-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
      }
      &.selected {
        border-color: var(--td-brand-color);
        box-shadow: 0 0 0 2px rgba(0, 82, 217, 0.18);
      }
      &.selected::after {
        content: "✓";
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 2;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--td-brand-color);
        color: #fff;
        font-size: 14px;
        line-height: 22px;
        text-align: center;
        font-weight: 700;
      }
      img {
        width: 100%;
        aspect-ratio: 16/9;
        object-fit: cover;
        display: block;
      }
      .textBox {
        aspect-ratio: 16/9;
        width: 100%;
        text-align: center;
        border: 1px solid #ccc;
      }
    }
  }
  .storyboardDialogActions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 4px 0;
  }
  .storyboardSelectedCount {
    color: var(--td-text-color-secondary);
    font-size: 13px;
  }
  .storyboardActionButtons {
    display: flex;
    gap: 8px;
  }
}
</style>
