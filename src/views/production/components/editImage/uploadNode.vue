<template>
  <div class="uploadNode">
    <Handle type="source" :position="Position.Right" style="z-index: 999999" />
    <div class="data">
      <div class="title ac">
        <i-pic theme="outline" size="16" fill="#000000" />
        <span style="margin-left: 5px; color: #4b4b4b">Image</span>
      </div>
      <div class="imageBox">
        <t-image
          class="image"
          :src="currentPreviewUrl"
          fit="contain"
          :style="{
            width: '100%',
            height: '100%',
            borderRadius: '10px',
          }">
          <template #overlayContent>
            <div class="imageToolsWrap">
              <ImageTools :src="currentImageUrl" position="br" />
            </div>
          </template>
        </t-image>
        <div v-if="data.label" class="imageLabel">{{ data.label }}</div>
        <t-dropdown :options="options" @click="clickHandler">
          <div class="upload ac">
            <i-upload theme="outline" size="18" fill="#fff" />
            <span style="margin-left: 5px; color: #fff">{{ $t("workbench.production.editImage.upload") }}</span>
          </div>
          <template #content>
            <div class="fc ac" style="gap: 6px">
              <t-button variant="outline" @click="uploadFn">资产图片</t-button>
              <t-button variant="outline" @click="getStoryboardImage">分镜图片</t-button>
            </div>
          </template>
        </t-dropdown>
        <t-popup :content="$t('workbench.production.save')">
          <t-button theme="primary" size="small" class="keepBottomLeftBtn" v-if="currentImageUrl" @click="handleKeep">
            <template #icon><i-save /></template>
          </t-button>
        </t-popup>
        <t-tooltip theme="primary" :content="$t('workbench.production.editImage.annotateImage')">
          <div
            v-if="currentImageUrl"
            class="annotate ac"
            :class="{ disabled: annotating }"
            @click.stop="annotatorVisible = true">
            <i-edit theme="outline" size="18" fill="#fff" />
            <span style="margin-left: 5px; color: #fff">
            {{ $t("workbench.production.editImage.annotateShort") }}
            </span>
          </div>
        </t-tooltip>
        <t-tooltip theme="primary" :content="$t('workbench.production.editImage.deleteNode')">
          <div class="remove ac" @click="removeFn">
            <i-delete theme="outline" size="18" fill="#fff" />
          </div>
        </t-tooltip>
      </div>
    </div>
    <ImageAnnotatorDialog v-model:visible="annotatorVisible" :src="currentImageUrl" @save="handleAnnotatorSave" />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position, useVueFlow } from "@vue-flow/core";
import { onBeforeUnmount, ref, watch } from "vue";
import type { Ref } from "vue";
import openAssetsSelector from "@/utils/assetsCheck";
import type { Storyboard } from "../../utils/flowBuilder";
import type { DropdownOption } from "tdesign-vue-next/es/dropdown";
import { useFileDialog } from "@vueuse/core";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import { getMediaOriginalUrl, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type { MediaRef } from "@/types/api";
import ImageAnnotatorDialog from "./ImageAnnotatorDialog.vue";
import type { ReferenceImage, UploadNodeData } from "../../utils/editImageType";

const { project } = storeToRefs(projectStore());
const props = defineProps<{
  id: string;
  data: {
    image?: string;
    previewImage?: string;
    label?: string;
    source?: "asset" | "local" | "storyboard" | "directorStage" | "directorAsset" | "generated";
    sourceId?: number | string;
    group?: string;
    type?: "image" | "video" | "audio" | "text";
    media?: MediaRef;
  };
}>();
const openStoryboardCheck = inject<() => Promise<Storyboard[]>>("openStoryboardCheck")!;

const { updateNodeData, removeNodes } = useVueFlow("editImage");
const currentImageUrl = ref(props.data?.image || "");
const currentPreviewUrl = ref(props.data?.previewImage || props.data?.image || "");
const currentObjectUrl = ref<string | null>(null);
const annotatorVisible = ref(false);
const annotating = ref(false);
const episodesId = inject<Ref<number>>("episodesId");
const { open, onChange, onCancel } = useFileDialog({ multiple: false, reset: true, accept: ".png,.jpg,.jpeg,.webp" });

const options = [
  { content: $t("workbench.production.editImage.uploadImage"), value: 1 },
  { content: $t("workbench.production.editImage.uploadStoryboardImage"), value: 2 },
  { content: $t("workbench.production.generatedNode.localUpload"), value: 3 },
];

watch(
  () => props.data?.image,
  (newUrl) => {
    currentImageUrl.value = newUrl || "";
    currentPreviewUrl.value = props.data?.previewImage || newUrl || "";
  },
);

watch(
  () => props.data?.previewImage,
  (newUrl) => {
    currentPreviewUrl.value = newUrl || currentImageUrl.value || "";
  },
);

onBeforeUnmount(() => {
  if (currentObjectUrl.value) {
    URL.revokeObjectURL(currentObjectUrl.value);
  }
});

function removeFn() {
  removeNodes(props.id);
}
const emit = defineEmits<{
  upload: [nodeId: string, reference: ReferenceImage];
  keep: [imageUrl: string, nodeId: string];
}>();

function commitReference(data: UploadNodeData) {
  currentImageUrl.value = data.image || "";
  currentPreviewUrl.value = data.previewImage || data.image || "";
  updateNodeData(props.id, data);
  emit("upload", props.id, data as ReferenceImage);
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
        projectId: project.value?.id,
        scriptId: episodesId?.value,
      });
      const media = normalizeMediaRef(data?.media ?? data, "image");
      const image = media ? getMediaOriginalUrl(media) : data;
      const previewImage = media ? getMediaPreviewUrl(media) : data;
      commitReference({
        image,
        previewImage,
        media,
        label: files[0].name,
        source: "local",
        sourceId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "image",
      });
    } catch (e) {
      window.$message.error((e as any)?.message || $t("workbench.production.editImage.uploadFailed"));
    }
  };
  reader.readAsDataURL(files[0]);
}

function handleKeep() {
  if (!currentImageUrl.value) return window.$message.error($t("workbench.production.editImage.noImage"));
  emit("keep", currentImageUrl.value, props.id);
}

async function handleAnnotatorSave(base64Data: string) {
  annotating.value = true;
  try {
    const { data } = await axios.post("/production/editImage/uploadImage", {
      base64Data,
      projectId: project.value?.id,
      scriptId: episodesId?.value,
    });
    const media = normalizeMediaRef(data?.media ?? data, "image");
    const image = media ? getMediaOriginalUrl(media) : data;
    const previewImage = media ? getMediaPreviewUrl(media) : data;
    commitReference({
      image,
      previewImage,
      media,
      label: props.data.label,
      source: "local",
      sourceId: `annotated-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      group: props.data.group,
      type: "image",
    });
    window.$message.success($t("workbench.production.editImage.annotateSaved"));
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.production.editImage.annotateSaveFailed"));
  } finally {
    annotating.value = false;
  }
}
async function uploadFn() {
  const selectedAssets = await openAssetsSelector({
    multiple: false,
    title: $t("workbench.production.editImage.selectImage"),
  });
  if (selectedAssets.length > 0) {
    const asset = selectedAssets[0] as any;
    const media = normalizeMediaRef((asset as any).media ?? asset, "image");
    const image = media ? getMediaOriginalUrl(media) : asset?.originalUrl || asset?.imageUrl || asset?.url || asset?.src || "";
    const previewImage = media ? getMediaPreviewUrl(media) : asset?.thumbnail || asset?.thumb || asset?.previewImage || asset?.src || asset?.imageUrl || asset?.url || image;
    commitReference({
      image,
      previewImage,
      media,
      label: asset.name,
      source: "asset",
      sourceId: asset.id,
      type: "image",
    });
  }
}
async function getStoryboardImage() {
  const rows = await openStoryboardCheck();
  if (rows.length > 0) {
    const row = rows[0] as any;
    const media = normalizeMediaRef((row as any).media ?? row, "image");
    const image = media ? getMediaOriginalUrl(media) : row?.originalUrl || row?.imageUrl || row?.url || row?.src || "";
    const previewImage = media ? getMediaPreviewUrl(media) : row?.thumbnail || row?.thumb || row?.previewImage || row?.src || row?.imageUrl || row?.url || image;
    commitReference({
      image,
      previewImage,
      media,
      label: row.videoDesc || row.prompt,
      source: "storyboard",
      sourceId: row.id,
      type: "image",
    });
  }
}
</script>

<style lang="scss" scoped>
.uploadNode {
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
    }
    .imageBox {
      border: 1px solid var(--td-border-level-1-color);
      height: 320px;
      width: 100%;
      position: relative;
      border-radius: 10px;
      .keepBottomLeftBtn {
        position: absolute;
        bottom: 10px;
        left: 10px;
        z-index: 9999;
        background-color: rgba(0, 0, 0, 0.5);
      }
      .image {
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

      .imageLabel {
        position: absolute;
        left: 48px;
        right: 10px;
        bottom: 10px;
        z-index: 2;
        padding: 3px 6px;
        border-radius: 4px;
        color: #fff;
        background: rgba(0, 0, 0, 0.5);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        pointer-events: none;
      }

      .upload,
      .annotate {
        position: absolute;
        left: 10px;
        z-index: 9999;
        padding: 5px 10px;
        border-radius: 10px;
        background-color: rgba(0, 0, 0, 0.5);
        cursor: pointer;
      }

      .upload {
        top: 10px;
      }

      .annotate {
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
      }

      .disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

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
    }
  }
}
</style>
