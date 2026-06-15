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
        <imageSelect :mode="modelParmas.mode as VideoMode" v-model="imageList" :storyboard-list="storyboardList" />
      </div>
    </div>
    <div class="modelSelect">
      <modeMenu v-model="modelParmas" :modeOptions="modeOptions" :trackId="currentTrack?.id" :modeList="modeList" @modeChange="modeChange" />
    </div>
    <div class="globalPromptAffix">
      <t-input v-model="promptPrefix" size="small" placeholder="前置提示词" clearable />
      <t-input v-model="promptSuffix" size="small" placeholder="后置提示词" clearable />
    </div>
    <div class="generate ac">
      <div class="prompt" v-if="currentTrack">
        <t-card :title="'#' + (activeTrackIndex + 1) + $t('workbench.generate.generateText')" header-bordered class="videoPrompt">
          <template #actions>
            <t-button size="small" class="genTextbtn" :loading="currentTrack.state == '生成中'" @click="genText">
              {{ $t("workbench.generate.generateText") }}
            </t-button>
          </template>
          <div class="promptData fc">
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
          v-model:current-track="currentTrack"
          @refresh="getGenerateData"
          @generate="generateVideo" />
      </div>
    </div>
    <div class="track">
      <newTrack
        v-model:activeTrackIndex="activeTrackIndex"
        v-model="trackList"
        :image-list="imageList"
        @change="trackChange"
        :modelParmas="modelParmas"
        :clampDuration="clampDuration"
        :prompt-prefix="promptPrefix"
        :prompt-suffix="promptSuffix"
        @getData="getGenerateData" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from "vue";
import newTrack from "./components/track.vue";
import imageSelect from "./components/imageSelect.vue";
import modeMenu from "./components/modeMenu.vue";
import videoCard from "./components/video.vue";
import "@/views/production/components/workbench/type/type";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import promptEditor from "@/components/promptEditor.vue";
import imageListCacheStore from "@/stores/imageListCache";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { attachLegacyMediaFields, getMediaOriginalUrl, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";

const { project } = storeToRefs(projectStore());
const episodesId = inject<Ref<number>>("episodesId")!;
const activeTrackIndex = ref(0);
const cacheStore = imageListCacheStore();
const taskCenter = useTaskCenterStore();
const { getCache, setCache, initCacheFromTrackList, forceInitCacheFromTrackList, warmUpUrls, clearUrlMap } = cacheStore;
const { urlMap } = storeToRefs(cacheStore);
const cacheRefreshing = ref(false);
const mergeLoading = ref<"" | "storyboard" | "assets">("");
const promptPrefix = ref("");
const promptSuffix = ref("");
const restoredLastTrack = ref(false);
const videoTaskBindings = new Map<number, () => void>();
const promptTaskBindings = new Map<number, () => void>();
const reportedFailures = new Set<string>();
const cacheWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();
let promptAffixWriteTimer: ReturnType<typeof setTimeout> | null = null;

const modeOptions = ref<VideoModel>({
  name: "",
  modelName: "",
  durationResolutionMap: [],
  audio: false,
  type: "video",
  mode: [],
}); // 当前模型配置

const trackList = ref<TrackItem[]>([]); // 轨道列表

const modelParmas = ref<ModelSetting>({
  mode: "",
  model: "",
  resolution: "480p",
  duration: 8,
  audio: false,
});

const storyboardList = ref<StoryboardItem[]>([]); // 分镜列表

/** 当前剧集维度的本地操作状态 */
function getScriptStorageKey(name: string) {
  return `workbench:generate:${project.value?.id ?? "unknown"}:${episodesId.value ?? "unknown"}:${name}`;
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
  if (!lastTrackId) return;
  const index = trackList.value.findIndex((track) => track.id === lastTrackId);
  if (index >= 0) activeTrackIndex.value = index;
}

function rememberCurrentTrack(trackId?: number) {
  if (!trackId) return;
  localStorage.setItem(getScriptStorageKey("lastTrackId"), String(trackId));
}

const imageList = computed({
  get(): UploadItem[] {
    // 触发对 urlMap 的依赖追踪，当 warmUpUrls 更新 urlMap 后自动重新计算
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    urlMap.value;
    const trackId = currentTrack.value?.id;
    const pid = project.value?.id;
    const sid = episodesId.value;
    const medias = currentTrack.value?.medias;
    if (medias?.length) return medias as UploadItem[];
    // 后端数据尚未装载到当前轨道时再从缓存恢复
    if (pid != null && sid != null && trackId != null) {
      const cached = getCache(pid, sid, trackId);

      if (cached?.length) {
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
      const sid = episodesId.value;
      const trackId = currentTrack.value.id;
      if (pid != null && sid != null && trackId != null) {
        scheduleCacheWrite(pid, sid, trackId, val);
      }
    }
  },
});

function modeChange(newVal: string) {
  if (newVal == modelParmas.value.mode) return;
  if ((imageList.value.length || currentTrack.value?.prompt) && modelParmas.value.mode) {
    const dialog = DialogPlugin.confirm({
      header: $t("workbench.generate.modeChange"),
      body: $t("workbench.generate.modeChangeConfirm"),
      confirmBtn: $t("settings.generate.modelChnageSure"),
      cancelBtn: $t("settings.memory.msg.cancel"),
      onConfirm: async () => {
        imageList.value = [];
        currentTrack.value.prompt = "";
        dialog.destroy();
        modelParmas.value.mode = newVal;
      },
    });
  } else if (newVal) {
    modelParmas.value.mode = newVal;
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

/** 将时长限制在模型支持的范围内 */
watch(
  () => [project.value?.id, episodesId.value],
  () => {
    restoredLastTrack.value = false;
    loadPromptAffixes();
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

function clampDuration(trackDuration: number): number {
  const drMap = modeOptions.value?.durationResolutionMap;
  if (Array.isArray(drMap) && drMap.length > 0 && drMap[0].duration?.length) {
    const durations = drMap[0].duration;
    return Math.max(Math.min(...durations), Math.min(trackDuration, Math.max(...durations)));
  }
  return trackDuration;
}
watch(
  () => modelParmas.value.model,
  (val) => {
    if (!val) {
      modeOptions.value = {
        name: "",
        modelName: "",
        durationResolutionMap: [],
        audio: false,
        type: "video",
        mode: [],
      };
      modelParmas.value.mode = "";
      return;
    }
    axios.post("/modelSelect/getModelDetail", { modelId: val }).then(({ data }) => {
      modeOptions.value = data;
      modelParmas.value.audio = data.audio === true || data.audio === "true" || data.audio == "optional";
      const drMap = data.durationResolutionMap;
      if (Array.isArray(drMap) && drMap.length > 0) {
        if (drMap[0].resolution?.length) modelParmas.value.resolution = drMap[0].resolution[0];
        if (drMap[0].duration?.length) modelParmas.value.duration = clampDuration(modelParmas.value.duration);
      }

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
        modeChange(newMode);
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
/** uploadBox 作为 promptEditor 的引用预览 */
const references = computed(() => {
  function getFileTypeByExt(src: string | undefined): "image" | "video" | "audio" {
    const cleanSrc = src?.split(/[?#]/)[0] ?? "";
    const ext = cleanSrc.split(".").pop()?.toLowerCase() ?? "";
    if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "aac", "flac", "m4a"].includes(ext)) return "audio";
    return "image";
  }

  return (imageList.value as any[])
    .filter((item) => item.src)
    .map((item) => ({
      type: item.fileType || getFileTypeByExt(item.src),
      src: item.src ?? "",
    }));
});

async function getGenerateData(options: { forceCache?: boolean } = {}) {
  const { data } = await axios.post("/production/workbench/getGenerateData", {
    projectId: project.value?.id,
    scriptId: episodesId.value ?? 0,
  });

  storyboardList.value = (data.storyboardList ?? []).map((item: StoryboardItem) =>
    attachLegacyMediaFields(item as any, normalizeMediaRef((item as any).media ?? item, "image")),
  ) as StoryboardItem[];
  data.trackList = (data.trackList ?? []).map((track: TrackItem) => ({
    ...track,
    status: normalizeTaskStatus((track as any).status ?? track.state, "pending"),
    medias: (track.medias ?? []).map((media: TrackMedia) => attachLegacyMediaFields(media as any, normalizeMediaRef((media as any).media ?? media, media.fileType))),
    videoList: (track.videoList ?? []).map((video: VideoItem) => ({
      ...attachLegacyMediaFields(video as any, normalizeMediaRef((video as any).media ?? video, "video")),
      status: normalizeTaskStatus((video as any).status ?? video.state, "pending"),
    })),
  }));
  // 优先使用本地缓存，没有缓存则用后端数据并写入缓存
  const pid = project.value?.id;
  const sid = episodesId.value;
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
    // 将本地缓存回写到 trackList，确保优先使用缓存数据（src 已解析为完整 URL）
    data.trackList.forEach((track: TrackItem) => {
      if (track.id == null) return;
      const cached = getCache(pid, sid, track.id);
      if (cached?.length) {
        track.medias = cached as unknown as TrackMedia[];
      }
    });
    // 整体赋值触发响应式
    trackList.value = [...data.trackList];
    if (activeTrackIndex.value >= trackList.value.length) activeTrackIndex.value = Math.max(trackList.value.length - 1, 0);
    restoreLastTrack();
    syncWorkbenchTasks();
  }

  modelParmas.value.duration = clampDuration(data.trackList?.[activeTrackIndex.value]?.duration);
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
      scriptId: episodesId.value,
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
  if (currentTrack.value.id == null) return;
  taskCenter.removeTask(createTaskKey("videoPrompt", Number(project.value?.id), currentTrack.value.id));
  let info = [];
  const currentTrackId = currentTrack.value.id;
  const changeTrack = currentTrack.value;
  if (modelParmas.value.mode == "text") {
    info = changeTrack?.medias.map(({ id, sources }) => ({ id, sources }));
  } else {
    info =
      modelParmas.value.mode === "text"
        ? []
        : (() => {
            const frameMode = ["startEndRequired", "endFrameOptional", "startFrameOptional"];
            const preSliced = frameMode.includes(modelParmas.value.mode)
              ? imageList.value.slice(0, 2)
              : modelParmas.value.mode === "singleImage"
                ? imageList.value.slice(0, 1)
                : imageList.value;
            const filtered = preSliced.filter((item) => item.id).map(({ id, sources }) => ({ id, sources }));
            if (frameMode.includes(modelParmas.value.mode)) return filtered.slice(0, 2);
            if (modelParmas.value.mode === "singleImage") return filtered.slice(0, 1);
            return filtered;
          })();
  }
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
    });
    if (typeof data === "object" && data?.taskId) {
      changeTrack.taskId = data.taskId;
      changeTrack.state = "生成中";
      changeTrack.status = normalizeTaskStatus(data.status, "queued");
      syncPromptTasks();
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
    const sid = episodesId.value;
    if (pid != null && sid != null && prevTrack?.id != null) {
      scheduleCacheWrite(pid, sid, prevTrack.id, prevTrack.medias as unknown as UploadItem[]);
    }
  }
  // 切换后：从缓存恢复当前轨道的 imageList
  const pid = project.value?.id;
  const sid = episodesId.value;
  const curTrack = trackList.value[activeTrackIndex.value];
  if (pid != null && sid != null && curTrack?.id != null) {
    const cached = getCache(pid, sid, curTrack.id);
    if (cached) {
      curTrack.medias = cached as unknown as TrackMedia[];
    }
  }
  // imageList 是基于 currentTrack.medias 的计算属性，切换轨道后自动切换数据
  if (modelParmas.value.mode == "singleImage" && imageList.value.length > 1) {
    imageList.value = imageList.value.slice(0, 1);
  }
  modelParmas.value.duration = clampDuration(trackList.value?.[activeTrackIndex.value]?.duration);
}
/** 监听当前轨道的 medias 变化，实时同步到缓存 */
watch(
  () => currentTrack.value?.medias,
  (medias) => {
    if (!medias) return;
    const pid = project.value?.id;
    const sid = episodesId.value;
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
  void getGenerateData();
});
/** 单个轨道生成视频 */
async function generateVideo() {
  const dlg = DialogPlugin.confirm({
    header: $t("workbench.generate.generateConfirm"),
    body: $t("workbench.generate.generateConfirmBody"),
    onConfirm: async () => {
      dlg.destroy();
      try {
        const { data } = await axios.post("/production/workbench/generateVideo", {
          projectId: project.value?.id,
          scriptId: episodesId.value,
          uploadData:
            modelParmas.value.mode === "text"
              ? []
              : (() => {
                  const frameMode = ["startEndRequired", "endFrameOptional", "startFrameOptional"];
                  const preSliced = frameMode.includes(modelParmas.value.mode)
                    ? imageList.value.slice(0, 2)
                    : modelParmas.value.mode === "singleImage"
                      ? imageList.value.slice(0, 1)
                      : imageList.value;
                  const filtered = preSliced.filter((item) => Boolean(item.src) && item.id).map(({ id, sources }) => ({ id, sources }));
                  if (frameMode.includes(modelParmas.value.mode)) return filtered.slice(0, 2);
                  if (modelParmas.value.mode === "singleImage") return filtered.slice(0, 1);
                  return filtered;
                })(),
          prompt: composePrompt(currentTrack.value.prompt),
          model: modelParmas.value.model,
          mode: modelParmas.value.mode,
          resolution: modelParmas.value.resolution,
          duration: modelParmas.value.duration,
          audio: modelParmas.value.audio,
          trackId: currentTrack.value.id,
        });
        window.$message.success($t("workbench.generate.generateStarted"));
        const videoId = typeof data === "object" ? data.videoId : data;
        const taskId = typeof data === "object" ? data.taskId : undefined;
        currentTrack.value.videoList.push({
          id: videoId,
          state: "生成中",
          status: normalizeTaskStatus(typeof data === "object" ? data.status : undefined, "queued"),
          src: "",
          taskId,
          queueTaskId: typeof data === "object" ? data.queueTaskId : undefined,
        });
        syncVideoTasks();
      } catch (e) {
        window.$message.error((e as any)?.message ?? "视频发起生成请求失败");
      } finally {
      }
    },
    onCancel: () => dlg.destroy(),
  });
}
const hasGenerateVideoIds = computed(() => {
  return trackList.value
    .map((track) => {
      return track.videoList.filter((i) => isActiveRuntimeStatus(i)).map((i) => i.id);
    })
    .flatMap((i) => i);
});
const hasGeneratePromptIds = computed(() => {
  const trackIds = trackList.value.filter((t) => isActiveRuntimeStatus(t)).map((t) => t.id);
  return trackIds;
});

function releaseVideoTask(id: number) {
  videoTaskBindings.get(id)?.();
  videoTaskBindings.delete(id);
}

function releasePromptTask(id: number) {
  promptTaskBindings.get(id)?.();
  promptTaskBindings.delete(id);
}

function applyVideoTask(video: VideoItem, task: RuntimeTask) {
  const record = (task.result ?? {}) as any;
  video.status = task.status;
  video.state =
    task.status === "completed"
      ? "已完成"
      : task.status === "failed" || task.status === "cancelled"
        ? "生成失败"
        : "生成中";
  const media = normalizeMediaRef(record.media ?? record, "video");
  if (media) {
    video.media = media;
    video.src = getMediaOriginalUrl(media);
  }
  video.errorReason = task.reason ?? "";
  if (task.status === "failed" && !reportedFailures.has(task.key)) {
    reportedFailures.add(task.key);
    window.$message.error(task.reason || "视频生成失败");
  }
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    queueMicrotask(() => releaseVideoTask(video.id));
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
  if (record.prompt !== undefined) track.prompt = record.prompt;
  track.reason = task.reason ?? "";
  if (task.status === "failed" && !reportedFailures.has(task.key)) {
    reportedFailures.add(task.key);
    window.$message.error(`提示词生成失败，${task.reason || "未知原因"}`);
  }
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    queueMicrotask(() => releasePromptTask(track.id));
  }
}

function syncVideoTasks() {
  const projectId = Number(project.value?.id);
  if (!projectId) return;
  const activeIds = new Set<number>();
  trackList.value.forEach((track) => {
    track.videoList.forEach((video) => {
      if (!isActiveRuntimeStatus(video)) return;
      activeIds.add(video.id);
      const existingTask = taskCenter.getTask(createTaskKey("video", projectId, video.id, undefined, video.taskId));
      if (videoTaskBindings.has(video.id) && (!video.taskId || existingTask?.unifiedTaskId === video.taskId)) return;
      if (videoTaskBindings.has(video.id)) releaseVideoTask(video.id);
      const release = taskCenter.registerTask(
        {
          key: createTaskKey("video", projectId, video.id, undefined, video.taskId),
          domain: "video",
          unifiedTaskId: video.taskId,
          targetId: video.id,
          targetType: "video",
          projectId,
          scriptId: episodesId.value,
          status: getRuntimeStatus(video, "processing"),
        },
        (task) => applyVideoTask(video, task),
      );
      videoTaskBindings.set(video.id, release);
    });
  });
  Array.from(videoTaskBindings.keys()).forEach((id) => {
    if (!activeIds.has(id)) releaseVideoTask(id);
  });
}

function syncPromptTasks() {
  const projectId = Number(project.value?.id);
  if (!projectId) return;
  const activeIds = new Set<number>();
  trackList.value.forEach((track) => {
    if (!isActiveRuntimeStatus(track)) return;
    activeIds.add(track.id);
    const existingTask = taskCenter.getTask(createTaskKey("videoPrompt", projectId, track.id, undefined, track.taskId));
    if (promptTaskBindings.has(track.id) && (!track.taskId || existingTask?.unifiedTaskId === track.taskId)) return;
    if (promptTaskBindings.has(track.id)) releasePromptTask(track.id);
    const release = taskCenter.registerTask(
      {
        key: createTaskKey("videoPrompt", projectId, track.id),
        domain: "videoPrompt",
        unifiedTaskId: track.taskId,
        targetType: "videoPrompt",
        targetId: track.id,
        projectId,
        scriptId: episodesId.value,
        status: getRuntimeStatus(track, "processing"),
      },
      (task) => applyPromptTask(track, task),
    );
    promptTaskBindings.set(track.id, release);
  });
  Array.from(promptTaskBindings.keys()).forEach((id) => {
    if (!activeIds.has(id)) releasePromptTask(id);
  });
}

function syncWorkbenchTasks() {
  syncVideoTasks();
  syncPromptTasks();
}

watch(
  () => hasGenerateVideoIds.value,
  syncVideoTasks,
);
watch(
  () => hasGeneratePromptIds.value,
  syncPromptTasks,
);
onUnmounted(() => {
  videoTaskBindings.forEach((release) => release());
  promptTaskBindings.forEach((release) => release());
  videoTaskBindings.clear();
  promptTaskBindings.clear();
  cacheWriteTimers.forEach((timer) => clearTimeout(timer));
  cacheWriteTimers.clear();
  if (promptAffixWriteTimer) clearTimeout(promptAffixWriteTimer);
});
</script>

<style lang="scss" scoped>
.index {
  height: calc(100vh - 120px);
  gap: 16px;
  overflow-y: auto;
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
  }
}
</style>
