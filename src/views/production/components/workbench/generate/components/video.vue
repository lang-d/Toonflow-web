<template>
  <t-card :title="'#' + (activeTrackIndex + 1) + $t('workbench.generate.videoMenu')" header-bordered style="height: 100%">
    <template #actions>
      <t-button size="small" :loading="generating" @click="emit('generate')">{{ $t("workbench.generate.generate") }}</t-button>
    </template>

    <div class="history">
      <div class="titleBox f ac">
        <i-time />
        <span class="title">{{ $t("workbench.generate.history") }}（{{ currentTrack?.videoList.length || 0 }}）</span>
      </div>

      <div class="historyItemBox">
        <div
          v-for="v in currentTrack?.videoList"
          :key="v.id"
          class="historyItem"
          :class="{ active: v.id === selectVideoId, generating: isVideoGenerating(v), failed: isVideoFailed(v) }"
          @click="previewVideo(v)">
          <template v-if="videoCoverMap[v.src]">
            <img :src="videoCoverMap[v.src]" class="videoCover" />
          </template>
          <template v-else-if="!isVideoGenerating(v) && v.src">
            <video
              :key="v.src"
              :src="v.src"
              preload="metadata"
              muted
              @loadedmetadata="handlePreviewMetadata"
              @seeked="(event) => handlePreviewSeeked(event, v.src)" />
          </template>

          <div v-if="isVideoGenerating(v)" class="loadingOverlay c fc">
            <t-loading size="24px" />
            <span class="loadingText">{{ $t("workbench.generate.generating") }}</span>
            <t-button v-if="isVideoQueued(v)" size="small" variant="base" @click.stop="cancelQueuedVideo(v)">取消排队</t-button>
          </div>

          <t-tooltip v-if="isVideoFailed(v)" placement="top" :content="v?.errorReason || ''" theme="light">
            <t-tag class="stateTag" theme="danger" size="small">
              {{ $t("workbench.generate.generateFailed") }}
            </t-tag>
          </t-tooltip>

          <div v-if="canUseVideo(v)" class="selectBtn" @click.stop="selectVideo(v)">
            <i-check size="16" />
          </div>
          <div class="delBtn" @click.stop="handleDeleteVideo(v)">
            <i-delete size="16" />
          </div>
          <div v-if="canUseVideo(v)" class="download" @click.stop="downloadVideo(v)">
            <i-to-bottom size="16" />
          </div>
          <div v-if="canUseVideo(v)" class="playBtn" @click.stop="openVideoPlayer(v)">
            <i-play size="16" />
          </div>
        </div>
      </div>
    </div>
  </t-card>

  <t-dialog
    v-model:visible="videoPlayerVisible"
    :header="$t('workbench.generate.previewVideo')"
    :footer="false"
    width="800px"
    destroy-on-close
    @close="handlePlayerClose">
    <div class="videoPlayerBox">
      <video
        v-if="playingVideoSrc"
        ref="videoPlayerRef"
        :src="playingVideoSrc"
        playsinline
        preload="metadata"
        class="videoPlayer"
        @loadedmetadata="handlePlayerLoadedMetadata"
        @timeupdate="handlePlayerTimeUpdate"
        @play="handlePlayerPlay"
        @pause="handlePlayerPause"
        @ended="handlePlayerEnded"
        @waiting="playerLoading = true"
        @playing="handlePlayerPlaying"
        @error="handlePlayerError" />

      <div class="videoPlayerControls">
        <t-button
          class="playerControlButton"
          theme="default"
          variant="text"
          shape="circle"
          :disabled="Boolean(playerError) || !playingVideoSrc"
          :aria-label="playerPlaying ? '暂停视频' : '播放视频'"
          @click="toggleVideoPlayer">
          <i-pause v-if="playerPlaying" size="18" />
          <i-play v-else size="18" />
        </t-button>

        <input
          class="playerProgress"
          type="range"
          min="0"
          :max="playerDuration || 0"
          :value="playerCurrentTime"
          step="0.01"
          :disabled="Boolean(playerError) || playerDuration <= 0"
          aria-label="视频播放进度"
          @input="seekVideoPlayer" />

        <span class="playerTime">{{ formatPlayerTime(playerCurrentTime) }} / {{ formatPlayerTime(playerDuration) }}</span>
      </div>

      <div v-if="playerStatusText" class="videoPlayerFeedback" :class="{ error: playerError }">
        <t-loading v-if="playerLoading" size="16px" />
        <span>{{ playerStatusText }}</span>
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus } from "@/stores/taskCenter";

defineProps<{
  activeTrackIndex: number;
  generating?: boolean;
}>();

const currentTrack = defineModel<TrackItem>("currentTrack", {
  default: () => {},
});

const emit = defineEmits<{
  generate: [];
  refresh: [];
}>();

const { project } = storeToRefs(projectStore());
const episodesId = inject<Ref<number>>("episodesId")!;
const taskCenter = useTaskCenterStore();

const selectVideoId = ref<number>();
const videoCoverMap = ref<Record<string, string>>({});
const videoPlayerVisible = ref(false);
const playingVideoSrc = ref<string>();
const videoPlayerRef = ref<HTMLVideoElement>();
const playerDuration = ref(0);
const playerCurrentTime = ref(0);
const playerPlaying = ref(false);
const playerLoading = ref(false);
const playerError = ref("");
const playerAutoplayBlocked = ref(false);
const downloadingSet = new Set<string>();

const playerStatusText = computed(() => {
  if (playerError.value) return playerError.value;
  if (playerLoading.value) return "正在加载视频…";
  if (playerAutoplayBlocked.value) return "自动播放受限，请点击播放";
  return "";
});

function getVideoStatus(video: VideoItem) {
  return normalizeTaskStatus(video.status ?? video.state, "pending");
}

function isVideoQueued(video: VideoItem) {
  return getVideoStatus(video) === "queued";
}

function isVideoGenerating(video: VideoItem) {
  return ["queued", "submitting", "processing"].includes(getVideoStatus(video));
}

function isVideoFailed(video: VideoItem) {
  return ["failed", "cancelled"].includes(getVideoStatus(video));
}

function canUseVideo(video: VideoItem) {
  return !isVideoGenerating(video) && !isVideoFailed(video) && Boolean(video.src);
}

async function selectVideo(video: VideoItem) {
  if (!canUseVideo(video)) return;
  try {
    await axios.post("/production/workbench/selectVideo", {
      projectId: project.value?.id,
      scriptId: episodesId.value ?? 0,
      videoId: video.id,
      trackId: currentTrack.value.id,
    });
    window.$message.success($t("workbench.generate.selectVideoSuccess"));
    emit("refresh");
  } catch {
    window.$message.error($t("workbench.generate.selectVideoFailed"));
  }
}

async function cancelQueuedVideo(video: VideoItem) {
  if (!video.taskId) return window.$message.warning("缺少任务 ID，无法取消排队");
  try {
    await taskCenter.cancelTask(createTaskKey("video", Number(project.value?.id), video.id, undefined, video.taskId));
    video.status = "cancelled";
    video.state = "生成失败";
    video.errorReason = "已取消排队";
    window.$message.success("已取消本地排队");
  } catch (error: any) {
    window.$message.warning(error?.message || "当前任务无法取消");
  }
}

function handleDeleteVideo(video: VideoItem) {
  const dlg = DialogPlugin.confirm({
    header: $t("workbench.generate.del"),
    body: $t("workbench.generate.delVideo"),
    onConfirm: () => {
      axios.post("/production/workbench/delVideo", { id: video.id }).then(() => {
        window.$message.success($t("workbench.generate.delSuccess"));
        emit("refresh");
        dlg.destroy();
      });
    },
    onCancel: () => dlg.destroy(),
  });
}

async function downloadVideo(video: VideoItem) {
  if (!video?.src) return;
  if (downloadingSet.has(video.src)) {
    window.$message.info("下载进行中，请稍候");
    return;
  }
  downloadingSet.add(video.src);
  try {
    const response = await fetch(video.src);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `视频_${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    console.error(error);
    window.$message.error("下载失败");
  } finally {
    downloadingSet.delete(video.src);
  }
}

function captureVideoCover(src: string) {
  if (!src || videoCoverMap.value[src]) return;
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.src = src;
  video.addEventListener(
    "seeked",
    () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 160;
        canvas.height = video.videoHeight || 90;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          videoCoverMap.value[src] = canvas.toDataURL("image/jpeg", 0.7);
        }
      } catch {}
      video.src = "";
    },
    { once: true },
  );
  video.addEventListener("loadeddata", () => (video.currentTime = 0.5), { once: true });
  video.addEventListener("error", () => (video.src = ""), { once: true });
  video.load();
}

function handlePreviewMetadata(event: Event) {
  (event.target as HTMLVideoElement).currentTime = 0.5;
}

function handlePreviewSeeked(event: Event, src: string) {
  const el = event.target as HTMLVideoElement;
  captureVideoCover(src);
  el.style.display = "none";
}

function formatPlayerTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainderSeconds = totalSeconds % 60;
  const minutePart = String(minutes).padStart(2, "0");
  const secondPart = String(remainderSeconds).padStart(2, "0");
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${minutePart}:${secondPart}` : `${minutePart}:${secondPart}`;
}

function resetVideoPlayer() {
  videoPlayerRef.value?.pause();
  playerDuration.value = 0;
  playerCurrentTime.value = 0;
  playerPlaying.value = false;
  playerLoading.value = false;
  playerError.value = "";
  playerAutoplayBlocked.value = false;
}

async function startVideoPlayer(isAutoplay = false) {
  const player = videoPlayerRef.value;
  if (!player || playerError.value) return;
  playerAutoplayBlocked.value = false;
  try {
    if (player.ended) player.currentTime = 0;
    await player.play();
  } catch (error) {
    console.warn("Video preview playback was blocked", error);
    playerPlaying.value = false;
    playerLoading.value = false;
    if (isAutoplay) {
      playerAutoplayBlocked.value = true;
    } else {
      playerError.value = "无法开始播放，请检查视频地址或格式";
    }
  }
}

function toggleVideoPlayer() {
  const player = videoPlayerRef.value;
  if (!player || playerError.value) return;
  if (player.paused) {
    void startVideoPlayer();
  } else {
    player.pause();
  }
}

function seekVideoPlayer(event: Event) {
  const nextTime = Number((event.target as HTMLInputElement).value);
  const player = videoPlayerRef.value;
  if (!player || !Number.isFinite(nextTime)) return;
  player.currentTime = nextTime;
  playerCurrentTime.value = nextTime;
}

function handlePlayerLoadedMetadata(event: Event) {
  const player = event.target as HTMLVideoElement;
  playerDuration.value = Number.isFinite(player.duration) ? player.duration : 0;
  playerCurrentTime.value = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  playerLoading.value = false;
}

function handlePlayerTimeUpdate(event: Event) {
  const player = event.target as HTMLVideoElement;
  playerCurrentTime.value = Number.isFinite(player.currentTime) ? player.currentTime : 0;
}

function handlePlayerPlay() {
  playerPlaying.value = true;
  playerLoading.value = false;
  playerAutoplayBlocked.value = false;
}

function handlePlayerPause() {
  playerPlaying.value = false;
}

function handlePlayerEnded() {
  playerPlaying.value = false;
  playerCurrentTime.value = playerDuration.value;
}

function handlePlayerPlaying() {
  playerPlaying.value = true;
  playerLoading.value = false;
  playerAutoplayBlocked.value = false;
}

function handlePlayerError() {
  playerLoading.value = false;
  playerPlaying.value = false;
  playerError.value = "视频加载失败，请检查视频地址或格式";
}

async function openVideoPlayer(video: VideoItem) {
  if (!video.src) return;
  resetVideoPlayer();
  playingVideoSrc.value = video.src;
  videoPlayerVisible.value = true;
  playerLoading.value = true;
  await nextTick();
  void startVideoPlayer(true);
}

function handlePlayerClose() {
  resetVideoPlayer();
  playingVideoSrc.value = undefined;
}

function previewVideo(video: VideoItem) {
  if (!canUseVideo(video)) return;
}

watch(
  () => currentTrack.value?.videoList?.map((video) => video.src).filter(Boolean),
  (sources) => sources?.forEach((src) => captureVideoCover(src)),
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.history {
  height: 100%;
  .titleBox {
    gap: 6px;
    margin-bottom: 8px;
    .title {
      font-size: 13px;
      color: var(--td-text-color-secondary);
    }
  }
  .historyItemBox {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
    height: 100%;
    .historyItem {
      position: relative;
      width: 130px;
      height: 90px;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;
      background: var(--td-bg-color-secondarycontainer);
      &.active {
        border-color: var(--td-brand-color);
      }
      &.generating,
      &.failed {
        cursor: default;
      }
      .videoCover,
      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .loadingOverlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        gap: 4px;
        .loadingText {
          font-size: 11px;
          color: #fff;
        }
      }
      .stateTag {
        position: absolute;
        bottom: 4px;
        left: 4px;
      }
      .selectBtn,
      .delBtn,
      .download,
      .playBtn {
        position: absolute;
        display: none;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        cursor: pointer;
      }
      .selectBtn {
        bottom: 4px;
        right: 4px;
      }
      .delBtn {
        top: 4px;
        right: 4px;
      }
      .download {
        bottom: 4px;
        left: 4px;
      }
      .playBtn {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.55);
      }
      &:hover {
        .selectBtn,
        .delBtn,
        .download,
        .playBtn {
          display: flex;
        }
      }
    }
  }
}

.videoPlayerBox {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  width: 100%;
  .videoPlayer {
    display: block;
    width: 100%;
    max-height: 450px;
    outline: none;
  }
  .videoPlayerControls {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 48px;
    padding: 8px 12px;
    box-sizing: border-box;
    color: #fff;
    background: #161b22;
  }
  .playerControlButton {
    flex: 0 0 auto;
    color: #fff;
    &:not(:disabled):hover {
      color: var(--td-brand-color);
      background: rgba(255, 255, 255, 0.12);
    }
  }
  .playerProgress {
    flex: 1;
    min-width: 0;
    height: 4px;
    margin: 0;
    accent-color: var(--td-brand-color);
    cursor: pointer;
    &:disabled {
      cursor: not-allowed;
    }
  }
  .playerTime {
    flex: 0 0 auto;
    min-width: 86px;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.82);
    text-align: right;
    white-space: nowrap;
  }
  .videoPlayerFeedback {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px 8px;
    box-sizing: border-box;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.78);
    background: #161b22;
    &.error {
      color: var(--td-error-color);
    }
  }
}

:deep(.t-card__body) {
  overflow: auto;
  height: calc(100% - 48px);
}
</style>
