<template>
  <section class="videoProductionWorkbench">
    <nav class="topMenu f ac" aria-label="视频生产功能">
      <div class="workbenchMenuTabs f ac">
        <t-tooltip :content="$t('workbench.production.wb.quickPreview')" placement="bottom" theme="light" destroyOnClose :showArrow="false">
          <div class="item fc c" :class="{ active: activeMenu === 'preview' }" @click="changeMenu('preview')">
            <i-blackboard class="icon" />
          </div>
        </t-tooltip>
        <t-tooltip :content="$t('workbench.production.wb.videoGeneration')" placement="bottom" theme="light" destroyOnClose :showArrow="false">
          <div class="item fc c" :class="{ active: activeMenu === 'generate' }" @click="changeMenu('generate')">
            <i-playback-progress class="icon" />
          </div>
        </t-tooltip>
        <t-tooltip :content="$t('workbench.production.wb.videoEditing')" placement="bottom" theme="light" destroyOnClose :showArrow="false">
          <div class="item fc c" :class="{ active: activeMenu === 'editVideo' }" @click="changeMenu('editVideo')">
            <i-editing class="icon" />
          </div>
        </t-tooltip>
      </div>
      <div class="workbenchActions">
        <slot name="actions" />
      </div>
    </nav>
    <div class="content">
      <preview v-if="activeMenu === 'preview'" :script-id="scriptId" :refresh-token="refreshToken" />
      <generate
        v-if="activeMenu === 'generate'"
        :script-id="scriptId"
        :refresh-token="refreshToken"
        v-model="extractLines"
        @importVideo="handleBatchDownload"
        @track-context-visible-change="trackContextDrawerVisible = $event" />
      <editVideo
        v-if="activeMenu === 'editVideo'"
        :initial-tracks="mockTracks"
        :initial-video-items="initialVideoItems"
        :initial-media-items="mockMediaItems"
        :initial-audio-items="mockAudioItems"
        :initial-image-items="mockImageItems"
        :canvas-width="canvasWidth"
        :canvas-height="canvasHeight"
        ref="editVideoRef" />
    </div>
    <div v-if="importLoading" class="importLoadingMask">
      <div class="importLoadingContent">
        <t-loading size="large" :text="$t('workbench.production.wb.importingLoading')" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { watch } from "vue";
import axios from "@/utils/axios";
import preview from "./preview.vue";
import generate from "./generate/index.vue";
import editVideo from "./editVideo/index.vue";
import { generateId, type Track } from "vue-clip-track";
import type { MediaItem, AudioItem } from "./editVideo/utils/mediaData";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());

const props = defineProps<{
  scriptId: number;
  refreshToken?: number;
}>();
const activeMenu = ref("preview");
const trackContextDrawerVisible = ref(false);

watch(
  () => [props.scriptId, props.refreshToken],
  () => {
    trackContextDrawerVisible.value = false;
    editFootage();
  },
);

// 画布尺寸配置
const canvasWidth = ref(1920);
const canvasHeight = ref(1080);

onMounted(() => {
  const size = project.value?.videoRatio;
  if (size == "16:9") {
    canvasWidth.value = 1920;
    canvasHeight.value = 1080;
  } else if (size == "1:1") {
    canvasWidth.value = 1080;
    canvasHeight.value = 1080;
  } else if (size == "9:16") {
    canvasWidth.value = 1080;
    canvasHeight.value = 1920;
  }
});

// ============ 演示数据（可替换为在线资源地址） ============

/** 资源库 - 分镜视频 */
const initialVideoItems = ref<MediaItem[]>([]);

/** 资源库 - 视频素材 */
const mockMediaItems = ref<MediaItem[]>([]);

/** 资源库 - 音频素材 */
const mockAudioItems = ref<AudioItem[]>([]);

/** 资源库 - 图片素材 */
const mockImageItems = ref<MediaItem[]>([]);

const extractLines = ref(false);
const importLoading = ref(false);

onMounted(() => {
  editFootage();
});
type MediaType = "image" | "video" | "audio" | "unknown";
type ImportVideoItem = {
  trackId: number;
  videoId: number;
  src: string;
  duration: number;
};

function getMediaType(src?: string): MediaType {
  if (!src) return "unknown";
  const ext = src.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
  return "unknown";
}
//切换菜单
function changeMenu(type: string) {
  if (type !== "generate") trackContextDrawerVisible.value = false;
  activeMenu.value = type;
  if (type == "editVideo") editFootage();
}
//查询剪辑素材
let editFootageRequestId = 0;
function editFootage() {
  const requestId = ++editFootageRequestId;
  const projectId = project.value?.id;
  const scriptId = props.scriptId;
  if (!projectId || !scriptId) return;

  axios
    .post("/assets/getMaterialData", {
      projectId,
      scriptId,
    })
    .then(({ data }) => {
      if (requestId !== editFootageRequestId || project.value?.id !== projectId || props.scriptId !== scriptId) return;

      const materialItems = Array.isArray(data?.data) ? data.data : [];
      const storyboardVideos = Array.isArray(data?.video) ? data.video : [];
      const videoList = materialItems.filter((item: any) => getMediaType(item.filePath) === "video");
      const audioList = materialItems.filter((item: any) => getMediaType(item.filePath) === "audio");
      const imageList = materialItems.filter((item: any) => getMediaType(item.filePath) === "image");
      initialVideoItems.value = storyboardVideos.flatMap((item: any, index: number) => {
        if (Array.isArray(item.video)) {
          return item.video.map((subItem: any, subIndex: number) => ({
            id: `video-${subItem.id}`,
            type: "video",
            name: "#" + $t("workbench.production.wb.storyboardVideoName", { storyboard: index + 1, id: subIndex + 1 }),
            duration: subItem.duration || 0,
            icon: "🎬",
            color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            url: subItem.filePath,
            selected: item.videoId == subItem.id ? true : false,
          }));
        }
      });
      mockMediaItems.value = videoList.map((item: any) => ({
        id: `video-${item.id}`,
        type: "video",
        name: item.name,
        duration: item.duration || 0,
        icon: "🎥",
        color: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        url: item.filePath,
        loading: true,
      }));
      mockAudioItems.value = audioList.map((item: any) => ({
        id: `audio-${item.id}`,
        type: "audio",
        name: item.name,
        duration: item.duration || 0,
        url: item.filePath,
        loading: true,
      }));
      mockImageItems.value = imageList.map((item: any) => ({
        id: `image-${item.id}`,
        type: "image",
        name: item.name,
        duration: item.duration || 5,
        icon: "🖼️",
        color: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
        url: item.filePath,
        loading: true,
      }));
    });
}

function createDemoTracks(): Track[] {
  const createTrack = (type: Track["type"], name: string, order: number, isMain: boolean = false): Track => ({
    id: generateId("track-"),
    type,
    name,
    visible: true,
    locked: false,
    clips: [],
    order,
    ...(isMain && { isMain }),
  });
  return [
    createTrack("video", "主轨道", 0, true),
    createTrack("audio", "音频", 2),
    createTrack("subtitle", "字幕", 3),
    createTrack("filter", "滤镜", 4),
  ];
}

const mockTracks = createDemoTracks();

//导入到剪辑台
function handleBatchDownload(value: ImportVideoItem[]) {}
</script>

<style lang="scss" scoped>
.videoProductionWorkbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.videoProductionWorkbench {
  .importLoadingMask {
    position: absolute;
    inset: 0;
    background: var(--td-mask-active);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
    .importLoadingContent {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
  }
  .topMenu {
    width: 100%;
    min-height: 38px;
    justify-content: space-between;
    padding: 0 0 4px;
    margin-top: 0;
    .workbenchActions {
      display: flex;
      align-items: center;
      min-width: 0;
    }
    .item {
      margin-right: 4px;
      cursor: pointer;
      width: 38px;
      height: 38px;
      .icon {
        font-size: 20px;
      }
      .title {
        font-size: 10px;
        white-space: nowrap;
      }
      &:hover {
        background-color: var(--td-bg-color-container-hover);
        border-radius: 10px;
      }
    }
    .active {
      background-color: var(--td-brand-color) !important;
      border-radius: 10px;
      color: #fff;
    }
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .editImage {
    width: 100%;
    height: 75vh;
  }
}
</style>
