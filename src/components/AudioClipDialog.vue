<template>
  <t-dialog
    v-model:visible="visible"
    attach="body"
    width="min(720px, 94vw)"
    :footer="false"
    :header="dialogTitle"
    destroy-on-close
    class="audioClipDialog"
    @closed="handleClosed">
    <div class="audioClipPanel">
      <div class="audioMeta">
        <i-volume-notice size="24" />
        <div>
          <strong>{{ name || labels.audio }}</strong>
          <span>{{ durationLabel }}</span>
        </div>
      </div>

      <audio
        ref="audioRef"
        class="audioEngine"
        :src="playbackSource"
        preload="metadata"
        @loadedmetadata="handleLoadedMetadata"
        @durationchange="handleLoadedMetadata"
        @timeupdate="handleTimeUpdate"
        @play="handleAudioPlay"
        @pause="handleAudioPause"
        @seeking="handleAudioSeeking"
        @seeked="handleAudioSeeked"
        @ended="handleAudioEnded"
        @error="handleAudioError" />

      <div class="audioTransport" :class="{ disabled: !duration }">
        <t-tooltip :content="transportPlaying ? labels.pause : labels.play">
          <t-button
            class="transportToggle"
            variant="outline"
            shape="circle"
            :disabled="!duration"
            :aria-label="transportPlaying ? labels.pause : labels.play"
            @click="togglePlayback">
            <template #icon><i-pause-one v-if="transportPlaying" /><i-play-one v-else /></template>
          </t-button>
        </t-tooltip>
        <input
          class="transportSeek"
          type="range"
          min="0"
          :max="duration || 0"
          step="0.01"
          :value="currentTime"
          :disabled="!duration || !canSeekPlayback"
          :aria-label="labels.progress"
          @input="seekPlayback" />
        <span class="transportTime">{{ formatTime(currentTime) }} / {{ duration ? formatTime(duration) : '--:--' }}</span>
      </div>

      <t-alert v-if="audioError" theme="error" :message="audioError" />

      <template v-if="mode === 'clip'">
        <div class="waveformHeader">
          <strong>{{ labels.selectRange }}</strong>
          <span>{{ labels.selectedDuration }} {{ formatTime(selectedDuration) }}</span>
        </div>

        <div class="waveformShell" :class="{ disabled: !decodedBuffer }">
          <div
            ref="waveformStage"
            class="waveformStage"
            @pointerdown="handleWaveformPointerDown"
            @pointermove="handleWaveformPointerMove"
            @pointerup="handleWaveformPointerUp"
            @pointercancel="handleWaveformPointerUp">
            <canvas ref="waveformCanvas" class="waveformCanvas" />
            <div v-if="!decodedBuffer" class="waveformPlaceholder">
              {{ decoding ? labels.loadingWaveform : labels.waveformUnavailable }}
            </div>
            <div class="waveformPlayhead" :style="playheadStyle" />
            <button
              type="button"
              class="waveformHandle waveformHandleStart"
              :style="startHandleStyle"
              :disabled="!canPreviewSelection"
              aria-label="clip start"
              @pointerdown.stop="startWaveformDrag('start', $event)" />
            <button
              type="button"
              class="waveformHandle waveformHandleEnd"
              :style="endHandleStyle"
              :disabled="!canPreviewSelection"
              aria-label="clip end"
              @pointerdown.stop="startWaveformDrag('end', $event)" />
          </div>
        </div>

        <div class="waveformAxis">
          <span>{{ formatTime(0) }}</span>
          <span>{{ formatTime(duration) }}</span>
        </div>

        <div class="clipControls">
          <label>
            <span>{{ labels.start }}</span>
            <t-input-number
              :value="clipStart"
              :min="0"
              :max="Math.max(0, clipEnd - minClipDuration)"
              :step="0.01"
              :decimal-places="2"
              theme="normal"
              suffix="s"
              size="small"
              :disabled="!decodedBuffer"
              @change="setClipStart" />
          </label>
          <label>
            <span>{{ labels.end }}</span>
            <t-input-number
              :value="clipEnd"
              :min="Math.min(duration, clipStart + minClipDuration)"
              :max="duration || 0"
              :step="0.01"
              :decimal-places="2"
              theme="normal"
              suffix="s"
              size="small"
              :disabled="!decodedBuffer"
              @change="setClipEnd" />
          </label>
        </div>

        <t-alert v-if="decodeError" theme="warning" :message="decodeError" />
        <t-alert v-if="saveDisabled && saveDisabledReason" theme="info" :message="saveDisabledReason" />

        <div class="dialogActions">
          <t-button variant="outline" :disabled="!canPreviewSelection" @click="previewSelection">
            {{ labels.previewSelection }}
          </t-button>
          <t-button theme="primary" :loading="saving" :disabled="!canSave" @click="saveClip">
            {{ saveLabel }}
          </t-button>
        </div>
      </template>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
type DialogMode = "preview" | "clip";
type RangeEdge = "start" | "end" | "both";
type WaveformPeak = { level: number };
type SavePayload = { base64Data: string; name: string; start: number; end: number; duration: number; mime: "audio/wav" };
type SaveControls = { done: (error?: unknown) => void; isActive: () => boolean };

const visible = defineModel<boolean>("visible", { default: false });
const instance = getCurrentInstance();

const labels = {
  previewTitle: "\u8bd5\u542c\u97f3\u9891",
  clipTitle: "\u622a\u53d6\u97f3\u9891\u7247\u6bb5",
  audio: "\u97f3\u9891",
  start: "\u5f00\u59cb",
  end: "\u7ed3\u675f",
  selectRange: "\u9009\u62e9\u622a\u53d6\u8303\u56f4",
  selectedDuration: "\u5df2\u9009",
  previewSelection: "\u8bd5\u542c\u9009\u533a",
  play: "\u64ad\u653e",
  pause: "\u6682\u505c",
  progress: "\u97f3\u9891\u8fdb\u5ea6",
  loadingDuration: "\u6b63\u5728\u8bfb\u53d6\u97f3\u9891\u4fe1\u606f",
  playbackFailed: "\u97f3\u9891\u65e0\u6cd5\u64ad\u653e\uff0c\u8bf7\u68c0\u67e5\u97f3\u9891\u8d44\u6e90\u3002",
  loadingWaveform: "\u6b63\u5728\u751f\u6210\u6ce2\u5f62",
  waveformUnavailable: "\u6682\u65e0\u53ef\u7528\u6ce2\u5f62",
  duration: "\u65f6\u957f",
  missingSource: "\u5f53\u524d\u97f3\u9891\u7f3a\u5c11\u53ef\u8bfb\u53d6\u5730\u5740\uff0c\u65e0\u6cd5\u622a\u53d6\u3002",
  unsupportedContext: "\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u97f3\u9891\u89e3\u7801",
  decodeFailed:
    "\u5f53\u524d\u97f3\u9891\u683c\u5f0f\u6216\u8de8\u57df\u7b56\u7565\u4e0d\u652f\u6301\u524d\u7aef\u622a\u53d6\uff0c\u4f46\u4ecd\u53ef\u6b63\u5e38\u8bd5\u542c\u3001\u7ed1\u5b9a\u6216\u5f15\u7528\u3002",
  clipSuffix: "\u7247\u6bb5",
};

const props = withDefaults(
  defineProps<{
    src?: string;
    title?: string;
    name?: string;
    mode?: DialogMode;
    serverTrim?: boolean;
    saveLabel?: string;
    saveDisabled?: boolean;
    saveDisabledReason?: string;
    defaultClipEnd?: number | null;
  }>(),
  {
    src: "",
    title: "",
    name: "",
    mode: "clip",
    serverTrim: false,
    saveLabel: "\u4fdd\u5b58\u622a\u53d6",
    saveDisabled: false,
    saveDisabledReason: "",
    defaultClipEnd: null,
  },
);

const emit = defineEmits<{
  save: [payload: SavePayload, controls: SaveControls];
}>();

const minClipDuration = 0.05;
const audioRef = ref<HTMLAudioElement | null>(null);
const playbackSource = ref("");
const waveformStage = ref<HTMLElement | null>(null);
const waveformCanvas = ref<HTMLCanvasElement | null>(null);
const duration = ref(0);
const currentTime = ref(0);
const clipStart = ref(0);
const clipEnd = ref(0);
const decodedBuffer = shallowRef<AudioBuffer | null>(null);
const waveformData = ref<WaveformPeak[]>([]);
const decodeError = ref("");
const audioError = ref("");
const decoding = ref(false);
const saving = ref(false);
const audioPlaying = ref(false);
const canSeekPlayback = ref(false);
const selectionPreviewActive = ref(false);
let selectionPreviewIntent = false;
let selectionPreviewToken = 0;
let selectionPauseToken = 0;
let selectionEndPauseToken = 0;
let programmaticSeekTarget: number | null = null;
let previewFrameId = 0;
let decodeVersion = 0;
let decodeController: AbortController | null = null;
let playbackSourceVersion = 0;
let playbackSourceController: AbortController | null = null;
let playbackObjectUrl = "";
let waveformResizeObserver: ResizeObserver | null = null;
let waveformDrawFrame = 0;
let waveformSampleCount = 0;
let activeAudioContext: AudioContext | null = null;
let activeDragEdge: Exclude<RangeEdge, "both"> | null = null;
let activePointerId: number | null = null;
let selectionAudioContext: AudioContext | null = null;
let selectionAudioSource: AudioBufferSourceNode | null = null;
let selectionAudioStartedAt = 0;
let selectionAudioStartTime = 0;
let selectionAudioEndTime = 0;

const dialogTitle = computed(() => props.title || (props.mode === "clip" ? labels.clipTitle : labels.previewTitle));
const durationLabel = computed(() => (duration.value ? `${labels.duration} ${formatTime(duration.value)}` : labels.loadingDuration));
const selectedDuration = computed(() => Math.max(0, clipEnd.value - clipStart.value));
const canPreviewSelection = computed(() => Boolean(decodedBuffer.value && duration.value && selectedDuration.value >= minClipDuration));
const canSave = computed(() => Boolean(canPreviewSelection.value && !props.saveDisabled && !saving.value));
const transportPlaying = computed(() => audioPlaying.value || selectionPreviewActive.value);
const clipStartPercent = computed(() => getTimePercent(clipStart.value));
const clipEndPercent = computed(() => getTimePercent(clipEnd.value));
const playheadPercent = computed(() => getTimePercent(currentTime.value));
const playheadStyle = computed(() => ({ left: `${playheadPercent.value}%` }));
const startHandleStyle = computed(() => ({ left: `${clipStartPercent.value}%` }));
const endHandleStyle = computed(() => ({ left: `${clipEndPercent.value}%` }));

watch(
  () => [visible.value, props.src, props.mode, props.defaultClipEnd],
  () => {
    stopWaveformDrag();
    invalidateDecode();
    resetPlayback();
    clearPlaybackSource();
    resetState();
    if (!visible.value || !props.src) return;
    playbackSource.value = props.src;
    void preparePlaybackSource();
    if (props.mode === "clip") void decodeSource();
  },
  { immediate: true },
);

watch(waveformCanvas, (canvas) => {
  waveformResizeObserver?.disconnect();
  waveformResizeObserver = null;
  if (!canvas) return;
  waveformResizeObserver = new ResizeObserver(() => scheduleWaveformDraw());
  waveformResizeObserver.observe(canvas);
  void nextTick(scheduleWaveformDraw);
});

watch(() => [clipStart.value, clipEnd.value, currentTime.value], scheduleWaveformDraw);

onBeforeUnmount(() => {
  cleanupAudioClipDialog();
});

function resetState() {
  duration.value = 0;
  currentTime.value = 0;
  clipStart.value = 0;
  clipEnd.value = 0;
  decodedBuffer.value = null;
  waveformData.value = [];
  waveformSampleCount = 0;
  decodeError.value = "";
  audioError.value = "";
  decoding.value = false;
  saving.value = false;
  audioPlaying.value = false;
  canSeekPlayback.value = false;
  selectionPreviewActive.value = false;
  selectionPreviewIntent = false;
  selectionPreviewToken += 1;
  selectionPauseToken = 0;
  selectionEndPauseToken = 0;
  programmaticSeekTarget = null;
  activeDragEdge = null;
  activePointerId = null;
}

function handleClosed() {
  cleanupAudioClipDialog();
}

function resetPlayback() {
  stopSelectionMonitor();
  stopSelectionBufferPlayback();
  selectionPreviewToken += 1;
  selectionPreviewActive.value = false;
  selectionPreviewIntent = false;
  selectionPauseToken = 0;
  selectionEndPauseToken = 0;
  programmaticSeekTarget = null;
  audioPlaying.value = false;
  audioRef.value?.pause();
}

function cleanupAudioClipDialog() {
  invalidateDecode();
  resetPlayback();
  stopWaveformDrag();
  releaseAudioElement();
  clearPlaybackSource();
  waveformResizeObserver?.disconnect();
  waveformResizeObserver = null;
  cancelWaveformDraw();
  closeActiveAudioContext();
  resetCanvas();
}

function releaseAudioElement() {
  const audio = audioRef.value;
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

function clearPlaybackSource() {
  playbackSourceVersion += 1;
  playbackSourceController?.abort();
  playbackSourceController = null;
  if (playbackObjectUrl) URL.revokeObjectURL(playbackObjectUrl);
  playbackObjectUrl = "";
  playbackSource.value = "";
  canSeekPlayback.value = false;
}

async function preparePlaybackSource() {
  const source = props.src;
  if (!source) return;
  const version = playbackSourceVersion + 1;
  playbackSourceVersion = version;
  const controller = new AbortController();
  playbackSourceController = controller;
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (version !== playbackSourceVersion || controller.signal.aborted) return;
    playbackObjectUrl = URL.createObjectURL(blob);
    playbackSource.value = playbackObjectUrl;
    canSeekPlayback.value = true;
  } catch (error: any) {
    if (version !== playbackSourceVersion || controller.signal.aborted || error?.name === "AbortError") return;
    canSeekPlayback.value = false;
  } finally {
    if (version === playbackSourceVersion) playbackSourceController = null;
  }
}

function handleLoadedMetadata() {
  const audioDuration = audioRef.value?.duration;
  if (!Number.isFinite(audioDuration) || !audioDuration || audioDuration <= 0) return;
  if (props.mode === "clip" && decodedBuffer.value) return;
  const previousDuration = duration.value;
  audioError.value = "";
  duration.value = normalizeDisplayTime(audioDuration);
  if (props.mode === "clip" && (!clipEnd.value || Math.abs(clipEnd.value - previousDuration) < 0.01)) {
    clipEnd.value = getDefaultClipEnd(duration.value);
  }
}

function getDefaultClipEnd(actualDuration: number) {
  const targetDuration = Number(props.defaultClipEnd);
  return Number.isFinite(targetDuration) && targetDuration > 0
    ? Math.min(targetDuration, actualDuration)
    : actualDuration;
}

function handleTimeUpdate() {
  const audio = audioRef.value;
  if (audio) currentTime.value = audio.currentTime;
}

function handleAudioPlay() {
  audioPlaying.value = true;
  if (selectionPreviewIntent) return;
  stopSelectionMonitor();
  stopSelectionBufferPlayback();
  selectionPreviewToken += 1;
  selectionPreviewActive.value = false;
}

function handleAudioPause() {
  audioPlaying.value = false;
  if (selectionPauseToken === selectionPreviewToken && selectionPreviewIntent) {
    selectionPauseToken = 0;
    return;
  }
  if (selectionEndPauseToken === selectionPreviewToken) {
    selectionEndPauseToken = 0;
    return;
  }
  stopSelectionMonitor();
  stopSelectionBufferPlayback();
  selectionPreviewToken += 1;
  selectionPreviewActive.value = false;
  selectionPreviewIntent = false;
  programmaticSeekTarget = null;
}

function handleAudioSeeking() {
  if (programmaticSeekTarget !== null) return;
  programmaticSeekTarget = null;
  if (!selectionPreviewActive.value && !selectionPreviewIntent) return;
  stopSelectionMonitor();
  stopSelectionBufferPlayback();
  selectionPreviewToken += 1;
  selectionPreviewActive.value = false;
  selectionPreviewIntent = false;
}

function handleAudioSeeked() {
  const audio = audioRef.value;
  if (audio && programmaticSeekTarget !== null && Math.abs(audio.currentTime - programmaticSeekTarget) < 0.02) {
    programmaticSeekTarget = null;
  }
}

function handleAudioEnded() {
  audioPlaying.value = false;
  stopSelectionMonitor();
  stopSelectionBufferPlayback();
  selectionPreviewToken += 1;
  selectionPreviewActive.value = false;
  selectionPreviewIntent = false;
  currentTime.value = duration.value;
}

function handleAudioError() {
  audioPlaying.value = false;
  audioError.value = labels.playbackFailed;
}

async function togglePlayback() {
  const audio = audioRef.value;
  if (!audio || !duration.value) return;
  if (transportPlaying.value) {
    resetPlayback();
    return;
  }
  if (currentTime.value >= duration.value - 0.01) {
    audio.currentTime = 0;
    currentTime.value = 0;
  }
  try {
    await audio.play();
  } catch {
    handleAudioError();
  }
}

function seekPlayback(event: Event) {
  const audio = audioRef.value;
  const nextTime = Number((event.target as HTMLInputElement).value);
  if (!audio || !Number.isFinite(nextTime) || !duration.value) return;
  if (selectionPreviewActive.value || selectionPreviewIntent) resetPlayback();
  const boundedTime = Math.max(0, Math.min(duration.value, nextTime));
  audio.currentTime = boundedTime;
  currentTime.value = boundedTime;
}

function startSelectionMonitor(token: number) {
  stopSelectionMonitor();
  const tick = () => {
    const audio = audioRef.value;
    if (!selectionPreviewActive.value || token !== selectionPreviewToken) return;
    const bufferPlaybackTime = selectionAudioContext && selectionAudioSource ? selectionAudioStartTime + (selectionAudioContext.currentTime - selectionAudioStartedAt) : null;
    const playbackTime = bufferPlaybackTime ?? audio?.currentTime ?? currentTime.value;
    currentTime.value = Math.min(playbackTime, clipEnd.value);
    if (playbackTime + 0.015 >= clipEnd.value) {
      selectionPreviewActive.value = false;
      selectionPreviewIntent = false;
      if (selectionAudioSource) {
        stopSelectionBufferPlayback();
      } else if (audio) {
        programmaticSeekTarget = clipEnd.value;
        selectionEndPauseToken = token;
        audio.pause();
        audio.currentTime = clipEnd.value;
      }
      currentTime.value = clipEnd.value;
      return;
    }
    previewFrameId = requestAnimationFrame(tick);
  };
  previewFrameId = requestAnimationFrame(tick);
}

function stopSelectionMonitor() {
  if (previewFrameId) cancelAnimationFrame(previewFrameId);
  previewFrameId = 0;
}

async function previewSelection() {
  const audio = audioRef.value;
  if (!audio || !canPreviewSelection.value) return;
  const token = selectionPreviewToken + 1;
  selectionPreviewToken = token;
  stopSelectionMonitor();
  stopSelectionBufferPlayback();
  selectionPreviewActive.value = false;
  selectionPreviewIntent = true;
  selectionPauseToken = 0;
  selectionEndPauseToken = 0;
  programmaticSeekTarget = clipStart.value;
  try {
    if (decodedBuffer.value) {
      const context = openSelectionAudioContext();
      if (context.state === "suspended") void context.resume().catch(() => undefined);
    }
    if (!audio.paused) {
      selectionPauseToken = token;
      audio.pause();
    }
    audio.currentTime = clipStart.value;
    currentTime.value = clipStart.value;
    await waitForSelectionSeek(audio, clipStart.value, token);
    if (token !== selectionPreviewToken || !selectionPreviewIntent) return;
    if (Math.abs(audio.currentTime - clipStart.value) > 0.12) {
      await playDecodedSelection(token);
    } else {
      stopSelectionBufferPlayback();
      await audio.play();
    }
    if (token !== selectionPreviewToken || !selectionPreviewIntent) return;
    selectionPreviewActive.value = true;
    startSelectionMonitor(token);
  } catch {
    if (token !== selectionPreviewToken) return;
    selectionPreviewActive.value = false;
    selectionPreviewIntent = false;
    selectionPreviewToken += 1;
    selectionPauseToken = 0;
    selectionEndPauseToken = 0;
  }
}

function waitForSelectionSeek(audio: HTMLAudioElement, target: number, token: number) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      audio.removeEventListener("seeked", finish);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 220);
    audio.addEventListener("seeked", finish, { once: true });
    if (token !== selectionPreviewToken || Math.abs(audio.currentTime - target) < 0.02) {
      window.setTimeout(finish, 0);
    }
  });
}

async function playDecodedSelection(token: number) {
  const buffer = decodedBuffer.value;
  if (!buffer) throw new Error("Missing decoded audio buffer");
  stopSelectionBufferSource();
  const context = openSelectionAudioContext();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  selectionAudioContext = context;
  selectionAudioSource = source;
  selectionAudioStartTime = Math.max(0, Math.min(clipStart.value, buffer.duration));
  selectionAudioEndTime = Math.max(selectionAudioStartTime, Math.min(clipEnd.value, buffer.duration));
  selectionAudioStartedAt = context.currentTime;
  source.onended = () => {
    if (token !== selectionPreviewToken || !selectionPreviewActive.value) return;
    const endedAt = selectionAudioEndTime;
    stopSelectionMonitor();
    stopSelectionBufferPlayback();
    selectionPreviewActive.value = false;
    selectionPreviewIntent = false;
    currentTime.value = endedAt;
    scheduleWaveformDraw();
  };
  if (context.state === "suspended") await context.resume();
  source.start(0, selectionAudioStartTime, Math.max(minClipDuration, selectionAudioEndTime - selectionAudioStartTime));
}

function openSelectionAudioContext() {
  if (selectionAudioContext && selectionAudioContext.state !== "closed") return selectionAudioContext;
  const Context = window.AudioContext || (window as any).webkitAudioContext;
  if (!Context) throw new Error(labels.unsupportedContext);
  selectionAudioContext = new Context();
  return selectionAudioContext;
}

function stopSelectionBufferSource() {
  const source = selectionAudioSource;
  selectionAudioSource = null;
  selectionAudioStartedAt = 0;
  selectionAudioStartTime = 0;
  selectionAudioEndTime = 0;
  if (source) {
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped.
    }
    try {
      source.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

function stopSelectionBufferPlayback() {
  const context = selectionAudioContext;
  stopSelectionBufferSource();
  selectionAudioContext = null;
  if (context && context.state !== "closed") void context.close().catch(() => undefined);
}

function updateClipRange(value: number | number[], edge: RangeEdge) {
  if (!Array.isArray(value) || value.length < 2 || !duration.value) return;
  let start = clampTime(Number(value[0]));
  let end = clampTime(Number(value[1]));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  if (start > end) [start, end] = [end, start];

  if (end - start < minClipDuration) {
    const resolvedEdge = edge === "both" ? getChangedRangeEdge(start, end) : edge;
    if (resolvedEdge === "start") {
      start = Math.max(0, end - minClipDuration);
    } else {
      end = Math.min(duration.value, start + minClipDuration);
      if (end - start < minClipDuration) start = Math.max(0, end - minClipDuration);
    }
  }

  clipStart.value = normalizeClipTime(start);
  clipEnd.value = normalizeClipTime(end);
  if (selectionPreviewActive.value || selectionPreviewIntent) resetPlayback();
}

function getPointerTime(event: PointerEvent) {
  const stage = waveformStage.value;
  if (!stage || !duration.value) return 0;
  const rect = stage.getBoundingClientRect();
  const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
  return normalizeClipTime(Math.max(0, Math.min(duration.value, ratio * duration.value)));
}

function applyPointerTime(edge: Exclude<RangeEdge, "both">, event: PointerEvent) {
  const time = getPointerTime(event);
  if (edge === "start") updateClipRange([time, clipEnd.value], "start");
  else updateClipRange([clipStart.value, time], "end");
}

function handleWaveformPointerDown(event: PointerEvent) {
  if (!decodedBuffer.value || !duration.value) return;
  const time = getPointerTime(event);
  const startDistance = Math.abs(time - clipStart.value);
  const endDistance = Math.abs(time - clipEnd.value);
  startWaveformDrag(startDistance <= endDistance ? "start" : "end", event);
}

function startWaveformDrag(edge: Exclude<RangeEdge, "both">, event: PointerEvent) {
  if (!decodedBuffer.value || !duration.value) return;
  event.preventDefault();
  activeDragEdge = edge;
  activePointerId = event.pointerId;
  waveformStage.value?.setPointerCapture?.(event.pointerId);
  applyPointerTime(edge, event);
}

function handleWaveformPointerMove(event: PointerEvent) {
  if (activePointerId !== event.pointerId || !activeDragEdge) return;
  event.preventDefault();
  applyPointerTime(activeDragEdge, event);
}

function handleWaveformPointerUp(event: PointerEvent) {
  if (activePointerId !== event.pointerId) return;
  stopWaveformDrag();
}

function stopWaveformDrag() {
  if (activePointerId != null && waveformStage.value?.hasPointerCapture?.(activePointerId)) {
    waveformStage.value.releasePointerCapture(activePointerId);
  }
  activeDragEdge = null;
  activePointerId = null;
}

function getChangedRangeEdge(start: number, end: number): Exclude<RangeEdge, "both"> {
  const startDelta = Math.abs(start - clipStart.value);
  const endDelta = Math.abs(end - clipEnd.value);
  return startDelta >= endDelta ? "start" : "end";
}

function setClipStart(value: number | string) {
  updateClipRange([Number(value), clipEnd.value], "start");
}

function setClipEnd(value: number | string) {
  updateClipRange([clipStart.value, Number(value)], "end");
}

function clampTime(value: number) {
  return Math.max(0, Math.min(value, duration.value));
}

function roundTime(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeDisplayTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return roundTime(value);
}

function normalizeClipTime(value: number) {
  return Math.max(0, Math.min(duration.value, roundTime(value)));
}

function getTimePercent(value: number) {
  if (!duration.value) return 0;
  return Math.max(0, Math.min(100, (value / duration.value) * 100));
}

function invalidateDecode() {
  decodeVersion += 1;
  decodeController?.abort();
  decodeController = null;
  closeActiveAudioContext();
}

function closeActiveAudioContext() {
  const context = activeAudioContext;
  activeAudioContext = null;
  if (context && context.state !== "closed") void context.close().catch(() => undefined);
}

async function decodeSource() {
  const version = decodeVersion;
  if (!props.src) {
    decodeError.value = labels.missingSource;
    return;
  }

  const Context = window.AudioContext || (window as any).webkitAudioContext;
  if (!Context) {
    decodeError.value = labels.unsupportedContext;
    return;
  }

  const controller = new AbortController();
  decodeController = controller;
  decoding.value = true;
  let context: AudioContext | null = null;
  try {
    const response = await fetch(props.src, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    if (version !== decodeVersion || controller.signal.aborted) return;
    context = new Context();
    activeAudioContext = context;
    const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
    if (version !== decodeVersion || controller.signal.aborted) return;

    decodedBuffer.value = buffer;
    waveformData.value = [];
    waveformSampleCount = 0;
    duration.value = normalizeDisplayTime(buffer.duration);
    clipStart.value = 0;
    clipEnd.value = getDefaultClipEnd(duration.value);
    scheduleWaveformDraw();
  } catch (error: any) {
    if (version !== decodeVersion || controller.signal.aborted || error?.name === "AbortError") return;
    decodedBuffer.value = null;
    waveformData.value = [];
    decodeError.value = labels.decodeFailed;
  } finally {
    if (context && activeAudioContext === context) activeAudioContext = null;
    if (context && context.state !== "closed") await context.close().catch(() => undefined);
    if (version === decodeVersion) {
      decoding.value = false;
      decodeController = null;
    }
  }
}

function buildWaveformData(buffer: AudioBuffer, sampleCount: number): WaveformPeak[] {
  const count = Math.max(1, Math.min(sampleCount, buffer.length));
  const peaks = Array.from({ length: count }, () => ({ level: 0 }));
  const rawLevels = Array.from({ length: count }, () => 0);

  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * buffer.length) / count);
    const end = Math.max(start + 1, Math.floor(((index + 1) * buffer.length) / count));
    const stride = Math.max(1, Math.floor((end - start) / 512));
    let peak = 0;
    let squareSum = 0;
    let sampleTotal = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let frame = start; frame < end; frame += stride) {
        const sample = Math.abs(data[frame] || 0);
        peak = Math.max(peak, sample);
        squareSum += sample * sample;
        sampleTotal += 1;
      }
    }
    const rms = sampleTotal ? Math.sqrt(squareSum / sampleTotal) : 0;
    rawLevels[index] = Math.max(rms * 1.6, peak * 0.45);
  }

  const sortedAmplitudes = rawLevels
    .filter((value) => value > 0.00001)
    .sort((a, b) => a - b);
  if (!sortedAmplitudes.length) return peaks;
  const percentileIndex = Math.min(sortedAmplitudes.length - 1, Math.floor(sortedAmplitudes.length * 0.95));
  const visualMax = Math.max(sortedAmplitudes[percentileIndex], 0.0001);
  const silenceThreshold = visualMax * 0.008;
  return rawLevels.map((level) => ({
    level: level <= silenceThreshold ? 0 : Math.min(1, level / visualMax),
  }));
}

function scheduleWaveformDraw() {
  cancelWaveformDraw();
  waveformDrawFrame = window.requestAnimationFrame(() => {
    waveformDrawFrame = 0;
    drawWaveform();
  });
}

function cancelWaveformDraw() {
  if (!waveformDrawFrame) return;
  window.cancelAnimationFrame(waveformDrawFrame);
  waveformDrawFrame = 0;
}

function resetCanvas() {
  const canvas = waveformCanvas.value;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawWaveform() {
  const canvas = waveformCanvas.value;
  if (!canvas) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(height * pixelRatio));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const buffer = decodedBuffer.value;
  if (!buffer) return;
  const barWidth = 2;
  const barGap = 4;
  const sampleCount = Math.max(48, Math.min(140, Math.floor((width + barGap) / (barWidth + barGap))));
  if (waveformSampleCount !== sampleCount || !waveformData.value.length) {
    waveformData.value = buildWaveformData(buffer, sampleCount);
    waveformSampleCount = sampleCount;
  }
  if (!waveformData.value.length) return;

  const selectionStartX = (clipStartPercent.value / 100) * width;
  const selectionEndX = (clipEndPercent.value / 100) * width;
  context.fillStyle = "#f4f6f8";
  context.fillRect(0, 0, selectionStartX, height);
  context.fillRect(selectionEndX, 0, Math.max(0, width - selectionEndX), height);

  const totalBarsWidth = waveformData.value.length * barWidth + Math.max(0, waveformData.value.length - 1) * barGap;
  const offsetX = Math.max(0, (width - totalBarsWidth) / 2);
  const centerY = height / 2;
  const maxBarHeight = Math.max(2, height * 0.9);
  const playheadX = (playheadPercent.value / 100) * width;
  waveformData.value.forEach((peak, index) => {
    const x = Math.round(offsetX + index * (barWidth + barGap));
    const centerX = x + barWidth / 2;
    const inSelection = centerX >= selectionStartX && centerX <= selectionEndX;
    context.fillStyle = !inSelection ? "#cfd5dd" : centerX <= playheadX ? "#596575" : "#8c98a8";
    const height = peak.level > 0 ? Math.max(2, Math.round(peak.level * maxBarHeight)) : 2;
    const y = Math.round(centerY - height / 2);
    context.fillRect(x, y, barWidth, height);
  });
}

async function saveClip() {
  const buffer = decodedBuffer.value;
  if (!buffer || !canSave.value) return;
  saving.value = true;
  const saveVersion = decodeVersion;
  try {
    const start = Math.max(0, Math.min(clipStart.value, buffer.duration));
    const end = Math.max(start, Math.min(clipEnd.value, buffer.duration));
    const clip = props.serverTrim
      ? { start, end, duration: end - start, base64Data: "" }
      : await encodeWavDataUrl(buffer, start, end);
    const payload: SavePayload = {
      base64Data: clip.base64Data,
      name: buildClipName(props.name, clip.start, clip.end),
      start: clip.start,
      end: clip.end,
      duration: clip.duration,
      mime: "audio/wav",
    };
    await waitForSave(payload, saveVersion);
  } catch {
    // The caller owns the user-facing save error message; the dialog only restores interactivity.
  } finally {
    saving.value = false;
  }
}

function hasSaveListener() {
  const vnodeProps = instance?.vnode.props as Record<string, unknown> | null | undefined;
  return Boolean(vnodeProps?.onSave);
}

function waitForSave(payload: SavePayload, saveVersion: number) {
  if (!hasSaveListener()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const done = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    emit("save", payload, {
      done,
      isActive: () => visible.value && decodeVersion === saveVersion,
    });
  });
}

function buildClipName(name: string, start: number, end: number) {
  const base = (name || "audio").replace(/\.[^.]+$/, "");
  return `${base}-${labels.clipSuffix}-${formatTime(start).replace(/:/g, "-")}-${formatTime(end).replace(/:/g, "-")}.wav`;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "00:00";
  const totalHundredths = Math.round(value * 100);
  const minutes = Math.floor(totalHundredths / 6000);
  const seconds = Math.floor((totalHundredths % 6000) / 100);
  const hundredths = totalHundredths % 100;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${hundredths ? `.${String(hundredths).padStart(2, "0")}` : ""}`;
}

async function encodeWavDataUrl(buffer: AudioBuffer, start: number, end: number) {
  const sampleRate = buffer.sampleRate;
  const startFrame = Math.max(0, Math.min(buffer.length - 1, Math.floor(start * sampleRate)));
  const endFrame = Math.min(buffer.length, Math.max(startFrame + 1, Math.floor(end * sampleRate)));
  const frameCount = endFrame - startFrame;
  const channelCount = buffer.numberOfChannels;
  const bytesPerSample = 2;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  const blob = new Blob([arrayBuffer], { type: "audio/wav" });
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const actualStart = startFrame / sampleRate;
  const actualEnd = endFrame / sampleRate;
  return {
    base64Data,
    start: actualStart,
    end: actualEnd,
    duration: actualEnd - actualStart,
  };
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
</script>

<style scoped>
.audioClipPanel {
  display: grid;
  gap: 14px;
}

.audioMeta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.audioMeta > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.audioMeta strong,
.audioMeta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audioMeta span,
.waveformHeader span,
.waveformAxis {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.audioEngine {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.audioTransport {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 8px 10px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
  background: var(--td-bg-color-secondarycontainer);
}

.audioTransport.disabled {
  opacity: 0.65;
}

.transportToggle {
  flex: 0 0 auto;
}

.transportSeek {
  width: 100%;
  min-width: 0;
  accent-color: var(--td-brand-color);
  cursor: pointer;
}

.transportSeek:disabled {
  cursor: not-allowed;
}

.transportTime {
  min-width: 100px;
  color: var(--td-text-color-secondary);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  text-align: right;
}

.waveformHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.waveformHeader strong {
  font-size: 14px;
}

.waveformShell {
  height: 112px;
  padding: 0 12px;
  overflow: hidden;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
  background: #fff;
}

.waveformShell.disabled {
  opacity: 0.72;
}

.waveformStage {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
  touch-action: none;
  user-select: none;
}

.waveformCanvas,
.waveformPlayhead,
.waveformHandle,
.waveformPlaceholder {
  position: absolute;
}

.waveformCanvas {
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.waveformPlaceholder {
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  z-index: 2;
}

.waveformPlayhead {
  top: 8px;
  bottom: 8px;
  z-index: 5;
  width: 2px;
  border-radius: 1px;
  background: var(--td-error-color);
  transform: translateX(-1px);
  pointer-events: none;
}

.waveformHandle {
  top: 50%;
  z-index: 6;
  width: 12px;
  height: 38px;
  padding: 0;
  border: 2px solid var(--td-brand-color);
  border-radius: 3px;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-1);
  cursor: ew-resize;
  transform: translate(-50%, -50%);
}

.waveformHandle:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.waveformAxis {
  display: flex;
  justify-content: space-between;
  margin-top: -8px;
}

.clipControls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.clipControls label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.dialogActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 640px) {
  .audioTransport {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .transportTime {
    grid-column: 2;
    min-width: 0;
    text-align: left;
  }

  .waveformShell {
    height: 96px;
  }

  .clipControls {
    grid-template-columns: 1fr;
  }
}
</style>
