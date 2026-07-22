<template>
  <div class="novel" ref="novelRef">
    <div class="headBtn jb ac" ref="headBtnRef">
      <t-space>
        <t-button theme="primary" @click="importNovelFn">
          <template #icon>
            <t-icon name="add" />
          </template>
          {{ $t("workbench.novel.importText") }}
        </t-button>
        <t-button theme="danger" :disabled="selectedRowKeys.length === 0" @click="handleBatchDelete">
          <template #icon>
            <t-icon name="delete" />
          </template>
          {{ $t("workbench.novel.batchDelete") }} {{ selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : "" }}
        </t-button>
        <t-button @click="startEventAnalysis" :disabled="selectedRowKeys.length === 0">
          <template #icon>
            <t-icon name="analytics" />
          </template>
          {{ $t("workbench.novel.eventAnalysis") }} {{ selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : "" }}
        </t-button>
      </t-space>
      <div class="f">
        <t-input v-model="searchText" :placeholder="$t('workbench.novel.searchPlaceholder')" clearable style="width: 260px" />
        <t-button @click="onChange" style="margin-left: 10px">
          <template #icon><t-icon name="search" /></template>
          {{ $t("workbench.novel.search") }}
        </t-button>
      </div>
    </div>
    <t-table
      ref="tableRef"
      style="margin-top: 10px; flex: 1; display: flex; flex-direction: column"
      :columns="columns"
      :data="tableData"
      :selected-row-keys="selectedRowKeys"
      :select-on-row-click="true"
      :keyboardRowHover="false"
      row-key="id"
      hover
      stripe
      size="small"
      :pagination="pagination"
      :loading="loading"
      lazy-load
      table-layout="fixed"
      @select-change="handleSelectChange"
      @page-change="handlePageChange">
      <template #startTime="{ row }">
        <span>{{ dayjs(row.startTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
      </template>
      <template #event="{ row }">
        <t-loading v-if="row.eventExtraction" size="small" :text="eventExtractionText(row.eventExtraction)"></t-loading>
        <t-loading v-else-if="row.eventState == 0" size="small" :text="$t('workbench.novel.generating')"></t-loading>
        <t-button
          v-else-if="row.eventState == -1 && !row.event"
          theme="danger"
          variant="text"
          size="small"
          @click.stop="openPreview($t('workbench.novel.genFailed'), row?.errorReason)">
          {{ $t("workbench.novel.genFailed") }}
        </t-button>
        <div v-else class="eventCell">
          <div class="eventPreview">{{ formatPreview(row.event) }}</div>
          <t-link
            v-if="row.event && row.event.length > PREVIEW_MAX_LENGTH"
            theme="success"
            hover="color"
            @click="openPreview($t('workbench.novel.col.event'), row.event)">
            {{ $t("workbench.novel.viewDetail") }}
          </t-link>
        </div>
      </template>
      <template #chapterData="{ row }">
        <div class="chapterDataCell">
          <div class="chapterPreview">{{ formatPreview(row.chapterData) }}</div>
          <t-link
            v-if="row.chapterData && row.chapterData.length > PREVIEW_MAX_LENGTH"
            theme="success"
            hover="color"
            @click.stop="openPreview($t('workbench.novel.col.chapterData'), row.chapterData)">
            {{ $t("workbench.novel.viewDetail") }}
          </t-link>
        </div>
      </template>
      <template #operation="{ row }">
        <t-space :size="0">
          <t-button theme="primary" :disabled="row.eventState == 0" variant="text" @click="handleEdit(row)">
            <template #icon>
              <t-icon name="edit" />
            </template>
            {{ $t("workbench.novel.edit") }}
          </t-button>
          <t-button theme="danger" :disabled="row.eventState == 0" variant="text" @click="handleDelete(row)">
            <template #icon>
              <t-icon name="delete" />
            </template>
            {{ $t("workbench.novel.delete") }}
          </t-button>
        </t-space>
      </template>
    </t-table>
    <t-dialog v-model:visible="previewVisible" :header="previewTitle" width="900px" placement="top" top="10vh" destroy-on-close :footer="false">
      <div class="previewDialogContent">{{ previewContent || $t("workbench.novel.none") }}</div>
    </t-dialog>
    <importNovel v-model="importNovelShow" @select="handleNovelImported" />
    <editNodel v-model="editNodelShow" :formData="formData" @select="getNovel" />
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import axios from "@/utils/axios";
import importNovel from "./components/importNovel.vue";
import editNodel from "./components/editNodel.vue";
import projectStore from "@/stores/project";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
const { project } = storeToRefs(projectStore());

// 搜索文本
const searchText = ref("");
// 表头
const columns = ref<Record<string, unknown>[]>([
  {
    colKey: "row-select",
    type: "multiple",
    width: 50,
    align: "center",
  },
  {
    colKey: "index",
    title: $t("workbench.novel.col.id"),
    width: 50,
    align: "center",
  },
  { colKey: "reel", title: $t("workbench.novel.col.reel"), width: 100, align: "center", cell: "preview" },
  { colKey: "chapter", title: $t("workbench.novel.col.chapter"), width: 100, ellipsis: true },
  { colKey: "chapterData", title: $t("workbench.novel.col.chapterData"), ellipsis: true },
  { colKey: "event", title: $t("workbench.novel.col.event"), ellipsis: true },
  { colKey: "operation", title: $t("workbench.novel.col.operation"), width: 200, align: "center" },
]);
const editNodelShow = ref(false);
interface OriginalText {
  id: number;
  index: number;
  reel: string;
  chapter: string;
  chapterData: string;
  event: string;
  eventState?: number;
  errorReason?: string;
  taskId?: string;
  legacyTaskId?: number | string;
  eventExtraction?: NovelEventExtraction | null;
}

interface NovelEventExtraction {
  status: "pending" | "queued" | "submitting" | "processing";
  taskId: string;
  legacyTaskId: number;
  phase: string;
  progress: number;
  reason: string;
}

interface NovelEventExtractionTask {
  novelIds: number[];
  taskId: string;
  legacyTaskId?: number;
  status: string;
  targetType: "novelEventExtraction";
  targetId: string | number;
  phase?: string;
  progress?: number;
  reason?: string;
}

interface NovelEventExtractionResponse {
  tasks?: NovelEventExtractionTask[];
  skipped?: { novelId: number; reason: string }[];
}

const formData = ref<OriginalText>({ id: -1, index: 0, reel: "", chapter: "", chapterData: "", event: "" });
const taskCenter = useTaskCenterStore();
const novelEventBindings = new Map<number, () => void>();
const terminalReloadTaskIds = new Set<string>();
let legacyEventPollTimer: ReturnType<typeof setTimeout> | null = null;
let legacyEventPollInFlight = false;
let novelLoadRequestId = 0;
const PREVIEW_MAX_LENGTH = 80;
const previewVisible = ref(false);
const previewTitle = ref("");
const previewContent = ref("");

function formatPreview(text?: string) {
  if (!text) return $t("workbench.novel.none");
  if (text.length <= PREVIEW_MAX_LENGTH) return text;
  return `${text.slice(0, PREVIEW_MAX_LENGTH)}...`;
}

function openPreview(title: string, content?: string) {
  previewTitle.value = title;
  previewContent.value = content || "";
  previewVisible.value = true;
}

// 表格数据
const tableData = ref<OriginalText[]>([]);
// 加载状态
const loading = ref(false);
// 选中行
const selectedRowKeys = ref<Array<string | number>>([]);
// 分页
const pagination = ref({
  page: 1,
  pageSize: 10,
  total: 0,
});

onMounted(() => {
  void getNovel();
});

function onChange() {
  pagination.value.page = 1;
  void getNovel();
}

async function getNovel() {
  const projectId = Number(project.value?.id);
  if (!projectId) return;
  const requestId = ++novelLoadRequestId;
  clearLegacyNovelEventPolling();
  loading.value = true;
  try {
    const response = await axios.post("/novel/getNovel", {
      projectId,
      page: pagination.value.page,
      limit: pagination.value.pageSize,
      search: searchText.value,
    });
    if (requestId !== novelLoadRequestId) return;
    const payload = unwrapResponseData<{ data?: OriginalText[]; total?: number }>(response);
    tableData.value = payload.data ?? [];
    pagination.value.total = Number(payload.total ?? 0);

    await taskCenter.syncProjectTasks(projectId);
    if (requestId !== novelLoadRequestId) return;
    syncNovelEventTasks();
    syncLegacyNovelEventPolling();
  } finally {
    if (requestId === novelLoadRequestId) loading.value = false;
  }
}
// 处理分页变化
function handlePageChange(pageInfo: { current: number; pageSize: number }) {
  pagination.value.page = pageInfo.current;
  pagination.value.pageSize = pageInfo.pageSize;
  void getNovel();
}

async function handleNovelImported(eventExtraction?: unknown) {
  registerNovelEventExtractionTasks(eventExtraction as NovelEventExtractionResponse | undefined);
  await getNovel();
}
const importNovelShow = ref(false);
// 导入原文
function importNovelFn() {
  importNovelShow.value = true;
}
// 处理选择变化
function handleSelectChange(value: Array<string | number>, context: { selectedRowData: any[] }) {
  selectedRowKeys.value = value.filter(Boolean);
}
// 批量删除
function handleBatchDelete() {
  if (selectedRowKeys.value.length === 0) return;
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.novel.msg.batchDeleteHeader"),
    body: $t("workbench.novel.msg.batchDeleteBody", { count: selectedRowKeys.value.length }),
    onConfirm: async () => {
      await axios.post("/novel/batchDeleteNovel", {
        ids: selectedRowKeys.value,
      });
      getNovel();
      window.$message.success($t("workbench.novel.msg.batchDeleteSuccess"));
      dialog.destroy();
    },
  });
}
// 编辑
function handleEdit(row: OriginalText) {
  editNodelShow.value = true;
  formData.value = { ...row };
}
// 删除
function handleDelete(row: OriginalText) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.novel.msg.deleteHeader"),
    body: $t("workbench.novel.msg.deleteBody", { name: row.chapter }),
    onConfirm: async () => {
      try {
        await axios.post("/novel/delNovel", { id: row.id });
        window.$message.success($t("workbench.novel.msg.deleteSuccess"));
        if (tableData.value.length === 1 && pagination.value.page > 1) {
          pagination.value.page -= 1;
        }
        getNovel();
      } catch (e) {
        window.$message.error((e as Error).message);
      }
      window.$message.success($t("workbench.novel.msg.deleteSuccess"));
      dialog.destroy();
    },
  });
}

function startEventAnalysis() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.novel.msg.eventAnalysisHeader"),
    body: $t("workbench.novel.msg.eventAnalysisBody", { count: selectedRowKeys.value.length }),
    onConfirm: async () => {
      dialog.destroy();
      try {
        const response = await axios.post("/novel/event/generateEvents", {
          projectId: project.value?.id!,
          novelIds: selectedRowKeys.value,
        });
        const eventExtraction = unwrapResponseData<NovelEventExtractionResponse>(response);
        registerNovelEventExtractionTasks(eventExtraction);
        if (eventExtraction.skipped?.length) {
          window.$message.info(`已跳过 ${eventExtraction.skipped.length} 个已有活动任务的章节`);
        }
        selectedRowKeys.value.length = 0;
        await getNovel();
      } catch (error: any) {
        window.$message.error(error?.message || "事件分析任务提交失败");
      }
    },
  });
}

function registerNovelEventExtractionTasks(eventExtraction?: NovelEventExtractionResponse) {
  const projectId = Number(project.value?.id);
  if (!projectId) return;
  (eventExtraction?.tasks ?? []).forEach((task) => {
    if (!task.taskId || task.targetType !== "novelEventExtraction") return;
    taskCenter.registerTask({
      key: createTaskKey("novelEvent", projectId, task.targetId, undefined, task.taskId),
      domain: "novelEvent",
      unifiedTaskId: task.taskId,
      legacyTaskId: task.legacyTaskId,
      targetType: task.targetType,
      targetId: task.targetId,
      projectId,
      status: normalizeTaskStatus(task.status, "queued"),
      phase: task.phase,
      progress: task.progress,
      reason: task.reason,
      source: "submit",
    });
  });
}

function unwrapResponseData<T>(response: unknown): T {
  const raw = response as Record<string, unknown> | null | undefined;
  const nestedData = raw?.data;
  const envelope =
    nestedData && typeof nestedData === "object" && "code" in nestedData
      ? (nestedData as Record<string, unknown>)
      : raw;
  return (envelope && typeof envelope === "object" && "code" in envelope && "data" in envelope ? envelope.data : envelope) as T;
}

function eventExtractionText(eventExtraction: NovelEventExtraction) {
  const phase = eventExtraction.phase || $t("workbench.novel.generating");
  return `${phase} ${Math.max(0, Math.round(Number(eventExtraction.progress) || 0))}%`;
}

function releaseNovelEventTask(id: number) {
  novelEventBindings.get(id)?.();
  novelEventBindings.delete(id);
}

function applyNovelEventTask(item: OriginalText, task: RuntimeTask) {
  const taskId = task.unifiedTaskId;
  if (!taskId || item.eventExtraction?.taskId !== taskId) return;
  if (task.status === "pending" || task.status === "queued" || task.status === "submitting" || task.status === "processing") {
    item.eventExtraction = {
      ...item.eventExtraction,
      status: task.status,
      phase: task.phase ?? item.eventExtraction.phase,
      progress: task.progress ?? item.eventExtraction.progress,
      reason: task.reason ?? item.eventExtraction.reason,
    };
    return;
  }
  releaseNovelEventTask(item.id);
  void reloadNovelAfterTerminalTask(taskId);
}

function syncNovelEventTasks() {
  const activeIds = new Set<number>();
  tableData.value.forEach((item) => {
    const eventExtraction = item.eventExtraction;
    if (!eventExtraction?.taskId) return;
    activeIds.add(item.id);
    const key = createTaskKey("novelEvent", Number(project.value?.id), item.id, undefined, eventExtraction.taskId);
    const existing = taskCenter.getTask(key);
    if (!existing || existing.unifiedTaskId !== eventExtraction.taskId) {
      releaseNovelEventTask(item.id);
      return;
    }
    if (novelEventBindings.has(item.id)) releaseNovelEventTask(item.id);
    novelEventBindings.set(
      item.id,
      taskCenter.registerTask(
        {
          ...existing,
          key: existing.key,
        },
        (task) => applyNovelEventTask(item, task),
      ),
    );
  });
  Array.from(novelEventBindings.keys()).forEach((id) => {
    if (!activeIds.has(id)) releaseNovelEventTask(id);
  });
}

async function reloadNovelAfterTerminalTask(taskId: string) {
  if (terminalReloadTaskIds.has(taskId)) return;
  terminalReloadTaskIds.add(taskId);
  try {
    await getNovel();
  } finally {
    terminalReloadTaskIds.delete(taskId);
  }
}

function getLegacyNovelEventIds() {
  return tableData.value
    .filter((item) => item.eventState === 0 && !item.eventExtraction?.taskId)
    .map((item) => item.id);
}

function clearLegacyNovelEventPolling() {
  if (legacyEventPollTimer) clearTimeout(legacyEventPollTimer);
  legacyEventPollTimer = null;
}

function syncLegacyNovelEventPolling() {
  clearLegacyNovelEventPolling();
  if (!getLegacyNovelEventIds().length) return;
  legacyEventPollTimer = setTimeout(() => void pollLegacyNovelEvents(), 3_000);
}

async function pollLegacyNovelEvents() {
  if (legacyEventPollInFlight) return;
  const ids = getLegacyNovelEventIds();
  if (!ids.length) return;
  legacyEventPollInFlight = true;
  try {
    const response = await axios.post("/novel/getNovelEventState", { ids });
    const records = unwrapResponseData<Array<Pick<OriginalText, "id" | "event" | "eventState" | "errorReason">>>(response);
    records.forEach((record) => {
      const item = tableData.value.find((row) => row.id === record.id && !row.eventExtraction?.taskId);
      if (item) Object.assign(item, record);
    });
  } catch {
    // Historical task polling is best effort; the next page refresh remains authoritative.
  } finally {
    legacyEventPollInFlight = false;
    syncLegacyNovelEventPolling();
  }
}

onUnmounted(() => {
  novelEventBindings.forEach((release) => release());
  novelEventBindings.clear();
  clearLegacyNovelEventPolling();
});
</script>

<style lang="scss" scoped>
.novel {
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding-bottom: 16px;
  .headBtn {
    margin-top: 20px;
  }
}
:deep(.t-table__content) {
  flex: 1;
}

.chapterDataCell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chapterPreview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eventCell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.eventPreview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.previewDialogContent {
  max-height: 65vh;
  overflow: auto;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
