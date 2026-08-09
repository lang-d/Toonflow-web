<template>
  <div class="index fc">
    <div class="referenceImage">
      <div class="referenceToolbar f ac jb">
        <div class="referenceActions f ac">
          <t-button size="small" variant="outline" :loading="cacheRefreshing" @click="confirmRefreshReferenceCache">刷新缓存</t-button>
          <t-button size="small" variant="outline" :loading="mergeLoading === 'storyboard'" :disabled="!canMergeStoryboard" @click="mergeReferences('storyboard')">
            合并分镜图
          </t-button>
          <t-button size="small" variant="outline" :loading="mergeLoading === 'assets'" :disabled="!canMergeAssets" @click="mergeReferences('assets')">
            合并图片资产
          </t-button>
        </div>
        <span class="referenceHint">拖动引用可调整生成顺序</span>
      </div>
      <div class="uploadBtn">
        <imageSelect
          :mode="modelParmas.mode as VideoMode"
          v-model="imageList"
          :storyboard-list="storyboardList"
          @preview-audio="openReferenceAudioPreview"
          @restore-references="restoreCurrentTrackReferences" />
      </div>
    </div>
    <AudioClipDialog
      v-model:visible="referenceAudioPreviewVisible"
      title="截取音频片段"
      :src="activeReferenceAudioUrl"
      :name="activeReferenceAudio?.name || activeReferenceAudio?.parentName"
      mode="clip"
      save-label="截取并作为引用"
      @save="saveReferenceAudioClip" />
    <div class="modelSelect">
      <modeMenu
        v-model="modelParmas"
        :modeOptions="modeOptions"
        :modeList="modeList"
        :video-prompt-type-capability="videoPromptTypeCapability"
        :video-prompt-type="videoPromptType"
        @modeChange="modeChange"
        @resolutionChange="changeResolution"
        @durationChange="changeCurrentTrackDuration"
        @audioChange="changeAudio"
        @videoPromptTypeChange="changeVideoPromptType" />
    </div>
    <div class="globalPromptAffix">
      <t-input v-model="promptPrefix" size="small" placeholder="前置提示词" clearable />
      <t-input v-model="promptSuffix" size="small" placeholder="后置提示词" clearable />
    </div>
    <div v-if="currentTrack" class="trackContextSummary">
      <div class="trackGroupInfo">
        <strong>{{ currentTrack.groupName || `Track ${activeTrackIndex + 1}` }}</strong>
        <span v-if="currentTrack.groupIntent">{{ currentTrack.groupIntent }}</span>
      </div>
      <div class="trackContextTags">
        <t-tag size="small" theme="primary" variant="light">
          分镜 {{ currentTrackStoryboardCount }}
        </t-tag>
        <t-tag size="small" variant="light">
          时长 {{ currentTrackStoryboardDuration }}s
        </t-tag>
        <t-tag size="small" variant="light">
          引用 {{ currentReferenceCount }}
        </t-tag>
        <t-tag v-if="hasUnreadyStoryboardForCurrentTrack" size="small" theme="warning" variant="light">
          分镜事实待补齐
        </t-tag>
        <t-tag v-if="currentTrack.videoPromptStale" size="small" theme="warning" variant="light">
          {{ $t("workbench.production.node.storyboard.videoPromptStale") }}
        </t-tag>
        <t-tag v-if="currentTrack.sourceTracked === false" size="small" variant="light">
          {{ $t("workbench.production.node.storyboard.sourceUntracked") }}
        </t-tag>
        <t-button size="small" variant="outline" @click="trackContextVisible = true">分镜与剧本</t-button>
      </div>
    </div>
    <t-alert
      v-if="hasUnreadyStoryboardForCurrentTrack"
      class="storyboardFactGate"
      theme="warning"
      message="请先补齐结构化分镜事实后再生成视频。" />
    <div class="generate ac">
      <div class="prompt" v-if="currentTrack">
        <t-card :title="'#' + (activeTrackIndex + 1) + $t('workbench.generate.generateText')" header-bordered class="videoPrompt">
          <template #actions>
            <t-button size="small" class="genTextbtn" :loading="currentTrack.state == '生成中'" :disabled="hasUnreadyStoryboardForCurrentTrack" @click="genText">
              {{ $t("workbench.generate.generateText") }}
            </t-button>
          </template>
          <div class="promptData fc">
            <t-alert
              v-if="currentTrack.videoPromptStale"
              theme="warning"
              :message="$t('workbench.production.node.storyboard.videoPromptStaleHint')">
              <template #operation>
                <t-button size="small" variant="text" @click="genText">
                  {{ $t("workbench.production.node.storyboard.recompile") }}
                </t-button>
              </template>
            </t-alert>
            <div class="promptInput" @focusout="handlePromptBlur">
              <promptEditor v-model="currentTrack.prompt" :references="references" :placeholder="$t('workbench.generate.promptPlaceholder')" />
            </div>
          </div>
        </t-card>
      </div>
      <div class="video">
        <videoCard
          v-if="currentTrack"
          :active-track-index="activeTrackIndex"
          :script-id="scriptId"
          v-model:current-track="currentTrack"
          @refresh="getGenerateData"
          @generate="generateVideo" />
      </div>
    </div>
    <TrackContextDrawer
      v-model:visible="trackContextVisible"
      @visible-change="emit('track-context-visible-change', $event)"
      :project-id="Number(project?.id) || undefined"
      :script-id="scriptId"
      :track="currentTrack"
      :storyboards="currentTrackStoryboards" />
    <div class="track">
      <newTrack
        v-model:activeTrackIndex="activeTrackIndex"
        v-model="trackList"
        :image-list="imageList"
        @change="trackChange"
        :modelParmas="modelParmas"
        :script-id="scriptId"
        :supported-durations="supportedDurations"
        :prompt-prefix="promptPrefix"
        :prompt-suffix="promptSuffix"
        :video-prompt-type="videoPromptType"
        :add-track-loading="addTrackLoading"
        @addTrack="addManualTrack"
        @video-task-submitted="registerSubmittedVideoTask"
        @prompt-task-submitted="registerSubmittedPromptTask"
        @getData="getGenerateData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import newTrack from "./components/track.vue";
import imageSelect from "./components/imageSelect.vue";
import modeMenu from "./components/modeMenu.vue";
import videoCard from "./components/video.vue";
import TrackContextDrawer from "./components/TrackContextDrawer.vue";
import "@/views/production/components/workbench/type/type";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import promptEditor from "@/components/promptEditor.vue";
import AudioClipDialog from "@/components/AudioClipDialog.vue";
import imageListCacheStore from "@/stores/imageListCache";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { attachLegacyMediaFields, getMediaOriginalUrl, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import { deriveReferenceTokens, getDerivedReferenceToken } from "./referenceTokens";
import { getReviewMessage } from "@/utils/productionReview";
import type { TaskStatus } from "@/types/api";
import { buildVideoReferencePayload, getSupportedDurations, getSupportedResolutions, isSupportedDuration } from "./videoGenerationCapabilities";

const { project } = storeToRefs(projectStore());
const emit = defineEmits<{
  "track-context-visible-change": [visible: boolean];
}>();
const props = defineProps<{
  scriptId: number;
  refreshToken?: number;
}>();
const activeTrackIndex = ref(0);
const cacheStore = imageListCacheStore();
const taskCenter = useTaskCenterStore();
const { getCache, getCacheWithResolve, setCache, removeCache, initCacheFromTrackList, forceInitCacheFromTrackList, warmUpUrls, clearUrlMap } = cacheStore;
const { urlMap } = storeToRefs(cacheStore);
const cacheRefreshing = ref(false);
const mergeLoading = ref<"" | "storyboard" | "assets">("");
const addTrackLoading = ref(false);
const referenceAudioPreviewVisible = ref(false);
const activeReferenceAudio = ref<UploadItem | null>(null);
const trackContextVisible = ref(false);
const promptPrefix = ref("");
const promptSuffix = ref("");
const restoredLastTrack = ref(false);
const promptResultRefreshing = new Set<number>();
const videoResultRefreshing = new Set<number>();
const videoTerminalReconcileTimers = new Map<number, ReturnType<typeof setTimeout>>();
const reportedFailures = new Set<string>();
const cacheWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();
let promptAffixWriteTimer: ReturnType<typeof setTimeout> | null = null;
let releaseVideoTaskSubscription: (() => void) | null = null;
let modelDetailRequestId = 0;
let savingVideoPromptType = false;
const videoPromptTypeSaveQueue: Array<{ projectId: number; model: string; value: string | null }> = [];

const videoPromptTypeCapability = ref<VideoPromptTypeCapability | null>(null);
const videoPromptType = ref<string | null>(null);
const confirmedVideoPromptTypes = new Map<string, string | null>();

const modeOptions = ref<VideoModel>({
  name: "",
  modelName: "",
  durationResolutionMap: [],
  audio: false,
  type: "video",
  mode: [],
}); // 当前模型配置

const trackList = ref<TrackItem[]>([]); // 轨道列表
const pendingManualTracks = ref<TrackItem[]>([]);

const modelParmas = ref<ModelSetting>({
  mode: "",
  model: "",
  resolution: "480p",
  duration: 8,
  // Optional-audio video models should generate audio unless the user turns it off.
  audio: true,
});

const storyboardList = ref<StoryboardItem[]>([]); // 分镜列表
const STRUCTURED_FACT_REQUIRED_MESSAGE = "请先补齐结构化分镜事实后再生成视频。";

/** 当前剧集维度的本地操作状态 */
function getScriptStorageKey(name: string) {
  return `workbench:generate:${project.value?.id ?? "unknown"}:${props.scriptId || "unknown"}:${name}`;
}

function loadPromptAffixes() {
  promptPrefix.value = localStorage.getItem(getScriptStorageKey("promptPrefix")) || "";
  promptSuffix.value = localStorage.getItem(getScriptStorageKey("promptSuffix")) || "";
}

function composePrompt(prompt?: string) {
  return [promptPrefix.value, prompt, promptSuffix.value].map((item) => item?.trim()).filter(Boolean).join("\n\n");
}

function restoreLastTrack() {
  if (restoredLastTrack.value) return;
  restoredLastTrack.value = true;
  const lastTrackId = Number(localStorage.getItem(getScriptStorageKey("lastTrackId")));
  if (!Number.isFinite(lastTrackId)) return;
  const index = trackList.value.findIndex((track) => Number(track.id) === lastTrackId);
  if (index >= 0) activeTrackIndex.value = index;
}

function rememberCurrentTrack(trackId?: number | string | null) {
  if (trackId == null) return;
  localStorage.setItem(getScriptStorageKey("lastTrackId"), String(trackId));
}

const imageList = computed({
  get(): UploadItem[] {
    // 触发对 urlMap 的依赖追踪，当 warmUpUrls 更新 urlMap 后自动重新计算
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    urlMap.value;
    const trackId = currentTrack.value?.id;
    const pid = project.value?.id;
    const sid = props.scriptId;
    const medias = currentTrack.value?.medias;
    if (medias?.length) return medias as UploadItem[];
    // 后端数据尚未装载到当前轨道时再从缓存恢复
    if (pid != null && sid != null && trackId != null) {
      const cached = getCache(pid, sid, trackId);

      if (cached !== undefined) {
        return cached;
      }
    }
    return [];
  },
  set(val: UploadItem[]) {
    if (currentTrack.value) {
      currentTrack.value.medias = val as any;
      // 同步写入缓存
      const pid = project.value?.id;
      const sid = props.scriptId;
      const trackId = currentTrack.value.id;
      if (pid != null && sid != null && trackId != null) {
        persistCurrentTrackReferences();
      }
    }
  },
});

function modeChange(newVal: string, automatic = false) {
  if (newVal == modelParmas.value.mode) return;
  if (!newVal) return;
  persistCurrentTrackReferences();
  modelParmas.value.mode = newVal;
  if (automatic) {
    window.$message?.info?.("已切换为新模型支持的生成模式，提示词和引用已保留。");
  }
}

function changeResolution(resolution: string) {
  if (!resolution || resolution === modelParmas.value.resolution) return;
  persistCurrentTrackReferences();
  modelParmas.value.resolution = resolution;
}

async function changeCurrentTrackDuration(duration: number) {
  const track = currentTrack.value;
  if (!track?.id || !isSupportedDuration(modeOptions.value, modelParmas.value.resolution, duration)) return;
  const previousDuration = Number(track.duration || modelParmas.value.duration);
  modelParmas.value.duration = duration;
  track.duration = duration;
  try {
    await axios.post("/production/workbench/updateVideoDuration", { id: track.id, duration });
  } catch (error: any) {
    modelParmas.value.duration = previousDuration;
    track.duration = previousDuration;
    window.$message.error(error?.message || "保存视频时长失败");
  }
}

function changeAudio(audio: boolean) {
  if (modeOptions.value.audio !== "optional") return;
  modelParmas.value.audio = audio;
}

function normalizeVideoPromptTypeCapability(value: unknown): VideoPromptTypeCapability | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as VideoPromptTypeCapability).options)) return null;
  const options = (value as VideoPromptTypeCapability).options
    .filter((item): item is VideoPromptTypeOption => !!item && typeof item.value === "string" && !!item.value && typeof item.label === "string")
    .map((item) => ({ value: item.value, label: item.label }));
  if (!options.length) return null;
  const defaultValue = typeof (value as VideoPromptTypeCapability).defaultValue === "string" ? (value as VideoPromptTypeCapability).defaultValue : undefined;
  return { options, defaultValue: options.some((item) => item.value === defaultValue) ? defaultValue : undefined };
}

function normalizeVideoPromptType(capability: VideoPromptTypeCapability | null, value: unknown) {
  if (!capability || typeof value !== "string") return null;
  return capability.options.some((item) => item.value === value) ? value : null;
}

function changeVideoPromptType(value: string | null) {
  const capability = videoPromptTypeCapability.value;
  const nextValue = value == null ? null : normalizeVideoPromptType(capability, value);
  if (value != null && nextValue == null) return;
  if (nextValue === videoPromptType.value) return;
  const projectId = Number(project.value?.id);
  const model = modelParmas.value.model;
  if (!Number.isFinite(projectId) || !model || !capability) return;

  videoPromptType.value = nextValue;
  videoPromptTypeSaveQueue.push({ projectId, model, value: nextValue });
  void flushVideoPromptTypeSave();
}

async function flushVideoPromptTypeSave() {
  if (savingVideoPromptType) return;
  savingVideoPromptType = true;
  try {
    while (videoPromptTypeSaveQueue.length) {
      const job = videoPromptTypeSaveQueue.shift();
      if (!job) continue;
      try {
        const { data } = await axios.post("/project/updateVideoPromptTypeSelection", {
          projectId: job.projectId,
          model: job.model,
          videoPromptType: job.value,
        });
        const persisted = normalizeVideoPromptType(videoPromptTypeCapability.value, data?.selectedVideoPromptType);
        const savedValue = data?.selectedVideoPromptType === null ? null : persisted ?? job.value;
        confirmedVideoPromptTypes.set(job.model, savedValue);
        if (modelParmas.value.model === job.model && videoPromptType.value === job.value) videoPromptType.value = savedValue;
      } catch (error: any) {
        const failedModel = job.model;
        const failedValue = job.value;
        const superseded = videoPromptTypeSaveQueue.some((queuedJob) => queuedJob.model === failedModel);
        if (!superseded && modelParmas.value.model === failedModel && videoPromptType.value === failedValue) {
          videoPromptType.value = confirmedVideoPromptTypes.get(failedModel) ?? null;
          window.$message.error(error?.message || "保存视频类型失败");
        }
      }
    }
  } finally {
    savingVideoPromptType = false;
    if (videoPromptTypeSaveQueue.length) void flushVideoPromptTypeSave();
  }
}
const modeList = computed(() => {
  const modeLabelMap: Record<string, string> = {
    singleImage: "单图",
    startEndRequired: "首尾帧",
    endFrameOptional: "尾帧可选",
    startFrameOptional: "首帧可选",
    text: "文本生视频",
    videoReference: "视频",
    imageReference: "图片",
    audioReference: "音频",
    textReference: "文本",
  };
  function parseRefLabel(m: string): string {
    const match = m.match(/^(videoReference|imageReference|audioReference|textReference):(\d+)$/);
    if (match) {
      const base = modeLabelMap[match[1]] || match[1];
      return `${base} ×${match[2]}`;
    }
    return modeLabelMap[m] || m;
  }
  return modeOptions.value.mode
    ? modeOptions.value.mode.map((mode) =>
        Array.isArray(mode)
          ? { value: JSON.stringify(mode), label: mode.map((m) => parseRefLabel(m)).join(" + ") + "参考" }
          : { value: mode, label: modeLabelMap[mode] || mode },
      )
    : [];
});
const currentTrack = computed({
  get() {
    return trackList.value[activeTrackIndex.value];
  },
  set(val) {
    trackList.value[activeTrackIndex.value] = val;
  },
});
const currentTrackStoryboardCount = computed(() => {
  const trackId = currentTrack.value?.id;
  if (trackId == null) return 0;
  const matched = storyboardList.value.filter((item) => Number(item.trackId) === Number(trackId));
  if (matched.length) return matched.length;
  return imageList.value.filter((item) => item.sources === "storyboard").length;
});
const currentTrackStoryboardDuration = computed(() => {
  const trackId = currentTrack.value?.id;
  if (trackId == null) return 0;
  const matched = storyboardList.value.filter((item) => Number(item.trackId) === Number(trackId));
  return matched.reduce((total, item) => total + Number(item.duration || 0), 0);
});
const currentReferenceCount = computed(() => imageList.value.filter((item) => item.id != null).length);
const currentTrackStoryboards = computed(() => {
  const trackId = currentTrack.value?.id;
  const byId = new Map(storyboardList.value.map((item) => [Number(item.id), item]));
  const matched = trackId == null ? [] : storyboardList.value.filter((item) => Number(item.trackId) === Number(trackId));
  const referenced = imageList.value
    .filter((item) => item.sources === "storyboard" && item.id != null)
    .map((item) => byId.get(Number(item.id)))
    .filter((item): item is StoryboardItem => Boolean(item));
  return Array.from(new Map([...matched, ...referenced].map((item) => [Number(item.id), item])).values());
});
const hasUnreadyStoryboardForCurrentTrack = computed(() =>
  currentTrackStoryboards.value.some((item) => item.factStatus !== "ready"),
);

function ensureCurrentTrackStoryboardReady() {
  if (!hasUnreadyStoryboardForCurrentTrack.value) return true;
  window.$message.warning(STRUCTURED_FACT_REQUIRED_MESSAGE);
  return false;
}

/** 将时长限制在模型支持的范围内 */
watch(
  () => [project.value?.id, props.scriptId, props.refreshToken],
  ([, scriptId], previous) => {
    const previousScriptId = previous?.[1];
    restoredLastTrack.value = false;
    loadPromptAffixes();
    if (!scriptId) {
      trackList.value = [];
      storyboardList.value = [];
      return;
    }
    if (scriptId !== previousScriptId) {
      trackContextVisible.value = false;
      releaseVideoTaskSubscription?.();
      releaseVideoTaskSubscription = null;
      pendingManualTracks.value = [];
      trackList.value = [];
      storyboardList.value = [];
      activeTrackIndex.value = 0;
    }
    void getGenerateData();
  },
  { immediate: true },
);

watch(
  () => currentTrack.value?.id,
  (trackId) => rememberCurrentTrack(trackId),
);

watch([promptPrefix, promptSuffix], schedulePromptAffixWrite);

function runWhenIdle(callback: () => void) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 1_000 });
  } else {
    setTimeout(callback, 0);
  }
}

function schedulePromptAffixWrite() {
  if (promptAffixWriteTimer) clearTimeout(promptAffixWriteTimer);
  promptAffixWriteTimer = setTimeout(() => {
    runWhenIdle(() => {
      localStorage.setItem(getScriptStorageKey("promptPrefix"), promptPrefix.value);
      localStorage.setItem(getScriptStorageKey("promptSuffix"), promptSuffix.value);
    });
  }, 500);
}

function scheduleCacheWrite(projectId: string | number, scriptId: string | number, trackId: string | number, medias: UploadItem[]) {
  const key = `${projectId}:${scriptId}:${trackId}`;
  const currentTimer = cacheWriteTimers.get(key);
  if (currentTimer) clearTimeout(currentTimer);
  const snapshot = medias.slice();
  cacheWriteTimers.set(
    key,
    setTimeout(() => {
      cacheWriteTimers.delete(key);
      runWhenIdle(() => setCache(projectId, scriptId, trackId, snapshot));
    }, 500),
  );
}

const supportedDurations = computed(() => getSupportedDurations(modeOptions.value, modelParmas.value.resolution));

function isCurrentDurationSupported(duration = modelParmas.value.duration) {
  return isSupportedDuration(modeOptions.value, modelParmas.value.resolution, duration);
}

function persistTrackReferences(track?: TrackItem) {
  const pid = project.value?.id;
  const sid = props.scriptId;
  if (pid == null || sid == null || track?.id == null) return;
  const key = `${pid}:${sid}:${track.id}`;
  const pending = cacheWriteTimers.get(key);
  if (pending) {
    clearTimeout(pending);
    cacheWriteTimers.delete(key);
  }
  setCache(pid, sid, track.id, track.medias as unknown as UploadItem[]);
}

function persistCurrentTrackReferences() {
  persistTrackReferences(currentTrack.value);
}

function normalizeTrackItem(track: TrackItem): TrackItem {
  return {
    ...track,
    status: normalizeTaskStatus((track as any).status ?? track.state, "pending"),
    medias: (track.medias ?? []).map((media: TrackMedia) => attachLegacyMediaFields(media as any, normalizeMediaRef((media as any).media ?? media, media.fileType))),
    videoList: (track.videoList ?? []).map((video: VideoItem) => ({
      ...attachLegacyMediaFields(video as any, normalizeMediaRef((video as any).media ?? video, "video")),
      status: normalizeTaskStatus((video as any).status ?? video.state, "pending"),
    })),
  };
}

function unwrapApiData(response: any) {
  return response?.data?.data ?? response?.data ?? response;
}

function upsertTrackItem(track: TrackItem) {
  const normalizedTrack = normalizeTrackItem(track);
  const existingIndex = trackList.value.findIndex((item) => Number(item.id) === Number(normalizedTrack.id));
  if (existingIndex >= 0) {
    trackList.value[existingIndex] = normalizedTrack;
    return existingIndex;
  }
  trackList.value = [...trackList.value, normalizedTrack];
  return trackList.value.length - 1;
}

function rememberPendingManualTrack(track: TrackItem) {
  const normalizedTrack = normalizeTrackItem(track);
  pendingManualTracks.value = pendingManualTracks.value.filter((item) => Number(item.id) !== Number(normalizedTrack.id));
  pendingManualTracks.value.push(normalizedTrack);
}

function mergePendingManualTracks(tracks: TrackItem[]) {
  const serverIds = new Set(tracks.map((track) => Number(track.id)).filter(Number.isFinite));
  pendingManualTracks.value = pendingManualTracks.value.filter((track) => !serverIds.has(Number(track.id)));
  if (!pendingManualTracks.value.length) return tracks;
  return [...tracks, ...pendingManualTracks.value.map((track) => normalizeTrackItem(track))];
}

function getNextManualGroupName() {
  const baseName = "手动视频组";
  const pattern = /^手动视频组(?:\s+(\d+))?$/;
  const maxIndex = trackList.value.reduce((max, track) => {
    const match = String(track.groupName || "").trim().match(pattern);
    if (!match) return max;
    return Math.max(max, match[1] ? Number(match[1]) : 1);
  }, 0);
  return `${baseName} ${maxIndex + 1}`;
}

function getManualTrackDuration() {
  const rawDuration = Number(modelParmas.value.duration);
  if (Number.isFinite(rawDuration) && rawDuration > 0 && isCurrentDurationSupported(rawDuration)) return rawDuration;
  return supportedDurations.value[0] ?? 8;
}

function getAddTrackPayload(response: any) {
  return unwrapApiData(response);
}

function selectTrackById(trackId: number | string | null | undefined) {
  const numericTrackId = Number(trackId);
  if (!Number.isFinite(numericTrackId)) return false;
  const nextIndex = trackList.value.findIndex((track) => Number(track.id) === numericTrackId);
  if (nextIndex < 0) return false;
  activeTrackIndex.value = nextIndex;
  const selectedTrack = trackList.value[nextIndex];
  modelParmas.value.duration = Number(selectedTrack.duration || modelParmas.value.duration);
  rememberCurrentTrack(selectedTrack.id);
  return true;
}

function buildManualTrack(trackId: number, groupName: string, duration: number, returnedTrack?: Partial<TrackItem>): TrackItem {
  return normalizeTrackItem({
    id: trackId,
    duration,
    prompt: "",
    state: "未生成",
    reason: "",
    groupKey: `manual-${trackId}`,
    groupName,
    groupIntent: "",
    musicPlan: null,
    reviewState: "pending",
    reviewIssues: [],
    selectVideoId: null,
    medias: [],
    videoList: [],
    ...(returnedTrack ?? {}),
  } as TrackItem);
}

async function addManualTrack() {
  if (addTrackLoading.value) return;
  const current = currentTrack.value;
  const pid = project.value?.id;
  const sid = props.scriptId;
  if (pid == null || sid == null) {
    window.$message.warning("当前项目或剧集缺少 ID");
    return;
  }
  if (current?.id != null) {
    scheduleCacheWrite(pid, sid, current.id, current.medias as unknown as UploadItem[]);
  }

  addTrackLoading.value = true;
  try {
    const groupName = getNextManualGroupName();
    const duration = getManualTrackDuration();
    const response = await axios.post("/production/workbench/addTrack", {
      projectId: pid,
      scriptId: sid ?? 0,
      duration,
      groupName,
    });
    const result = getAddTrackPayload(response);
    const returnedTrack = result?.track ?? result?.videoTrack ?? result?.item;
    const trackId = Number(returnedTrack?.id ?? result?.trackId ?? result?.id ?? (typeof result === "number" ? result : undefined));
    if (!Number.isFinite(trackId)) throw new Error("新增成功，但后端未返回视频组 ID");

    const normalizedTrack = buildManualTrack(trackId, groupName, duration, returnedTrack as Partial<TrackItem> | undefined);
    rememberPendingManualTrack(normalizedTrack);
    const nextIndex = upsertTrackItem(normalizedTrack);
    if (!selectTrackById(normalizedTrack.id)) activeTrackIndex.value = nextIndex;
    window.$message.success("已新增空视频组");
    void getGenerateData({ selectTrackId: normalizedTrack.id });
  } catch (error: any) {
    window.$message.error(error?.message || "新增视频组失败");
  } finally {
    addTrackLoading.value = false;
  }
}
watch(
  () => modelParmas.value.model,
  (val) => {
    persistCurrentTrackReferences();
    const requestId = ++modelDetailRequestId;
    videoPromptTypeCapability.value = null;
    videoPromptType.value = null;
    if (!val) {
      modeOptions.value = {
        name: "",
        modelName: "",
        durationResolutionMap: [],
        audio: false,
        type: "video",
        mode: [],
      };
      return;
    }
    axios.post("/modelSelect/getModelDetail", { modelId: val, projectId: Number(project.value?.id) || undefined }).then(({ data }) => {
      if (requestId !== modelDetailRequestId || val !== modelParmas.value.model) return;
      modeOptions.value = data;
      const capability = normalizeVideoPromptTypeCapability(data?.videoPromptTypeCapability);
      videoPromptTypeCapability.value = capability;
      if (capability) {
        const selected =
          normalizeVideoPromptType(capability, data?.selectedVideoPromptType) ??
          normalizeVideoPromptType(capability, capability.defaultValue) ??
          null;
        videoPromptType.value = selected;
        confirmedVideoPromptTypes.set(val, selected);
      }
      const nextResolutions = getSupportedResolutions(data);
      if (nextResolutions.length && !nextResolutions.some((item) => item.toLowerCase() === String(modelParmas.value.resolution).toLowerCase())) {
        modelParmas.value.resolution = nextResolutions[0];
      }
      if (data.audio === true || data.audio === "true") modelParmas.value.audio = true;
      else if (data.audio === false || data.audio === "false") modelParmas.value.audio = false;

      const currentParsed = parseMode(modelParmas.value.mode);
      const modeMatched =
        currentParsed !== null &&
        data.mode.some((m: VideoMode) => {
          if (Array.isArray(m) && Array.isArray(currentParsed)) {
            return JSON.stringify(m) === JSON.stringify(currentParsed);
          }
          return m == currentParsed;
        });
      if (!modeMatched) {
        const newMode = Array.isArray(data.mode[0]) ? JSON.stringify(data.mode[0]) : data.mode[0];
        modeChange(newMode, true);
      }
    }).catch((error) => {
      if (requestId === modelDetailRequestId && val === modelParmas.value.model) {
        console.warn("[production] failed to load video model detail", error);
      }
    });
  },
);
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
function getReferenceGroup(item?: Partial<UploadItem | TrackMedia>) {
  if (!item) return "";
  if (item.name) return item.name;
  if (item.parentName) return item.parentName;
  if (item.sources === "storyboard" && typeof item.index === "number") return `P${item.index + 1}`;
  return "";
}

const references = computed(() => {
  function getFileTypeByExt(src: string | undefined): "image" | "video" | "audio" {
    const cleanSrc = src?.split(/[?#]/)[0] ?? "";
    const ext = cleanSrc.split(".").pop()?.toLowerCase() ?? "";
    if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
    return "image";
  }

  return deriveReferenceTokens(imageList.value as any[])
    .filter((item) => item.src)
    .map((item) => ({
      type: item.fileType || getFileTypeByExt(item.src),
      src: item.src ?? "",
      token: getDerivedReferenceToken(item) || undefined,
      label: getDerivedReferenceToken(item) || undefined,
      group: getReferenceGroup(item) || undefined,
    }));
});

const activeReferenceAudioUrl = computed(() => getReferenceAudioUrl(activeReferenceAudio.value));

function getReferenceAudioUrl(item?: UploadItem | null) {
  if (!item) return "";
  const media = normalizeMediaRef(item.media ?? item, "audio");
  return (media ? getMediaOriginalUrl(media) : "") || item.originalUrl || item.imageUrl || item.src || "";
}

function openReferenceAudioPreview(item: UploadItem) {
  activeReferenceAudio.value = item;
  if (!getReferenceAudioUrl(item)) {
    window.$message.warning("当前音频暂无可播放地址");
    return;
  }
  referenceAudioPreviewVisible.value = true;
}

function findActiveReferenceAudioIndex() {
  const active = activeReferenceAudio.value;
  if (!active) return -1;
  return imageList.value.findIndex((item) => item === active || (
    item.fileType === "audio" &&
    item.id === active.id &&
    item.sources === active.sources &&
    item.src === active.src
  ));
}

async function saveReferenceAudioClip(payload: { base64Data: string; name: string; duration: number }, controls?: { done: (error?: unknown) => void }) {
  const active = activeReferenceAudio.value;
  const activeIndex = findActiveReferenceAudioIndex();
  if (!active || activeIndex < 0) {
    window.$message.error("未找到当前音频引用");
    controls?.done(new Error("未找到当前音频引用"));
    return;
  }

  try {
    const response = await axios.post("/production/editImage/uploadMedia", {
      projectId: project.value?.id,
      scriptId: props.scriptId,
      type: "audio",
      base64Data: payload.base64Data,
      name: payload.name,
    });
    const responsePayload = (response as any)?.data ?? response;
    const uploadResult = responsePayload?.data ?? responsePayload;
    const media = normalizeMediaRef(uploadResult?.media ?? uploadResult, "audio");
    const mediaId = media?.id ?? uploadResult?.id ?? uploadResult?.mediaId;
    const mediaUrl = media ? getMediaOriginalUrl(media) : uploadResult?.url || uploadResult?.src || "";
    if (mediaId == null || !mediaUrl) throw new Error("音频片段已上传，但未返回可用媒体信息");

    const clippedAudio: UploadItem = {
      ...active,
      fileType: "audio",
      sources: "local",
      id: Number.isFinite(Number(mediaId)) ? Number(mediaId) : mediaId,
      media,
      src: mediaUrl,
      originalUrl: mediaUrl,
      imageUrl: undefined,
      thumbnail: undefined,
      thumb: undefined,
      name: uploadResult?.name || media?.name || payload.name,
      prompt: active.prompt,
      parentName: active.parentName,
      category: active.category || "audio",
    };

    const next = [...imageList.value];
    next[activeIndex] = clippedAudio;
    imageList.value = next;
    activeReferenceAudio.value = clippedAudio;
    referenceAudioPreviewVisible.value = false;
    window.$message.success("已截取为当前音频引用");
    controls?.done();
  } catch (error: any) {
    window.$message.error(error?.message || "音频截取保存失败");
    controls?.done(error);
  }
}

async function getGenerateData(options: { forceCache?: boolean; selectTrackId?: number | string } = {}) {
  const requestScriptId = props.scriptId;
  if (!requestScriptId) return;
  if (!options.forceCache) persistCurrentTrackReferences();
  const response = await axios.post("/production/workbench/getGenerateData", {
    projectId: project.value?.id,
    scriptId: requestScriptId,
  });
  if (requestScriptId !== props.scriptId) return;
  const data = unwrapApiData(response) ?? {};

  storyboardList.value = (data.storyboardList ?? []).map((item: StoryboardItem) =>
    attachLegacyMediaFields(
      {
        ...item,
        factStatus: item.factStatus === "ready" || item.factStatus === "draft" || item.factStatus === "legacy" ? item.factStatus : "legacy",
      } as any,
      normalizeMediaRef((item as any).media ?? item, "image"),
    ),
  ) as StoryboardItem[];
  data.trackList = mergePendingManualTracks((data.trackList ?? []).map((track: TrackItem) => normalizeTrackItem(track)));
  // 优先使用本地缓存，没有缓存则用后端数据并写入缓存
  const pid = project.value?.id;
  const sid = requestScriptId;
  if (pid != null && sid != null) {
    // 先将没有缓存的轨道写入缓存（保留已有本地编辑）
    if (options.forceCache) {
      clearUrlMap();
      forceInitCacheFromTrackList(pid, sid, data.trackList);
    } else {
      initCacheFromTrackList(pid, sid, data.trackList);
    }
    // 批量向后端请求文件路径对应的完整 URL
    await warmUpUrls(pid, sid);
    if (requestScriptId !== props.scriptId) return;
    // 将本地缓存回写到 trackList，确保优先使用缓存数据（src 已解析为完整 URL）
    data.trackList.forEach((track: TrackItem) => {
      if (track.id == null) return;
      const cached = getCache(pid, sid, track.id);
      if (cached !== undefined) {
        track.medias = cached as unknown as TrackMedia[];
      }
    });
    // 整体赋值触发响应式
    trackList.value = [...data.trackList];
    if (options.selectTrackId != null) {
      selectTrackById(options.selectTrackId);
    } else {
      if (activeTrackIndex.value >= trackList.value.length) activeTrackIndex.value = Math.max(trackList.value.length - 1, 0);
      restoreLastTrack();
    }
    // Running-task lifecycle is restored by the project task snapshot. The
    // business list only restores persisted tracks and candidate media.
    bindVideoTaskSubscription();
  }

  const selectedDuration = trackList.value?.[activeTrackIndex.value]?.duration;
  if (selectedDuration != null) modelParmas.value.duration = Number(selectedDuration);
}

async function restoreCurrentTrackReferences() {
  const trackId = currentTrack.value?.id;
  if (trackId == null) return;
  const pid = project.value?.id;
  const sid = props.scriptId;
  if (pid == null || sid == null) return;
  try {
    const cached = await getCacheWithResolve(pid, sid, trackId);
    if (cached?.length) {
      currentTrack.value!.medias = cached as unknown as TrackMedia[];
      setCache(pid, sid, trackId, cached);
      window.$message.success("已恢复当前轨道的本地引用调整。");
      return;
    }
    removeCache(pid, sid, trackId);
    await getGenerateData({ selectTrackId: trackId });
    window.$message.info("未找到本地引用调整，已加载后端初始引用。");
  } catch (error: any) {
    try {
      removeCache(pid, sid, trackId);
      await getGenerateData({ selectTrackId: trackId });
      window.$message.info("本地引用恢复失败，已加载后端初始引用。");
    } catch (fallbackError: any) {
      window.$message.error(fallbackError?.message || error?.message || "恢复引用失败，请稍后重试。");
    }
  }
}
/** 提示词失焦时保存到后端 */
function confirmRefreshReferenceCache() {
  const dlg = DialogPlugin.confirm({
    header: "刷新引用缓存",
    body: "将用后端最新引用覆盖当前剧集本地引用缓存，未保存到后端的引用调整会丢失。",
    confirmBtn: "刷新",
    cancelBtn: $t("common.cancel"),
    onConfirm: async () => {
      dlg.destroy();
      cacheRefreshing.value = true;
      try {
        await getGenerateData({ forceCache: true });
        window.$message.success("引用缓存已刷新");
      } catch (e) {
        window.$message.error((e as any)?.message || "刷新引用缓存失败");
      } finally {
        cacheRefreshing.value = false;
      }
    },
    onCancel: () => dlg.destroy(),
  });
}

const isFlexibleReferenceMode = computed(() => Array.isArray(parseMode(modelParmas.value.mode)));
const storyboardMergeCandidates = computed(() =>
  imageList.value
    .map((item, order) => ({ item, order }))
    .filter(({ item }) => item.sources === "storyboard" && item.fileType === "image" && Boolean(item.src) && item.id != null),
);
const assetMergeCandidates = computed(() =>
  imageList.value
    .map((item, order) => ({ item, order }))
    .filter(({ item }) => item.sources === "assets" && item.fileType === "image" && Boolean(item.src) && item.id != null),
);
const canMergeStoryboard = computed(() => isFlexibleReferenceMode.value && storyboardMergeCandidates.value.length >= 2);
const canMergeAssets = computed(() => isFlexibleReferenceMode.value && assetMergeCandidates.value.length >= 2);

function getRuntimeStatus(item: { status?: any; state?: any }, fallback: import("@/types/api").TaskStatus = "pending") {
  return normalizeTaskStatus(item.status ?? item.state, fallback);
}

function isActiveRuntimeStatus(item: { status?: any; state?: any }) {
  return ["queued", "submitting", "processing"].includes(getRuntimeStatus(item));
}

function getAssetMergeLabel(item: UploadItem) {
  if (item.category === "role" && item.parentName && item.name && item.parentName !== item.name) return `${item.parentName}+${item.name}`;
  return item.name || item.prompt || `资产${item.id}`;
}
function getAssetMergeCategory(item: UploadItem) {
  const category = item.category;
  return category === "role" || category === "scene" || category === "tool" || category === "clip" ? category : "other";
}

async function mergeReferences(type: "storyboard" | "assets") {
  if (!currentTrack.value?.id) return;
  const candidates = type === "storyboard" ? storyboardMergeCandidates.value : assetMergeCandidates.value;
  if (candidates.length < 2) return window.$message.warning(type === "storyboard" ? "至少选择两张分镜图" : "至少选择两张图片资产");
  mergeLoading.value = type;
  try {
    const refs = candidates.map(({ item, order }) => ({
      id: Number(item.id),
      sources: item.sources as "storyboard" | "assets",
      src: item.src,
      order,
      label: item.sources === "storyboard" ? item.name || `P${(item as UploadItemStoryboard).index + 1}` : getAssetMergeLabel(item),
      category: item.sources === "assets" ? getAssetMergeCategory(item) : undefined,
      parentName: item.sources === "assets" ? item.parentName : undefined,
      name: item.name,
      index: item.sources === "storyboard" ? (item as UploadItemStoryboard).index : undefined,
    }));
    const response = await axios.post("/production/workbench/createMergedReference", {
      projectId: project.value?.id,
      scriptId: props.scriptId,
      trackId: currentTrack.value.id,
      mergeType: type,
      refs,
    });
    const data = (response as any)?.data?.data ?? (response as any)?.data ?? response;
    const media = normalizeMediaRef(data?.media ?? data, "image");
    const mediaWithSource = media ? { ...media, source: media.source ?? "merged" } : undefined;
    const mergedId = data?.id ?? data?.assetId ?? data?.asset?.id ?? mediaWithSource?.id;
    if (mergedId == null || Number.isNaN(Number(mergedId))) {
      throw new Error("后端未返回合图资产 ID");
    }
    const originalUrl =
      (mediaWithSource ? getMediaOriginalUrl(mediaWithSource) : "") ||
      data?.originalUrl ||
      data?.imageUrl ||
      data?.url ||
      data?.src ||
      "";
    const previewUrl =
      (mediaWithSource ? getMediaPreviewUrl(mediaWithSource) : "") ||
      data?.thumbnail ||
      data?.thumb ||
      data?.previewUrl ||
      data?.src ||
      originalUrl;
    const mergedItem: UploadItemMerged = {
      fileType: "image",
      sources: "merged",
      id: Number(mergedId),
      media: mediaWithSource,
      src: previewUrl || originalUrl,
      originalUrl,
      imageUrl: data?.imageUrl || originalUrl,
      thumbnail: data?.thumbnail || data?.previewUrl || previewUrl,
      thumb: data?.thumb || previewUrl,
      name: data?.name || data?.asset?.name || (type === "storyboard" ? "合并分镜图" : "合并资产图"),
      prompt: data?.prompt || data?.asset?.prompt,
      sourceRefs: refs.map(({ id, sources, order }) => ({ id, sources, order })),
    };
    const replaceIndexes = candidates.map(({ order }) => order).sort((a, b) => a - b);
    const next = [...imageList.value];
    for (let i = replaceIndexes.length - 1; i >= 0; i--) next.splice(replaceIndexes[i], 1);
    next.splice(replaceIndexes[0], 0, mergedItem);
    imageList.value = next;
    window.$message.success("合图引用已创建");
  } catch (e) {
    window.$message.error((e as any)?.message || "创建合图引用失败");
  } finally {
    mergeLoading.value = "";
  }
}

function handlePromptBlur() {
  const trackId = trackList.value[activeTrackIndex.value]?.id;
  if (trackId == null) return;
  axios.post("/production/workbench/updateVideoPrompt", { id: trackId, prompt: currentTrack.value?.prompt });
}

/** 单个轨道生成提示词 */
async function genText() {
  if (!ensureCurrentTrackStoryboardReady()) return;
  if (currentTrack.value?.prompt?.trim()) {
    const dlg = DialogPlugin.confirm({
      header: "Overwrite prompt",
      body: "AI prompt generation will replace the current edited prompt. Continue?",
      confirmBtn: "Overwrite",
      cancelBtn: $t("common.cancel"),
      onConfirm: async () => {
        dlg.destroy();
        await genTextConfirmed();
      },
      onCancel: () => dlg.destroy(),
    });
    return;
  }
  await genTextConfirmed();
}

async function genTextConfirmed() {
  if (!ensureCurrentTrackStoryboardReady()) return;
  if (currentTrack.value.id == null) return;
  taskCenter.removeTask(createTaskKey("videoPrompt", Number(project.value?.id), currentTrack.value.id));
  const currentTrackId = currentTrack.value.id;
  const changeTrack = currentTrack.value;
  const info = buildVideoReferencePayload(modelParmas.value.mode, imageList.value);
  currentTrack.value.state = "生成中";
  currentTrack.value.status = "processing";
  try {
    const { data } = await axios.post("/production/workbench/generateVideoPrompt", {
      projectId: project.value?.id,
      trackId: currentTrackId,
      info: info,
      model: modelParmas.value.model,
      mode: modelParmas.value.mode,
      promptPrefix: promptPrefix.value,
      promptSuffix: promptSuffix.value,
      videoPromptType: videoPromptType.value ?? undefined,
    });
    if (typeof data === "object" && data?.taskId) {
      changeTrack.taskId = data.taskId;
      changeTrack.state = "生成中";
      changeTrack.status = normalizeTaskStatus(data.status, "queued");
      registerSubmittedPromptTask({ trackId: currentTrackId, taskId: data.taskId, status: data.status });
    } else {
      changeTrack.prompt = data;
      currentTrack.value.state = "已完成";
      currentTrack.value.status = "completed";
    }
  } catch (e) {
    currentTrack.value.state = "生成失败";
    currentTrack.value.status = "failed";
    window.$message.error((e as Error)?.message ?? "提示词生成失败");
  } finally {
  }
}
function trackChange(prevIndex?: number) {
  // 切换前：将旧轨道的 imageList 保存到缓存
  if (prevIndex != null) {
    const prevTrack = trackList.value[prevIndex];
    const pid = project.value?.id;
    const sid = props.scriptId;
    if (pid != null && sid != null && prevTrack?.id != null) {
      persistTrackReferences(prevTrack);
    }
  }
  // 切换后：从缓存恢复当前轨道的 imageList
  const pid = project.value?.id;
      const sid = props.scriptId;
  const curTrack = trackList.value[activeTrackIndex.value];
  if (pid != null && sid != null && curTrack?.id != null) {
    const cached = getCache(pid, sid, curTrack.id);
    if (cached) {
      curTrack.medias = cached as unknown as TrackMedia[];
    }
  }
  modelParmas.value.duration = Number(trackList.value?.[activeTrackIndex.value]?.duration || modelParmas.value.duration);
}
/** 监听当前轨道的 medias 变化，实时同步到缓存 */
watch(
  () => currentTrack.value?.medias,
  (medias) => {
    if (!medias) return;
    const pid = project.value?.id;
    const sid = props.scriptId;
    const trackId = currentTrack.value?.id;
    if (pid != null && sid != null && trackId != null) {
      scheduleCacheWrite(pid, sid, trackId, medias as unknown as UploadItem[]);
    }
  },
  { deep: true },
);

onMounted(() => {
  modelParmas.value.model = project.value?.videoModel || "";
  modelParmas.value.mode = project.value?.mode || "";
});

function createVideoGenerationSnapshot() {
  const track = currentTrack.value;
  if (!track?.id) return null;
  const mode = modelParmas.value.mode;
  return {
    projectId: project.value?.id,
    scriptId: props.scriptId,
    trackId: track.id,
    trackRef: track,
    rawPrompt: track.prompt,
    prompt: composePrompt(track.prompt),
    uploadData: buildVideoReferencePayload(mode, imageList.value),
    model: modelParmas.value.model,
    mode,
    resolution: modelParmas.value.resolution,
    duration: modelParmas.value.duration,
    audio: modelParmas.value.audio,
    videoPromptType: videoPromptType.value ?? undefined,
  };
}

/** 单个轨道生成视频 */
async function generateVideo() {
  if (!ensureCurrentTrackStoryboardReady()) return;
  const snapshot = createVideoGenerationSnapshot();
  if (!snapshot) return;
  if (!snapshot.rawPrompt?.trim()) {
    window.$message.warning($t("workbench.generate.skipDataWithEmptyVideoPromptWords"));
    return;
  }
  if (!isCurrentDurationSupported(snapshot.duration)) {
    const options = supportedDurations.value.length ? `，支持：${supportedDurations.value.join(", ")}s` : "";
    window.$message.warning(`当前模型在 ${snapshot.resolution} 不支持 ${snapshot.duration}s${options}`);
    return;
  }
  const dlg = DialogPlugin.confirm({
    header: $t("workbench.generate.generateConfirm"),
    body: `${$t("workbench.generate.generateConfirmBody")}\n\n模型：${snapshot.model}\n模式：${snapshot.mode}\n参数：${snapshot.resolution} · ${snapshot.duration}s · ${snapshot.audio ? "生成音频" : "无音频"}\n引用：${snapshot.uploadData.length} 个`,
    onConfirm: async () => {
      dlg.destroy();
      try {
        const { data } = await axios.post("/production/workbench/generateVideo", {
          projectId: snapshot.projectId,
          scriptId: snapshot.scriptId,
          uploadData: snapshot.uploadData,
          prompt: snapshot.prompt,
          model: snapshot.model,
          mode: snapshot.mode,
          resolution: snapshot.resolution,
          duration: snapshot.duration,
          audio: snapshot.audio,
          videoPromptType: snapshot.videoPromptType,
          trackId: snapshot.trackId,
        });
        window.$message.success($t("workbench.generate.generateStarted"));
        const videoId = Number(typeof data === "object" ? data.videoId : data);
        if (!Number.isFinite(videoId)) throw new Error("视频任务已提交，但后端未返回有效的视频 ID");
        const taskId = typeof data === "object" && typeof data.taskId === "string" && data.taskId.trim() ? data.taskId : undefined;
        const initialStatus = normalizeTaskStatus(typeof data === "object" ? data.status : undefined, "queued");
        const targetTrack = trackList.value.find((track) => track.id === snapshot.trackId);
        if (!targetTrack) {
          registerSubmittedVideoTask({
            videoId,
            trackId: snapshot.trackId,
            taskId,
            queueTaskId: typeof data === "object" ? data.queueTaskId : undefined,
            status: initialStatus,
          });
          await getGenerateData();
          return;
        }
        targetTrack.videoList.push({
          id: videoId,
          state: "生成中",
          status: initialStatus,
          src: "",
          taskId,
          queueTaskId: typeof data === "object" ? data.queueTaskId : undefined,
        });
        registerSubmittedVideoTask({
          videoId,
          trackId: snapshot.trackId,
          taskId,
          queueTaskId: typeof data === "object" ? data.queueTaskId : undefined,
          status: initialStatus,
        });
      } catch (e) {
        window.$message.error(getReviewMessage(e) || "视频发起生成请求失败");
      } finally {
      }
    },
    onCancel: () => dlg.destroy(),
  });
}
function findVideoById(videoId: number) {
  for (const track of trackList.value) {
    const video = track.videoList.find((candidate) => Number(candidate.id) === videoId);
    if (video) return video;
  }
  return undefined;
}

function findTrackById(trackId: number) {
  return trackList.value.find((track) => Number(track.id) === Number(trackId));
}

function registerSubmittedVideoTask(payload: {
  videoId: number;
  trackId: number;
  taskId?: string;
  queueTaskId?: number;
  status?: unknown;
}) {
  const taskId = typeof payload.taskId === "string" && payload.taskId.trim() ? payload.taskId : undefined;
  if (!taskId) return;
  const projectId = Number(project.value?.id);
  if (!projectId) return;
  taskCenter.registerTask({
    key: createTaskKey("video", projectId, payload.trackId, undefined, taskId),
    domain: "video",
    unifiedTaskId: taskId,
    targetId: payload.trackId,
    targetType: "videoTrack",
    businessId: payload.videoId,
    projectId,
    scriptId: props.scriptId,
    status: normalizeTaskStatus(payload.status, "queued"),
  });
}

function registerSubmittedPromptTask(payload: { trackId: number; taskId?: string; status?: unknown }) {
  const taskId = typeof payload.taskId === "string" && payload.taskId.trim() ? payload.taskId : undefined;
  if (!taskId) return;
  const projectId = Number(project.value?.id);
  if (!projectId) return;
  taskCenter.registerTask({
    key: createTaskKey("videoPrompt", projectId, payload.trackId, undefined, taskId),
    domain: "videoPrompt",
    unifiedTaskId: taskId,
    targetId: payload.trackId,
    targetType: "videoTrack",
    businessId: payload.trackId,
    projectId,
    scriptId: props.scriptId,
    status: normalizeTaskStatus(payload.status, "queued"),
  });
}

function bindVideoTaskSubscription() {
  releaseVideoTaskSubscription?.();
  releaseVideoTaskSubscription = null;
  const projectId = Number(project.value?.id);
  const scriptId = Number(props.scriptId);
  if (!projectId || !scriptId) return;
  releaseVideoTaskSubscription = taskCenter.subscribeTasks({ projectId, replay: true }, (task) => {
    if (Number(task.projectId) !== projectId || Number(task.scriptId) !== scriptId) return;
    if (task.domain === "video") {
      const videoId = Number(task.businessId);
      if (Number.isFinite(videoId)) applyVideoTask(videoId, task);
      return;
    }
    if (task.domain === "videoPrompt") {
      const trackId = Number(task.businessId ?? task.targetId);
      const track = Number.isFinite(trackId) ? findTrackById(trackId) : undefined;
      if (track) applyPromptTask(track, task);
    }
  });
}

async function refreshCompletedPrompt(track: TrackItem) {
  if (!track.id || promptResultRefreshing.has(track.id)) return;
  const projectId = Number(project.value?.id);
  const scriptId = Number(props.scriptId);
  if (!projectId || !scriptId) return;
  promptResultRefreshing.add(track.id);
  try {
    const { data } = await axios.post("/production/workbench/checkVideoPrompt", {
      projectId,
      scriptId,
      trackIds: [track.id],
    });
    const records = Array.isArray(data) ? data : data?.data;
    const record = Array.isArray(records) ? records.find((item: any) => Number(item.id) === Number(track.id)) : null;
    if (record?.prompt !== undefined) track.prompt = record.prompt;
    if (record?.reason !== undefined) track.reason = record.reason;
  } catch (e) {
    console.warn("[workbench-prompt] failed to refresh completed prompt", e);
  } finally {
    promptResultRefreshing.delete(track.id);
  }
}

const terminalVideoStatuses = new Set<TaskStatus>(["completed", "failed", "cancelled"]);

function isTerminalVideoStatus(status: TaskStatus) {
  return terminalVideoStatuses.has(status);
}

function updateVideoState(video: VideoItem, nextStatusValue: unknown) {
  const currentStatus = getRuntimeStatus(video, "processing");
  const nextStatus = normalizeTaskStatus(nextStatusValue, currentStatus);

  // Back-end terminal status is monotonic for a generated candidate. A delayed
  // processing event must never turn an already confirmed result back into a spinner.
  if (isTerminalVideoStatus(currentStatus) && !isTerminalVideoStatus(nextStatus)) return false;

  video.status = nextStatus;
  video.state = nextStatus === "completed" ? "已完成" : nextStatus === "failed" || nextStatus === "cancelled" ? "生成失败" : "生成中";
  return true;
}

function applyVideoResult(video: VideoItem, record: Record<string, any>) {
  const media = normalizeMediaRef(record.media ?? record, "video");
  if (media) {
    video.media = media;
    video.src = getMediaOriginalUrl(media);
  }
  video.errorReason = record.reason ?? record.errorReason ?? video.errorReason ?? "";
  return true;
}

async function refreshVideoResults(videos: VideoItem[]) {
  const resolvedVideoIds = new Set<number>();
  const projectId = Number(project.value?.id);
  const scriptId = Number(props.scriptId);
  const pending = videos.filter((video) => video.id && !videoResultRefreshing.has(video.id));
  if (!projectId || !scriptId || !pending.length) return resolvedVideoIds;
  pending.forEach((video) => videoResultRefreshing.add(video.id));
  try {
    const { data } = await axios.post("/production/workbench/checkVideoStateList", {
      projectId,
      scriptId,
      videoIds: [...new Set(pending.map((video) => video.id))],
    });
    const records = (Array.isArray(data) ? data : data?.data ?? []) as Record<string, any>[];
    const recordMap = new Map(records.map((record) => [Number(record.id ?? record.videoId), record]));
    pending.forEach((video) => {
      const record = recordMap.get(Number(video.id));
      if (record && applyVideoResult(video, record)) resolvedVideoIds.add(video.id);
    });
  } catch (error) {
    console.warn("[workbench-video] failed to refresh completed video", error);
  } finally {
    pending.forEach((video) => videoResultRefreshing.delete(video.id));
  }
  return resolvedVideoIds;
}

function scheduleVideoTerminalReconcile(videoId: number, attempt = 1) {
  const video = findVideoById(videoId);
  if (!video || videoTerminalReconcileTimers.has(videoId) || !isTerminalVideoStatus(getRuntimeStatus(video, "processing"))) return;
  const delay = attempt === 1 ? 1_200 : 3_000;
  const timer = setTimeout(async () => {
    videoTerminalReconcileTimers.delete(videoId);
    const currentVideo = findVideoById(videoId);
    if (!currentVideo) return;
    const resolvedVideoIds = await refreshVideoResults([currentVideo]);
    if (resolvedVideoIds.has(videoId)) return;
    if (attempt < 2 && isTerminalVideoStatus(getRuntimeStatus(currentVideo, "processing"))) {
      scheduleVideoTerminalReconcile(videoId, attempt + 1);
    }
  }, delay);
  videoTerminalReconcileTimers.set(videoId, timer);
}

function applyVideoTask(videoId: number, task: RuntimeTask) {
  const video = findVideoById(videoId);
  if (!video) return;
  const record = (task.result ?? {}) as any;
  if (!updateVideoState(video, task.status)) return;
  const media = normalizeMediaRef(record.media ?? record, "video");
  if (media) {
    video.media = media;
    video.src = getMediaOriginalUrl(media);
  }
  video.phase = task.phase ?? null;
  video.progress = task.progress ?? null;
  video.errorReason = task.reason ?? "";
  if (task.status === "failed" && !reportedFailures.has(task.key)) {
    reportedFailures.add(task.key);
    window.$message.error(task.reason || "视频生成失败");
  }
  if (isTerminalVideoStatus(task.status)) {
    void refreshVideoResults([video]).then((resolvedVideoIds) => {
      if (!resolvedVideoIds.has(videoId) && task.status === "completed") scheduleVideoTerminalReconcile(videoId);
    });
  }
}

function applyPromptTask(track: TrackItem, task: RuntimeTask) {
  const record = (task.result ?? {}) as any;
  track.status = task.status;
  track.state =
    task.status === "completed"
      ? "已完成"
      : task.status === "failed" || task.status === "cancelled"
        ? "生成失败"
        : "生成中";
  const prompt = record.prompt ?? record.text ?? record.content ?? record.result;
  if (prompt !== undefined) track.prompt = String(prompt);
  else if (task.status === "completed") void refreshCompletedPrompt(track);
  track.reason = task.reason ?? "";
  track.phase = task.phase ?? null;
  track.progress = task.progress ?? null;
  if (task.status === "failed" && !reportedFailures.has(task.key)) {
    reportedFailures.add(task.key);
    window.$message.error(`提示词生成失败，${task.reason || "未知原因"}`);
  }
}
onUnmounted(() => {
  emit("track-context-visible-change", false);
  releaseVideoTaskSubscription?.();
  releaseVideoTaskSubscription = null;
  videoTerminalReconcileTimers.forEach((timer) => clearTimeout(timer));
  videoTerminalReconcileTimers.clear();
  cacheWriteTimers.forEach((timer) => clearTimeout(timer));
  cacheWriteTimers.clear();
  if (promptAffixWriteTimer) clearTimeout(promptAffixWriteTimer);
});
</script>

<style lang="scss" scoped>
.index {
  height: 100%;
  min-height: 0;
  gap: 6px;
  overflow: hidden;
  .referenceImage,
  .modelSelect,
  .globalPromptAffix,
  .trackContextSummary,
  .storyboardFactGate,
  .track {
    flex: 0 0 auto;
  }
  .referenceImage {
    .referenceToolbar {
      margin-bottom: 8px;
      .referenceActions {
        gap: 8px;
      }
      .referenceHint {
        color: var(--td-text-color-placeholder);
        font-size: 12px;
      }
    }
  }
  .modelSelect {
  }
  .globalPromptAffix {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }
  .trackContextSummary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 36px;
    padding: 8px 10px;
    border: 1px solid var(--td-component-border);
    border-radius: 6px;
    background: var(--td-bg-color-container);
    .trackGroupInfo {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--td-text-color-secondary);
        font-size: 12px;
      }
    }
    .trackContextTags {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
  }
  .generate {
    flex: 1;
    min-height: 0;
    width: 100%;
    gap: 5px;
    .prompt {
      width: 50%;
      height: 100%;
      min-height: 0;
      .videoPrompt {
        width: 100%;
        height: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        :deep(.t-card__body) {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .promptData {
          width: 100%;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          .promptInput {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
          }
        }
      }
    }
    .video {
      width: 50%;
      height: 100%;
      min-height: 0;
    }
  }
  .track {
    flex-shrink: 0;
  }
}
</style>
