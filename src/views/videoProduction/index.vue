<template>
  <section class="videoProductionPage">
    <div class="videoProductionContent">
      <t-loading :loading="scriptsLoading" show-overlay>
        <production-workbench v-if="episodesId" :script-id="episodesId">
          <template #actions>
            <t-select
              :value="episodesId || undefined"
              class="episodeSelect"
              :loading="scriptsLoading"
              :options="episodesOptions"
              :placeholder="$t('workbench.production.selectPlaceholder')"
              @change="handleEpisodeChange" />
          </template>
        </production-workbench>
        <t-empty v-else description="请选择剧集后开始视频生产" />
      </t-loading>
    </div>
  </section>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
import ProductionWorkbench from "@/views/production/components/workbench/index.vue";

interface ProductionCanvasMemory {
  episodesId?: number;
  canvases?: Record<string, unknown>;
}

const { project } = storeToRefs(projectStore());
const agentStore = productionAgentStore();
const { episodesId } = storeToRefs(agentStore);
const scriptsLoading = ref(false);
const episodesOptions = ref<{ label: string; value: number }[]>([]);
let scriptLoadRequestId = 0;

const canvasMemoryKey = computed(() => `productionCanvasMemory:${project.value?.id ?? "unknown"}`);

function readCanvasMemory(): ProductionCanvasMemory | null {
  try {
    const raw = localStorage.getItem(canvasMemoryKey.value);
    return raw ? (JSON.parse(raw) as ProductionCanvasMemory) : null;
  } catch {
    return null;
  }
}

function rememberSelectedEpisode(scriptId: number) {
  if (!project.value?.id || !Number.isFinite(scriptId) || scriptId <= 0) return;
  try {
    const memory = readCanvasMemory() ?? {};
    if (memory.episodesId === scriptId) return;
    localStorage.setItem(canvasMemoryKey.value, JSON.stringify({ ...memory, episodesId: scriptId }));
  } catch {}
}

function selectEpisode(value: number) {
  if (!Number.isFinite(value) || value <= 0) return;
  rememberSelectedEpisode(value);
  episodesId.value = value;
}

function handleEpisodeChange(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  selectEpisode(Number(raw));
}

async function loadScripts() {
  const projectId = Number(project.value?.id);
  if (!projectId) {
    episodesOptions.value = [];
    episodesId.value = 0;
    return;
  }

  const requestId = ++scriptLoadRequestId;
  scriptsLoading.value = true;
  try {
    const { data } = await axios.post("/script/getScrptApi", { projectId, name: "" });
    if (requestId !== scriptLoadRequestId || projectId !== Number(project.value?.id)) return;
    episodesOptions.value = (Array.isArray(data) ? data : []).map((episode: any) => ({
      label: String(episode.name ?? "未命名剧集"),
      value: Number(episode.id),
    })).filter((item) => Number.isFinite(item.value) && item.value > 0);

    const available = new Set(episodesOptions.value.map((item) => item.value));
    const remembered = Number(readCanvasMemory()?.episodesId);
    const current = Number(episodesId.value);
    const next = available.has(current) ? current : available.has(remembered) ? remembered : episodesOptions.value[0]?.value;
    episodesId.value = next ?? 0;
    if (next) rememberSelectedEpisode(next);
  } catch (error: any) {
    if (requestId === scriptLoadRequestId) window.$message.error(error?.message || "剧集列表加载失败");
  } finally {
    if (requestId === scriptLoadRequestId) scriptsLoading.value = false;
  }
}

watch(
  () => project.value?.id,
  () => void loadScripts(),
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.videoProductionPage {
  height: calc(100vh - 120px);
  min-height: 0;
  padding: 6px 14px 0;
  overflow: hidden;
  background: var(--td-bg-color-page);
}
.videoProductionContent { height: 100%; min-height: 0; }
.videoProductionContent :deep(.t-loading) { height: 100%; min-height: 0; }
.videoProductionContent :deep(.t-loading__parent) { height: 100%; min-height: 0; }
.episodeSelect { width:220px; }
@media (max-width: 760px) {
  .videoProductionPage { padding:6px 8px 0; }
}
</style>
