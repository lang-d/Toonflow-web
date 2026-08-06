<template>
  <Teleport to="body">
    <Transition name="trackContextSidebar">
      <aside
        v-if="visible"
        class="trackContextSidebar"
        :class="{ resizing }"
        :style="{ width: drawerSize }"
        role="dialog"
        aria-modal="false"
        aria-labelledby="track-context-title">
        <div class="drawerResizeHandle" aria-hidden="true" @pointerdown="startDrawerResize" />
        <header class="sidebarHeader">
          <div class="drawerHeader">
            <div>
              <strong id="track-context-title">分镜与剧本</strong>
              <p>{{ trackTitle }}</p>
            </div>
          </div>
          <button type="button" class="sidebarClose" aria-label="关闭分镜与剧本" @click="visible = false">
            <i-close-small size="18" />
          </button>
        </header>

        <div class="drawerTabList" role="tablist" aria-label="分镜与剧本">
          <button
            id="track-context-storyboards-tab"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'storyboards'"
            aria-controls="track-context-storyboards-panel"
            class="drawerTab"
            :class="{ active: activeTab === 'storyboards' }"
            @click="activeTab = 'storyboards'">
            当前轨道分镜事实
          </button>
          <button
            id="track-context-script-tab"
            type="button"
            role="tab"
            :aria-selected="activeTab === 'script'"
            aria-controls="track-context-script-panel"
            class="drawerTab"
            :class="{ active: activeTab === 'script' }"
            @click="activeTab = 'script'">
            本集剧本
          </button>
        </div>

        <section
          v-if="activeTab === 'storyboards'"
          id="track-context-storyboards-panel"
          role="tabpanel"
          aria-labelledby="track-context-storyboards-tab"
          tabindex="0"
          data-testid="track-context-scroll-panel"
          class="drawerScrollPanel factPanel"
          @wheel="handleScrollPanelWheel">
          <div class="factListInner">
            <t-empty v-if="!facts.length" title="当前轨道暂无分镜事实" />
            <article v-for="fact in facts" :key="fact.id" class="factCard">
              <header class="factHeader">
                <strong>分镜 {{ fact.indexLabel }}</strong>
                <div class="factTags">
                  <t-tag v-if="fact.duration" size="small" variant="light">{{ fact.duration }}</t-tag>
                  <t-tag v-if="fact.status" size="small" variant="light">{{ fact.status }}</t-tag>
                </div>
              </header>
              <dl class="factGrid">
                <template v-for="field in fact.fields" :key="field.label">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ field.value }}</dd>
                </template>
              </dl>
            </article>
          </div>
        </section>

        <section
          v-else
          id="track-context-script-panel"
          role="tabpanel"
          aria-labelledby="track-context-script-tab"
          tabindex="0"
          data-testid="track-context-scroll-panel"
          class="drawerScrollPanel scriptReader"
          v-loading="scriptLoading"
          @wheel="handleScrollPanelWheel">
          <t-alert v-if="scriptError" theme="error" :message="scriptError">
            <template #operation>
              <t-button size="small" variant="text" @click="loadEpisodeScript(true)">重试</t-button>
            </template>
          </t-alert>
          <t-empty v-else-if="scriptLoaded && !scriptContent" title="本集暂无剧本正文" />
          <MdPreview v-else-if="scriptLoaded" class="scriptMarkdown" :model-value="scriptContent" preview-only />
          <div v-else class="scriptPlaceholder">正在读取本集剧本…</div>
        </section>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { MdPreview } from "md-editor-v3";
import axios from "@/utils/axios";
import { getFullTextAssetContent } from "@/api/textAsset";

type RecordValue = Record<string, unknown>;

interface EpisodeScriptMeta {
  id: number;
  name?: string;
  contentAsset?: { id: number; size?: number } | null;
}

interface FactField {
  label: string;
  value: string;
}

const props = defineProps<{
  projectId?: number;
  scriptId?: number;
  track?: Pick<TrackItem, "id" | "groupName" | "groupIntent">;
  storyboards: StoryboardItem[];
}>();

const emit = defineEmits<{
  "visible-change": [visible: boolean];
}>();

const visible = defineModel<boolean>("visible", { default: false });
const activeTab = ref<"storyboards" | "script">("storyboards");
const scriptContent = ref("");
const scriptLoading = ref(false);
const scriptLoaded = ref(false);
const scriptError = ref("");
const scriptCache = new Map<string, string>();
let scriptRequestId = 0;
const drawerWidthStorageKey = "workbench:trackContextDrawerWidth";
const viewportWidth = ref(typeof window === "undefined" ? 1024 : window.innerWidth);
const preferredDrawerWidth = ref(readStoredDrawerWidth());

const drawerMaxWidth = computed(() => Math.max(280, Math.min(960, viewportWidth.value - 96)));
const drawerMinWidth = computed(() => Math.min(420, drawerMaxWidth.value));
const drawerSize = computed(() => `${clampDrawerWidth(preferredDrawerWidth.value)}px`);
const resizing = ref(false);
let stopDrawerResize: (() => void) | null = null;

const trackTitle = computed(() => props.track?.groupName || props.track?.groupIntent || "当前轨道");

const facts = computed(() =>
  [...props.storyboards]
    .sort((left, right) => Number(left.index ?? 0) - Number(right.index ?? 0))
    .map((storyboard) => toFactCard(storyboard)),
);

watch(
  () => [props.projectId, props.scriptId] as const,
  () => {
    resetScriptState();
    if (visible.value && activeTab.value === "script") void loadEpisodeScript();
  },
  { immediate: true },
);

watch(
  () => [visible.value, activeTab.value] as const,
  ([isVisible, tab]) => {
    if (isVisible && tab === "script") void loadEpisodeScript();
  },
  { immediate: true },
);

watch(
  visible,
  (isVisible) => {
    if (!isVisible) stopDrawerResize?.();
    emit("visible-change", isVisible);
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("resize", updateViewportWidth);
  window.addEventListener("keydown", handleSidebarKeydown, true);
});
onBeforeUnmount(() => {
  stopDrawerResize?.();
  window.removeEventListener("resize", updateViewportWidth);
  window.removeEventListener("keydown", handleSidebarKeydown, true);
  emit("visible-change", false);
});

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth;
  preferredDrawerWidth.value = clampDrawerWidth(preferredDrawerWidth.value);
}

function readStoredDrawerWidth() {
  if (typeof window === "undefined") return 520;
  const stored = Number(window.localStorage.getItem(drawerWidthStorageKey));
  return Number.isFinite(stored) && stored > 0 ? stored : 520;
}

function clampDrawerWidth(width: number) {
  return Math.min(drawerMaxWidth.value, Math.max(drawerMinWidth.value, Math.round(width)));
}

function persistDrawerWidth() {
  try {
    window.localStorage.setItem(drawerWidthStorageKey, String(preferredDrawerWidth.value));
  } catch {}
}

function handleSidebarKeydown(event: KeyboardEvent) {
  if (!visible.value || event.key !== "Escape") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  visible.value = false;
}

function startDrawerResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  stopDrawerResize?.();

  const startX = event.clientX;
  const startWidth = clampDrawerWidth(preferredDrawerWidth.value);
  resizing.value = true;

  const handlePointerMove = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault();
    preferredDrawerWidth.value = clampDrawerWidth(startWidth + startX - moveEvent.clientX);
  };
  const handlePointerEnd = () => {
    persistDrawerWidth();
    stopDrawerResize?.();
  };

  stopDrawerResize = () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerEnd);
    window.removeEventListener("pointercancel", handlePointerEnd);
    resizing.value = false;
    stopDrawerResize = null;
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerEnd);
  window.addEventListener("pointercancel", handlePointerEnd);
}

function handleScrollPanelWheel(event: WheelEvent) {
  const panel = event.currentTarget as HTMLElement | null;
  if (!panel) return;

  const maxScrollTop = panel.scrollHeight - panel.clientHeight;
  if (maxScrollTop <= 0) return;

  const deltaY =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * panel.clientHeight
        : event.deltaY;
  const deltaX =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaX * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaX * panel.clientWidth
        : event.deltaX;

  if (Math.abs(deltaY) < Math.abs(deltaX)) return;

  if (event.cancelable) event.preventDefault();
  event.stopPropagation();

  const nextScrollTop = Math.min(maxScrollTop, Math.max(0, panel.scrollTop + deltaY));
  if (nextScrollTop !== panel.scrollTop) {
    panel.scrollTop = nextScrollTop;
  }
}

function toFactCard(storyboard: StoryboardItem) {
  const raw = storyboard as unknown as RecordValue;
  const row = parseTableRow(raw.tableRowJson);
  const factVersion = Number(row.version ?? raw.factVersion);
  const isLegacyRow = factVersion === 1;
  const isV3 = factVersion === 3;
  const read = (...keys: string[]) => firstMeaningful(...keys.map((key) => raw[key]), ...keys.map((key) => row[key]));
  const fields: Array<[string, unknown]> = [
    ["场景", read("location", "scene")],
    ["时间", read("timeOfDay")],
    ["连续性", read("sceneContinuityId")],
    ...(isV3
      ? ([['镜头描述', read("shotDescription")]] as Array<[string, unknown]>)
      : ([['画面', read("picture")], ['动作', read("action")]] as Array<[string, unknown]>)),
    ["景别", read("shotSize")],
    ["运镜 / 机位", joinFacts(read("cameraMove"), read("cameraAngle"), read("cameraPosition", "camera"))],
    ...(isLegacyRow ? ([["角色", read("characters")], ["情绪", read("visibleEmotion")]] as Array<[string, unknown]>) : []),
    ["台词", read("dialogue")],
    ["声音", read("sound")],
    ["所需资产", read("requiredAssets", "associateAssets")],
    ["转场", read("transitionFromPrevious")],
    ["调度原因", read("reason")],
    ["视频描述", read("videoDesc")],
    ["派生状态", joinFacts(raw.promptStale === true ? "分镜图 Prompt 已过期" : "", raw.imageStale === true ? "分镜图已过期" : "")],
  ];
  const duration = formatDuration(read("duration"));

  return {
    id: storyboard.id,
    indexLabel: Number.isFinite(Number(storyboard.index)) ? `P${Number(storyboard.index) + 1}` : `#${storyboard.id}`,
    duration,
    status: formatValue(read("factStatus")),
    fields: fields
      .map(([label, value]) => ({ label, value: formatValue(value) }))
      .filter((field): field is FactField => Boolean(field.value)),
  };
}

function parseTableRow(value: unknown): RecordValue {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RecordValue) : {};
  } catch {
    return {};
  }
}

function firstMeaningful(...values: unknown[]) {
  return values.find((value) => {
    if (value == null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

function joinFacts(...values: unknown[]) {
  const text = values.map(formatValue).filter(Boolean);
  return text.length ? text.join("；") : undefined;
}

function formatDuration(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? `${seconds}s` : "";
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join("；");
  if (typeof value === "object") {
    const record = value as RecordValue;
    const named = firstMeaningful(record.name, record.label, record.character, record.asset);
    const description = firstMeaningful(record.description, record.action, record.dialogue, record.value);
    if (named && description) return `${formatValue(named)}：${formatValue(description)}`;
    if (named) return formatValue(named);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

function resetScriptState() {
  scriptRequestId += 1;
  scriptContent.value = "";
  scriptLoading.value = false;
  scriptLoaded.value = false;
  scriptError.value = "";
}

async function loadEpisodeScript(force = false) {
  const projectId = Number(props.projectId);
  const scriptId = Number(props.scriptId);
  if (!projectId || !scriptId || scriptLoading.value) return;
  const requestId = ++scriptRequestId;
  scriptLoading.value = true;
  scriptError.value = "";
  try {
    const response = await axios.post("/script/getScrptApi", { projectId, name: "", includeContent: false });
    const scripts = ((response as any)?.data?.data ?? (response as any)?.data ?? response ?? []) as EpisodeScriptMeta[];
    const script = Array.isArray(scripts) ? scripts.find((item) => Number(item.id) === scriptId) : undefined;
    const assetId = Number(script?.contentAsset?.id);
    if (requestId !== scriptRequestId) return;
    if (!assetId) {
      scriptContent.value = "";
      scriptLoaded.value = true;
      return;
    }
    const cacheKey = `${projectId}:${scriptId}:${assetId}`;
    const cached = force ? undefined : scriptCache.get(cacheKey);
    const content = cached ?? (await getFullTextAssetContent({ projectId, id: assetId }));
    if (requestId !== scriptRequestId) return;
    if (!cached) scriptCache.set(cacheKey, content);
    scriptContent.value = content;
    scriptLoaded.value = true;
  } catch (error: any) {
    if (requestId !== scriptRequestId) return;
    scriptError.value = error?.message || "剧本正文读取失败，请重试";
  } finally {
    if (requestId === scriptRequestId) scriptLoading.value = false;
  }
}

</script>

<style lang="scss" scoped>
.trackContextSidebar {
  position: fixed;
  z-index: 10000;
  top: var(--titlebar-height, 0px);
  right: 0;
  height: calc(100vh - var(--titlebar-height, 0px));
  height: calc(100dvh - var(--titlebar-height, 0px));
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  max-height: calc(100vh - var(--titlebar-height, 0px));
  max-height: calc(100dvh - var(--titlebar-height, 0px));
  overflow: hidden;
  color: var(--td-text-color-primary);
  background: var(--td-bg-color-page);
  border-left: 1px solid var(--td-component-border);
  box-shadow: var(--td-shadow-3);
  &.resizing {
    user-select: none;
  }
}

.sidebarHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 56px;
  padding: 8px 12px 8px 16px;
  border-bottom: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
}

.drawerHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
  strong {
    font-size: 16px;
  }
  p {
    margin: 4px 0 0;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.sidebarClose {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 4px;
  color: var(--td-text-color-primary);
  background: transparent;
  cursor: pointer;
  &:hover {
    background: var(--td-bg-color-container-hover);
  }
}

.drawerResizeHandle {
  position: absolute;
  z-index: 2;
  top: 0;
  bottom: 0;
  left: -5px;
  width: 10px;
  cursor: col-resize;
  touch-action: none;
  &::after {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 4px;
    width: 2px;
    content: "";
    background: transparent;
  }
  &:hover::after,
  .resizing &::after {
    background: var(--td-brand-color);
  }
}

.drawerTabList {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-height: 48px;
  padding: 0 8px;
  border-bottom: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
}

.drawerTab {
  position: relative;
  border: 0;
  padding: 0 16px;
  color: var(--td-text-color-secondary);
  background: transparent;
  font: inherit;
  line-height: 48px;
  cursor: pointer;
  &:hover {
    color: var(--td-text-color-primary);
  }
  &.active {
    color: var(--td-brand-color);
    font-weight: 600;
    &::after {
      position: absolute;
      right: 0;
      bottom: -1px;
      left: 0;
      height: 3px;
      content: "";
      background: var(--td-brand-color);
    }
  }
}

.drawerScrollPanel {
  align-self: stretch;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  box-sizing: border-box;
  padding: 8px;
}

.trackContextSidebar-enter-active,
.trackContextSidebar-leave-active {
  transition: transform 180ms ease, opacity 180ms ease;
}

.trackContextSidebar-enter-from,
.trackContextSidebar-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.factPanel {
  display: block;
}

.factListInner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: min-content;
}

.factCard {
  flex: 0 0 auto;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--td-bg-color-container);
}

.factHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--td-component-border);
  background: var(--td-bg-color-secondarycontainer);
}

.factTags {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.factGrid {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  margin: 0;
  padding: 10px 12px;
  row-gap: 8px;
  column-gap: 10px;
  font-size: 13px;
  dt {
    color: var(--td-text-color-secondary);
  }
  dd {
    min-width: 0;
    margin: 0;
    color: var(--td-text-color-primary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.scriptReader {
  position: relative;
}

.scriptMarkdown {
  min-height: 0;
  padding: 0 4px 28px;
  :deep(.md-editor-preview-wrapper),
  :deep(.md-editor-preview) {
    padding: 0;
    color: var(--td-text-color-primary);
    background: transparent;
    font-size: 14px;
    line-height: 1.9;
    letter-spacing: 0.01em;
    overflow-wrap: anywhere;
  }
  :deep(.md-editor-preview > :first-child) {
    margin-top: 0;
  }
  :deep(.md-editor-preview > :last-child) {
    margin-bottom: 0;
  }
  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    color: var(--td-text-color-primary);
    line-height: 1.35;
  }
  :deep(h1) {
    margin: 0 0 22px;
    padding: 4px 0 14px;
    border-bottom: 1px solid var(--td-component-border);
    font-size: 21px;
  }
  :deep(h2) {
    margin: 30px 0 14px;
    font-size: 18px;
  }
  :deep(h3) {
    margin: 24px 0 12px;
    font-size: 16px;
  }
  :deep(p),
  :deep(ul),
  :deep(ol) {
    margin: 14px 0;
  }
  :deep(li + li) {
    margin-top: 6px;
  }
  :deep(strong) {
    font-weight: 650;
  }
  :deep(hr) {
    margin: 24px 0;
    border-color: var(--td-component-border);
  }
}

.scriptPlaceholder {
  padding: 24px 0;
  color: var(--td-text-color-secondary);
  text-align: center;
}
</style>
