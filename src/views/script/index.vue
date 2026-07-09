<template>
  <div class="script">
    <div class="actionBar w">
      <div class="actionBar-left f ac">
        <t-input :placeholder="$t('workbench.script.searchPlaceholder')" v-model="searchQuery" class="searchInput" clearable style="width: 300px" />
        <t-button theme="primary" @click="onChange">
          <template #icon><i-search /></template>
          {{ $t("workbench.script.search") }}
        </t-button>
        <t-button theme="primary" @click="handleAddScript">
          <template #icon><i-plus /></template>
          {{ $t("workbench.script.addScript") }}
        </t-button>
        <t-button theme="primary" @click="handleBatchAddScript">
          <template #icon><i-plus /></template>
          {{ $t("workbench.script.batchAddScript") }}
        </t-button>
      </div>
      <div class="actionBar-right f ac w" v-if="scripts.length">
        <t-button :theme="isAllSelected ? 'default' : 'primary'" variant="outline" @click="toggleSelectAll(!isAllSelected)">
          {{ isAllSelected ? $t("workbench.script.cancelSelectAll") : $t("workbench.script.selectAll") }}
        </t-button>
        <t-button theme="primary" @click="handleExportScript" :disabled="selectedIds.length === 0">
          <template #icon><i-export /></template>
          {{ $t("workbench.script.exportScript") }}{{ selectedIds.length ? `(${selectedIds.length})` : "" }}
        </t-button>
        <t-button theme="primary" @click="handleExtractAssets" :loading="scriptLoad" :disabled="selectedIds.length === 0">
          <template #icon><i-export /></template>
          {{ $t("workbench.script.extractAssets") }}{{ selectedIds.length ? `(${selectedIds.length})` : "" }}
        </t-button>
        <t-button theme="primary" @click="handleBatchDelete" :disabled="selectedIds.length === 0">
          <template #icon><i-delete /></template>
          {{ $t("workbench.script.deleteScript") }}{{ selectedIds.length ? `(${selectedIds.length})` : "" }}
        </t-button>
      </div>
    </div>
    <div class="contentArea">
      <div v-if="scripts.length === 0" class="emptyState">
        <t-empty />
      </div>
      <div v-else class="scriptsList f w">
        <div v-for="(item, index) in scripts" :key="index" @click="handleScriptClick(item)" class="scriptCard">
          <t-card shadow hover-shadow :style="{ width: '400px', cursor: 'pointer' }">
            <template #header>
              <div class="cardHeader">
                <span class="cardTitle">{{ item.name }}</span>
                <t-checkbox :checked="selectedIds.includes(item.id)" @click.stop @change="toggleSelect(item.id)" class="cardCheckbox" />
              </div>
            </template>
            <span class="content">{{ item.content }}</span>

            <t-loading v-if="isScriptExtractionActive(item)" :text="getScriptExtractionText(item)" size="small"></t-loading>
            <t-tooltip :content="getScriptExtractionReason(item)" v-else-if="isScriptExtractionFailed(item)" theme="light">
              <t-tag theme="danger" size="small">{{ $t("workbench.script.msg.extractFailed") }}</t-tag>
            </t-tooltip>
            <div class="assetTags" v-else-if="item.relatedAssets?.length" @click.stop>
              <t-tag v-for="asset in item.relatedAssets" :key="asset.id" variant="light-outline" size="small">
                {{ asset.name }}
              </t-tag>
            </div>

            <div class="del">
              <i-delete theme="outline" size="18" @click.stop="handleDeleteScript(item.id)" style="cursor: pointer" />
            </div>
          </t-card>
        </div>
      </div>
    </div>
    <editScript v-model="detailsShow" :item="selectedScript" @searchScripts="searchScripts" />
    <addScript v-model="addScriptShow" @searchScripts="searchScripts" />
    <batchAddScript v-model="batchScriptShow" @select="searchScripts" />
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import editScript from "./components/editScript.vue";
import addScript from "./components/addScript.vue";
import batchAddScript from "./components/batchAddScript.vue";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import imageListCacheStore from "@/stores/imageListCache";
import useTaskCenter, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import type { TaskStatus } from "@/types/api";

const { clearScriptCache } = imageListCacheStore();
const taskCenter = useTaskCenter();

const { otherSetting } = storeToRefs(settingStore());
const { project } = storeToRefs(projectStore());
interface ScriptAsset {
  id: number;
  name: string;
  describe: string;
  prompt: string;
  type: "role" | "tool" | "scene" | "clip";
}
interface Script {
  id: number;
  name: string;
  content: string;
  createTime?: number;
  extractState?: -1 | 0 | 1 | 2; // -1 失败 0 正在提取 1 成功 等待提取
  errorReason?: string;
  relatedAssets?: ScriptAsset[];
  assetExtraction?: {
    status?: TaskStatus | string;
    taskId?: string;
    legacyTaskId?: string | number | null;
    reason?: string;
  } | null;
}
interface ScriptAssetExtractionTask {
  scriptIds?: number[];
  taskId?: string;
  unifiedTaskId?: string;
  legacyTaskId?: string | number | null;
  status?: TaskStatus | string;
  targetType?: string;
  targetId?: string | number | null;
}
interface ScriptAssetExtractionSkipped {
  scriptId?: number;
  reason?: string;
}
interface ScriptAssetExtractionResponse {
  total?: number;
  tasks?: ScriptAssetExtractionTask[];
  skipped?: ScriptAssetExtractionSkipped[];
}
const scripts = ref<Script[]>([]);
const searchQuery = ref("");
const addScriptShow = ref(false);
const selectedIds = ref<number[]>([]);
const scriptLoad = ref(false);
const batchScriptShow = ref(false);
const extractionTaskReleases = new Map<string, () => void>();
const handledExtractionTasks = new Set<string>();
const ACTIVE_EXTRACTION_STATUSES = new Set<TaskStatus>(["queued", "submitting", "processing"]);
const TERMINAL_EXTRACTION_STATUSES = new Set<TaskStatus>(["completed", "failed", "cancelled"]);
const isAllSelected = computed(() => scripts.value.length > 0 && selectedIds.value.length === scripts.value.length);
function toggleSelect(id: number) {
  const idx = selectedIds.value.indexOf(id);
  if (idx === -1) {
    selectedIds.value.push(id);
  } else {
    selectedIds.value.splice(idx, 1);
  }
}

function toggleSelectAll(checked: boolean) {
  if (checked) {
    selectedIds.value = scripts.value.map((s) => s.id);
  } else {
    selectedIds.value = [];
  }
}
// 搜索剧本
function unwrapResponseData<T = any>(response: any): T {
  return response?.data?.data ?? response?.data ?? response;
}

function normalizeExtractionStatus(status: unknown, fallback: TaskStatus = "pending") {
  return normalizeTaskStatus(status, fallback);
}

function isActiveExtractionStatus(status: unknown) {
  return ACTIVE_EXTRACTION_STATUSES.has(normalizeExtractionStatus(status));
}

function isScriptExtractionActive(item: Script) {
  if (item.assetExtraction?.status) return isActiveExtractionStatus(item.assetExtraction.status);
  return item.extractState === 0 || item.extractState === 2;
}

function isScriptExtractionFailed(item: Script) {
  if (item.assetExtraction?.status) return normalizeExtractionStatus(item.assetExtraction.status) === "failed";
  return item.extractState === -1;
}

function getScriptExtractionText(item: Script) {
  const status = normalizeExtractionStatus(item.assetExtraction?.status, item.extractState === 2 ? "queued" : "processing");
  return status === "queued" || status === "submitting" ? $t("workbench.script.msg.waitExtract") : $t("workbench.script.msg.extracting");
}

function getScriptExtractionReason(item: Script) {
  return item.assetExtraction?.reason || item.errorReason || $t("workbench.script.msg.extractFailed");
}

function releaseExtractionTask(taskId: string) {
  extractionTaskReleases.get(taskId)?.();
  extractionTaskReleases.delete(taskId);
}

function handleExtractionTaskUpdate(task: RuntimeTask) {
  if (!TERMINAL_EXTRACTION_STATUSES.has(task.status)) return;
  const terminalKey = `${task.key}:${task.status}:${task.updatedAt}`;
  if (handledExtractionTasks.has(terminalKey)) return;
  handledExtractionTasks.add(terminalKey);
  void searchScripts();
  if (task.status === "failed") {
    window.$message.error(task.reason || $t("workbench.script.msg.extractFailed"));
  }
}

function registerExtractionTask(task: ScriptAssetExtractionTask, fallbackTargetId?: string | number | null) {
  const taskId = task.unifiedTaskId || task.taskId;
  if (!project.value?.id || !taskId) return;
  releaseExtractionTask(taskId);
  const targetId = task.targetId ?? fallbackTargetId ?? task.scriptIds?.join(",") ?? taskId;
  const key = createTaskKey("scriptAssetExtraction", Number(project.value.id), targetId, undefined, taskId);
  const release = taskCenter.registerTask(
    {
      key,
      domain: "scriptAssetExtraction",
      taskId,
      unifiedTaskId: taskId,
      legacyTaskId: task.legacyTaskId ?? undefined,
      targetType: task.targetType ?? "scriptAssetExtraction",
      targetId,
      projectId: Number(project.value.id),
      status: normalizeExtractionStatus(task.status, "queued"),
    },
    handleExtractionTaskUpdate,
  );
  extractionTaskReleases.set(taskId, release);
}

function syncScriptExtractionTasksFromList() {
  scripts.value.forEach((script) => {
    const extraction = script.assetExtraction;
    const taskId = extraction?.taskId;
    if (!taskId || !isActiveExtractionStatus(extraction?.status)) return;
    registerExtractionTask(
      {
        taskId,
        legacyTaskId: extraction?.legacyTaskId,
        status: extraction?.status,
        targetType: "scriptAssetExtraction",
        targetId: String(script.id),
        scriptIds: [script.id],
      },
      String(script.id),
    );
  });
}

async function searchScripts() {
  try {
    const res = await axios.post("/script/getScrptApi", {
      projectId: project.value?.id,
      name: searchQuery.value,
    });
    const data = unwrapResponseData<Script[]>(res);
    scripts.value = Array.isArray(data) ? data : [];
    syncScriptExtractionTasksFromList();
  } catch (error) {
    console.error("搜索剧本失败:", error);
    window.$message.error($t("workbench.script.msg.searchFailed"));
  }
}
onMounted(searchScripts);
// 搜索输入变化
function onChange() {
  searchScripts();
}
// 新增剧本
function handleAddScript() {
  addScriptShow.value = true;
}
function handleBatchAddScript() {
  batchScriptShow.value = true;
}
//导出剧本
async function handleExportScript() {
  if (!selectedIds.value.length) {
    window.$message.warning($t("workbench.script.msg.selectsExport"));
    return;
  }
  try {
    const res = await axios.post("/script/exportScript", { id: selectedIds.value }, { responseType: "blob" });
    const blob = new Blob([res as any], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `script_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window.$message.success($t("workbench.script.msg.exportSuccess"));
  } catch (error) {
    console.error("导出剧本失败:", error);
    window.$message.error((error as Error).message ?? $t("workbench.script.msg.exportFailed"));
  }
}
const selectedScript = ref<Script>({
  id: 0,
  name: "",
  content: "",
});
const detailsShow = ref(false);
// 点击剧本卡片
function handleScriptClick(item: Script) {
  selectedScript.value = { ...item };
  detailsShow.value = true;
}
// 删除剧本
async function handleDeleteScript(scriptId: number) {
  //判断是否有资产正在提取中
  const target = scripts.value.find((item) => item.id === scriptId);
  if (target && isScriptExtractionActive(target)) {
    return window.$message.error($t("workbench.script.msg.extractingInProgress"));
  }
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.script.msg.deleteHeader"),
    body: $t("workbench.script.msg.deleteBody"),
    confirmBtn: $t("workbench.script.msg.deleteConfirm"),
    cancelBtn: $t("workbench.script.msg.cancel"),
    theme: "warning",
    onConfirm: async () => {
      try {
        await axios.post("/script/delScript", { ids: [scriptId] });
        window.$message.success($t("workbench.script.msg.deleteSuccess"));
        clearScriptCache(project.value!.id, scriptId);
        searchScripts();
        dialog.destroy();

        selectedIds.value = selectedIds.value.filter((i) => i !== scriptId);
      } catch (error) {
        console.error("删除剧本失败:", error);
        window.$message.error($t("workbench.script.msg.deleteFailed"));
        dialog.destroy();
      }
    },
    onClose: () => {
      dialog.destroy();
    },
  });
}
//提取资产
async function handleExtractAssets() {
  if (!project.value) return window.$message.error($t("workbench.script.msg.projectNotFound"));
  //判断是否有资产正在提取中
  scriptLoad.value = true;
  try {
    const response = await axios.post("/script/extractAssets", {
      scriptIds: selectedIds.value,
      projectId: project.value!.id,
      groupSize: otherSetting.value.assetsBatchGenereateSize,
    });
    const data = unwrapResponseData<ScriptAssetExtractionResponse>(response);
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    const skipped = Array.isArray(data?.skipped) ? data.skipped : [];
    tasks.forEach((task) => registerExtractionTask(task));
    if (tasks.length) {
      window.$message.success($t("workbench.script.msg.extractSubmitted", { count: tasks.length }));
    }
    if (skipped.length) {
      window.$message.warning($t("workbench.script.msg.extractSkippedActive", { count: skipped.length }));
    }
    if (!tasks.length && !skipped.length) {
      window.$message.warning($t("workbench.script.msg.extractNoTask"));
    }
    searchScripts();
    selectedIds.value = [];
  } catch (e) {
    window.$message.error((e as any)?.message || $t("workbench.script.msg.extractFailed"));
  } finally {
    scriptLoad.value = false;
  }
}
//批量删除剧本
async function handleBatchDelete() {
  if (!selectedIds.value.length) {
    window.$message.warning($t("workbench.script.msg.selectDelScript"));
    return;
  }
  //判断是否有资产正在提取中
  const extractingIds = new Set(scripts.value.filter(isScriptExtractionActive).map((s) => s.id));
  if (selectedIds.value.some((id) => extractingIds.has(id))) {
    return window.$message.error($t("workbench.script.msg.extractingInProgress"));
  }
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.script.msg.batchDeleteHeader"),
    body: $t("workbench.script.msg.batchDeleteBody", { count: selectedIds.value.length }),
    confirmBtn: $t("workbench.script.msg.deleteConfirm"),
    cancelBtn: $t("workbench.script.msg.cancel"),
    theme: "warning",
    onConfirm: async () => {
      try {
        await axios.post("/script/delScript", { ids: selectedIds.value });
        window.$message.success($t("workbench.script.msg.batchDeleteSuccess"));
        for (const item of selectedIds.value) {
          clearScriptCache(project.value!.id, item);
        }
        searchScripts();
        dialog.destroy();
      } catch (error) {
        console.error("删除剧本失败:", error);
        window.$message.error($t("workbench.script.msg.deleteFailed"));
        dialog.destroy();
      } finally {
        selectedIds.value = [];
      }
    },
    onClose: () => {
      dialog.destroy();
    },
  });
}

// 轮询相关

async function pollScriptAssets() {
  return;
  if (true) return;
  const ids: number[] = [];
  try {
    const data: unknown[] = [];
    if (data.length) {
      searchScripts();
    }
  } catch (e) {
    console.error("轮询事件状态失败:", e);
  }
}
onUnmounted(() => {
  extractionTaskReleases.forEach((release) => release());
  extractionTaskReleases.clear();
});
</script>

<style lang="scss" scoped>
.script {
  .smHead {
    margin-bottom: 32px;
  }
  .actionBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    gap: 16px;
    .actionBar-left {
      gap: 10px;
    }
    .actionBar-right {
      gap: 12px;
      .countBox {
        gap: 5px;
      }
    }
  }
  .contentArea {
    .scriptsList {
      gap: 20px;
      .scriptCard {
        position: relative;
      }
      .content {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        overflow: hidden;
        -webkit-line-clamp: 1;
      }
      .cardHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        .cardTitle {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .cardCheckbox {
          flex-shrink: 0;
          margin-left: 12px;
        }
      }
      .assetTags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }
      .del {
        text-align: right;
        opacity: 0.6;
        transition: opacity 0.2s;
      }
      .del:hover {
        opacity: 1;
      }
    }
    .emptyState {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 600px;
    }
  }
}

.settingDialogContent {
  padding: 16px 0;
  .settingItem {
    gap: 12px;
    margin-bottom: 16px;
    &:last-child {
      margin-bottom: 0;
    }
    .settingLabel {
      white-space: nowrap;
      min-width: 80px;
    }
  }
}
.settingDialogFooter {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}
</style>
