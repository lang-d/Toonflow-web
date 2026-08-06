import { computed, onScopeDispose, ref, shallowReactive } from "vue";
import { defineStore } from "pinia";
import { io, type Socket } from "socket.io-client";
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import type { TaskResult, TaskStatus, TaskStatusEvent } from "@/types/api";
import { normalizeTaskResult } from "@/utils/mediaRef";

export type TaskDomain =
  | "flowImage"
  | "assetImage"
  | "assetPrompt"
  | "storyboardImage"
  | "video"
  | "videoPrompt"
  | "audioBind"
  | "novelEvent"
  | "scriptAssetExtraction"
  | "media";
export type TaskTransport = "legacy-polling" | "unified-events" | "auto";
export type TaskSource = "submit" | "socket" | "snapshot" | "legacy";

export interface RuntimeTask {
  key: string;
  domain: TaskDomain;
  taskId?: string | number;
  unifiedTaskId?: string;
  legacyTaskId?: string | number;
  targetType?: string;
  targetId: string | number;
  projectId: number;
  scriptId?: number;
  nodeId?: string;
  status: TaskStatus;
  version?: number;
  phase?: string;
  progress?: number;
  result?: TaskResult;
  reason?: string;
  source?: TaskSource;
  updatedAt: number;
}

export interface TaskSnapshotWarning {
  taskKey: string;
  missingCount: number;
  lastCheckedAt: number;
}
export type { TaskStatusEvent };

export interface TaskSourceAdapter {
  start(): void;
  stop(): void;
  register(task: RuntimeTask): void;
  unregister(key: string): void;
  refresh(domain?: TaskDomain): Promise<void>;
}

type TaskListener = (task: RuntimeTask) => void;
type LegacyRecord = Record<string, any>;
type ProjectScopeGuard = { projectId: number; revision: number };

const ACTIVE_STATUSES = new Set<TaskStatus>(["pending", "queued", "submitting", "processing"]);
const TERMINAL_STATUSES = new Set<TaskStatus>(["completed", "failed", "cancelled"]);
const ALL_DOMAINS: TaskDomain[] = [
  "flowImage",
  "assetImage",
  "assetPrompt",
  "storyboardImage",
  "video",
  "videoPrompt",
  "audioBind",
  "novelEvent",
  "scriptAssetExtraction",
  "media",
];
const LEGACY_BATCH_SIZE = 20;
const FLOW_IMAGE_CONCURRENCY = 3;
const TASK_RETENTION_MS = 60_000;
const SNAPSHOT_MISSING_THRESHOLD = 2;
const TRANSPORT_STORAGE_KEY = "taskTransport";

function normalizeDomain(value: TaskStatusEvent["taskType"] | TaskDomain, targetType?: string, nodeId?: string): TaskDomain {
  const hint = `${value ?? ""}:${targetType ?? ""}`.toLowerCase();
  const hasFlowImageHint = Boolean(nodeId) || hint.includes("deriveasset") || hint.includes("flow") || hint.includes("editimage") || hint.includes("node") || hint.includes("canvas");
  if (hint.includes("assetprompt") || hint.includes("asset_prompt") || hint.includes("polish")) return "assetPrompt";
  if (hint.includes("audiobind") || hint.includes("audio_bind")) return "audioBind";
  if (hint.includes("novelevent") || hint.includes("novel_event")) return "novelEvent";
  if (hint.includes("scriptassetextraction") || hint.includes("script_asset_extraction")) return "scriptAssetExtraction";
  if (hint.includes("video") && hint.includes("prompt")) return "videoPrompt";
  if (hint.includes("productionasset") || hint.includes("image:asset") || hint.includes("image:assets")) return "assetImage";
  if (hasFlowImageHint) return "flowImage";
  if (hint.includes("storyboard")) return "storyboardImage";
  if (value === "image") return targetType ? "assetImage" : "flowImage";
  if (value === "asset") return "assetImage";
  if (value === "storyboard") return "storyboardImage";
  if (value === "prompt") return "videoPrompt";
  if (value === "audio") return "audioBind";
  if (value === "media") return "media";
  if (ALL_DOMAINS.includes(value as TaskDomain)) return value as TaskDomain;
  return "media";
}

export function normalizeTaskStatus(value: unknown, fallback: TaskStatus = "processing"): TaskStatus {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  const direct: TaskStatus[] = ["pending", "queued", "submitting", "processing", "completed", "failed", "cancelled"];
  if (direct.includes(normalized as TaskStatus)) return normalized as TaskStatus;
  if (["生成中", "处理中", "排队中", "running", "generating"].includes(value)) return "processing";
  if (["未生成", "等待中", "waiting"].includes(value)) return "pending";
  if (["已完成", "生成成功", "成功", "success", "done"].includes(value)) return "completed";
  if (["生成失败", "失败", "error"].includes(value)) return "failed";
  if (["已取消", "取消"].includes(value)) return "cancelled";
  return fallback;
}

function mediaFallbackType(domain: TaskDomain) {
  if (domain === "video") return "video";
  if (domain === "audioBind") return "audio";
  return "image";
}

export function createTaskKey(domain: TaskDomain, projectId: number, targetId: string | number, nodeId?: string, unifiedTaskId?: string) {
  if (unifiedTaskId) return `task:${unifiedTaskId}`;
  return [domain, projectId, targetId, nodeId].filter((item) => item !== undefined && item !== "").join(":");
}

export function createUnifiedTaskKey(unifiedTaskId: string) {
  return createTaskKey("media", 0, unifiedTaskId, undefined, unifiedTaskId);
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function isMissingTaskError(error: any) {
  const status = error?.status ?? error?.response?.status ?? error?.code;
  const message = [error?.message, error?.data?.message, error?.response?.data?.message].filter(Boolean).join(" ");
  return status === 404 || /task.*not found|not found.*task|任务不存在|数据不存在/i.test(message);
}

function unwrapResponseData(response: any) {
  return response?.data?.data ?? response?.data ?? response;
}

function parseJsonObject(value: unknown) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export default defineStore("taskCenter", () => {
  const tasks = shallowReactive(new Map<string, RuntimeTask>());
  const listeners = new Map<string, Set<TaskListener>>();
  const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const snapshotReconciliations = shallowReactive(new Map<string, TaskSnapshotWarning>());
  const requestControllers = new Set<AbortController>();
  const running = ref(false);
  const interacting = ref(false);
  const inFlightRequests = ref(0);
  const registeredListenerCount = ref(0);
  const pollCount = ref<Record<TaskDomain, number>>({
    flowImage: 0,
    assetImage: 0,
    assetPrompt: 0,
    storyboardImage: 0,
    video: 0,
    videoPrompt: 0,
    audioBind: 0,
    novelEvent: 0,
    scriptAssetExtraction: 0,
    media: 0,
  });
  const lastPollDuration = ref<Record<TaskDomain, number>>({
    flowImage: 0,
    assetImage: 0,
    assetPrompt: 0,
    storyboardImage: 0,
    video: 0,
    videoPrompt: 0,
    audioBind: 0,
    novelEvent: 0,
    scriptAssetExtraction: 0,
    media: 0,
  });
  const lastLongTask = ref(0);
  const transportMode = ref<TaskTransport>((localStorage.getItem(TRANSPORT_STORAGE_KEY) as TaskTransport) || "auto");
  const activeTransport = ref<"legacy-polling" | "unified-events">("legacy-polling");
  const activeProjectId = ref<number | null>(null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let refreshPromise: Promise<void> | null = null;
  let failureCount = 0;
  let flowImageCursor = 0;
  let unifiedProbeFinished = false;
  let unifiedSocket: Socket | null = null;
  let visibilityHandlerInstalled = false;
  let performanceObserver: PerformanceObserver | null = null;
  let projectScopeRevision = 0;

  const activeTasks = computed(() => Array.from(tasks.values()).filter((task) => ACTIVE_STATUSES.has(task.status)));
  const activeTaskCount = computed(() => activeTasks.value.length);
  const knownTasks = computed(() => Array.from(tasks.values()));
  const snapshotWarnings = computed(
    () =>
      new Map(
        Array.from(snapshotReconciliations.entries()).filter(
          ([, warning]) => warning.missingCount >= SNAPSHOT_MISSING_THRESHOLD,
        ),
      ),
  );
  const snapshotWarningCount = computed(() => snapshotWarnings.value.size);

  function buildSocketNamespaceUrl() {
    const configured = settingStore().baseUrl || "";
    try {
      const url = new URL(configured);
      const pathname = url.pathname.replace(/\/+$/, "");
      url.pathname = pathname.endsWith("/api") ? `${pathname}/socket/task` : `${pathname}/api/socket/task`;
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return `${configured.replace(/\/+$/, "")}/socket/task`;
    }
  }

  function normalizeTaskInput(task: Omit<RuntimeTask, "updatedAt"> & { updatedAt?: number }): RuntimeTask {
    const unifiedTaskId =
      task.unifiedTaskId ??
      (typeof task.taskId === "string" && !/^\d+$/.test(task.taskId) ? task.taskId : undefined);
    const legacyTaskId =
      task.legacyTaskId ??
      (typeof task.taskId === "number" || (typeof task.taskId === "string" && /^\d+$/.test(task.taskId)) ? task.taskId : undefined);
    const key = unifiedTaskId ? createTaskKey(task.domain, task.projectId, task.targetId, task.nodeId, unifiedTaskId) : task.key;
    return {
      ...task,
      key,
      unifiedTaskId,
      legacyTaskId,
      taskId: unifiedTaskId ?? legacyTaskId ?? task.taskId,
      source: task.source ?? "submit",
      updatedAt: task.updatedAt ?? Date.now(),
    };
  }

  function isNewerTaskEvent(current: RuntimeTask | undefined, next: Pick<RuntimeTask, "version" | "updatedAt">) {
    if (!current) return true;
    if (next.version !== undefined && current.version !== undefined) return next.version > current.version;
    if (next.version !== undefined && current.version === undefined) return true;
    if (next.version === undefined && current.version !== undefined) return false;
    return next.updatedAt >= current.updatedAt;
  }

  function notify(task: RuntimeTask) {
    listeners.get(task.key)?.forEach((listener) => listener(task));
  }

  function findTaskByKey(key: string) {
    const direct = tasks.get(key);
    if (direct) return direct;
    const [domain, projectId, targetId, nodeId] = key.split(":");
    return Array.from(tasks.values()).find(
      (task) =>
        task.unifiedTaskId === key ||
        String(task.taskId ?? "") === key ||
        (task.domain === domain &&
          String(task.projectId) === String(projectId) &&
          String(task.targetId) === String(targetId) &&
          (nodeId === undefined || task.nodeId === nodeId)),
    );
  }

  function setTask(task: RuntimeTask) {
    const current = tasks.get(task.key);
    if (!isNewerTaskEvent(current, task)) return current;
    const next = { ...current, ...task };
    tasks.set(next.key, next);
    if (TERMINAL_STATUSES.has(next.status)) snapshotReconciliations.delete(next.key);
    notify(next);
    if (TERMINAL_STATUSES.has(next.status)) scheduleCleanup(next.key);
    return next;
  }

  function updateTask(key: string, patch: Partial<RuntimeTask>) {
    const current = findTaskByKey(key);
    if (!current) return;
    return setTask({
      ...current,
      ...patch,
      key,
      updatedAt: patch.updatedAt ?? Date.now(),
    });
  }

  function scheduleCleanup(key: string) {
    const previous = cleanupTimers.get(key);
    if (previous) clearTimeout(previous);
    cleanupTimers.set(
      key,
      setTimeout(() => {
        if (!listeners.get(key)?.size && TERMINAL_STATUSES.has(tasks.get(key)?.status as TaskStatus)) {
          tasks.delete(key);
        }
        cleanupTimers.delete(key);
      }, TASK_RETENTION_MS),
    );
  }

  function registerTask(task: Omit<RuntimeTask, "updatedAt"> & { updatedAt?: number }, listener?: TaskListener) {
    const normalizedTask = normalizeTaskInput(task);
    const current = tasks.get(normalizedTask.key) ?? tasks.get(task.key);
    const preserveRuntimeState =
      current &&
      (((normalizedTask.unifiedTaskId || normalizedTask.taskId) !== undefined &&
        String(current.unifiedTaskId ?? current.taskId ?? "") === String(normalizedTask.unifiedTaskId ?? normalizedTask.taskId)) ||
        ((normalizedTask.unifiedTaskId === undefined && normalizedTask.taskId === undefined) && TERMINAL_STATUSES.has(current.status)));
    const next =
      setTask({
      ...normalizedTask,
      ...(preserveRuntimeState
        ? {
            status: current.status,
            result: current.result,
            reason: current.reason,
            source: current.source,
            version: current.version,
            updatedAt: current.updatedAt,
          }
        : { updatedAt: normalizedTask.updatedAt }),
    }) ?? normalizedTask;
    if (current && current.key !== next.key) {
      const oldListeners = listeners.get(current.key);
      if (oldListeners?.size) {
        const nextListeners = listeners.get(next.key) ?? new Set<TaskListener>();
        oldListeners.forEach((item) => nextListeners.add(item));
        listeners.set(next.key, nextListeners);
        listeners.delete(current.key);
      }
      tasks.delete(current.key);
    }
    if (listener) {
      const taskListeners = listeners.get(next.key) ?? new Set<TaskListener>();
      const previousSize = taskListeners.size;
      taskListeners.add(listener);
      listeners.set(next.key, taskListeners);
      registeredListenerCount.value += taskListeners.size - previousSize;
      listener(next);
    }
    if (ACTIVE_STATUSES.has(next.status)) start();
    adapterForCurrentTransport().register(next);
    return () => {
      if (!listener) return;
      const taskListeners = listeners.get(next.key);
      if (taskListeners?.delete(listener)) registeredListenerCount.value--;
      if (!taskListeners?.size) listeners.delete(next.key);
    };
  }

  function unregisterTask(key: string) {
    const task = findTaskByKey(key);
    const resolvedKey = task?.key ?? key;
    registeredListenerCount.value -= listeners.get(resolvedKey)?.size ?? 0;
    listeners.delete(resolvedKey);
    adapterForCurrentTransport().unregister(resolvedKey);
    snapshotReconciliations.delete(resolvedKey);
    if (!task || TERMINAL_STATUSES.has(task.status)) tasks.delete(resolvedKey);
  }

  function removeTask(key: string) {
    const resolvedKey = findTaskByKey(key)?.key ?? key;
    registeredListenerCount.value -= listeners.get(resolvedKey)?.size ?? 0;
    listeners.delete(resolvedKey);
    tasks.delete(resolvedKey);
    snapshotReconciliations.delete(resolvedKey);
    const cleanupTimer = cleanupTimers.get(resolvedKey);
    if (cleanupTimer) clearTimeout(cleanupTimer);
    cleanupTimers.delete(resolvedKey);
  }

  function getTask(key: string) {
    return findTaskByKey(key);
  }

  function getDomainTasks(domain: TaskDomain) {
    return activeTasks.value.filter((task) => task.domain === domain);
  }

  function getPollDelay() {
    if (typeof document !== "undefined" && document.hidden) return 30_000;
    const count = activeTaskCount.value;
    if (count > 20) return 8_000;
    if (count > 5) return 5_000;
    return 3_000;
  }

  function getFailureDelay() {
    return [5_000, 10_000, 20_000, 30_000][Math.min(Math.max(failureCount - 1, 0), 3)];
  }

  function schedule(delay = failureCount ? getFailureDelay() : getPollDelay()) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!running.value || (activeProjectId.value == null && activeTaskCount.value === 0)) return;
    timer = setTimeout(() => void runCycle(), delay);
  }

  async function trackedRequest<T>(domain: TaskDomain, request: (signal: AbortSignal) => Promise<T>) {
    const controller = new AbortController();
    requestControllers.add(controller);
    inFlightRequests.value++;
    const startedAt = performance.now();
    try {
      return await request(controller.signal);
    } finally {
      lastPollDuration.value = {
        ...lastPollDuration.value,
        [domain]: Math.round(performance.now() - startedAt),
      };
      pollCount.value = {
        ...pollCount.value,
        [domain]: pollCount.value[domain] + 1,
      };
      inFlightRequests.value--;
      requestControllers.delete(controller);
    }
  }

  function applyLegacyRecord(task: RuntimeTask, record: LegacyRecord) {
    let status = normalizeTaskStatus(record.status ?? record.state ?? record.promptState ?? record.audioBindState, task.status);
    if (task.domain === "novelEvent" && record.eventState !== undefined) {
      status = Number(record.eventState) === 0 ? "processing" : Number(record.eventState) === -1 ? "failed" : "completed";
    }
    updateTask(task.key, {
      status,
      result: normalizeTaskResult(record, mediaFallbackType(task.domain)),
      reason: record.reason ?? record.errorReason ?? record.promptErrorReason ?? record.message ?? "",
      source: "legacy",
      updatedAt: Number(record.updatedAt) || Date.now(),
    });
  }

  async function pollFlowImages(domainTasks: RuntimeTask[]) {
    const maxPerCycle = Math.min(domainTasks.length, LEGACY_BATCH_SIZE);
    const selected = Array.from({ length: maxPerCycle }, (_, offset) => domainTasks[(flowImageCursor + offset) % domainTasks.length]);
    flowImageCursor = (flowImageCursor + maxPerCycle) % domainTasks.length;
    const queues = chunk(selected, FLOW_IMAGE_CONCURRENCY);
    for (const queue of queues) {
      await Promise.all(
        queue.map(async (task) => {
          const legacyTaskId = task.legacyTaskId ?? task.taskId;
          if (!legacyTaskId) {
            updateTask(task.key, { status: "failed", reason: "Active image task is missing legacy taskId", source: "legacy" });
            return;
          }
          try {
            const response = await trackedRequest("flowImage", (signal) =>
              axios.post("/production/editImage/pollImageTask", { taskId: legacyTaskId }, { signal }),
            );
            applyLegacyRecord(task, (response as any)?.data ?? response);
          } catch (error) {
            if (isMissingTaskError(error)) {
              updateTask(task.key, { status: "failed", reason: (error as any)?.message || "Task not found", result: { text: (error as any)?.message } });
              return;
            }
            throw error;
          }
        }),
      );
    }
  }

  async function pollBatchedDomain(domain: Exclude<TaskDomain, "flowImage">, domainTasks: RuntimeTask[]) {
    if (!domainTasks.length) return;
    const groups = new Map<string, RuntimeTask[]>();
    domainTasks.forEach((task) => {
      const groupKey = `${task.projectId}:${task.scriptId ?? ""}`;
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), task]);
    });

    for (const groupTasks of groups.values()) {
      for (const taskBatch of chunk(groupTasks, LEGACY_BATCH_SIZE)) {
        const projectId = taskBatch[0].projectId;
        const scriptId = taskBatch[0].scriptId ?? 0;
        const ids = taskBatch.map((task) => task.targetId);
        let endpoint = "";
        let payload: Record<string, unknown> = {};
        if (domain === "assetImage") {
          endpoint = taskBatch.some((task) => task.targetType === "productionAsset") ? "/production/assets/pollingImage" : "/assets/pollingImageAssets";
          payload = { ids };
        } else if (domain === "storyboardImage") {
          endpoint = "/production/storyboard/pollingImage";
          payload = { ids };
        } else if (domain === "assetPrompt") {
          endpoint = "/assets/pollingPromptAssets";
          payload = { ids };
        } else if (domain === "audioBind") {
          endpoint = "/cornerScape/pollingAudio";
          payload = { ids };
        } else if (domain === "novelEvent") {
          endpoint = "/novel/getNovelEventState";
          payload = { ids };
        } else if (domain === "video") {
          endpoint = "/production/workbench/checkVideoStateList";
          payload = { projectId, scriptId, videoIds: ids };
        } else if (domain === "videoPrompt") {
          endpoint = "/production/workbench/checkVideoPrompt";
          payload = { projectId, scriptId, trackIds: ids };
        } else {
          continue;
        }
        const response = await trackedRequest(domain, (signal) => axios.post(endpoint, payload, { signal }));
        const rawRecords = (response as any)?.data?.data ?? (response as any)?.data ?? response;
        const records = (Array.isArray(rawRecords) ? rawRecords : rawRecords?.tasks ?? []) as LegacyRecord[];
        const taskIndex = new Map(taskBatch.map((task) => [String(task.targetId), task]));
        records.forEach((record) => {
          const task = taskIndex.get(String(record.id ?? record.targetId ?? record.assetsId));
          if (task) applyLegacyRecord(task, record);
        });
      }
    }
  }

  const legacyAdapter: TaskSourceAdapter = {
    start() {},
    stop() {},
    register() {},
    unregister() {},
    async refresh(domain) {
      const domains = domain ? [domain] : ALL_DOMAINS;
      for (const currentDomain of domains) {
        const domainTasks = getDomainTasks(currentDomain);
        if (!domainTasks.length) continue;
        if (currentDomain === "flowImage") await pollFlowImages(domainTasks);
        else await pollBatchedDomain(currentDomain, domainTasks);
      }
    },
  };

  function findTaskForEvent(event: TaskStatusEvent) {
    const domain = normalizeDomain(event.taskType, event.targetType, event.nodeId);
    const eventUnifiedKey = event.taskId ? createTaskKey(domain, event.projectId, event.targetId ?? event.taskId, event.nodeId, event.taskId) : "";
    return (
      (eventUnifiedKey ? tasks.get(eventUnifiedKey) : undefined) ??
      Array.from(tasks.values()).find(
        (item) =>
          item.projectId === Number(event.projectId) &&
          ((event.taskId && String(item.unifiedTaskId ?? item.taskId ?? "") === String(event.taskId)) ||
            (event.legacyTaskId !== undefined && String(item.legacyTaskId ?? "") === String(event.legacyTaskId)) ||
            (item.domain === domain && event.nodeId && item.nodeId === event.nodeId) ||
            (item.domain === domain && event.targetId !== undefined && String(item.targetId) === String(event.targetId))),
      )
    );
  }

  function applyUnifiedEvent(event: TaskStatusEvent, source: TaskSource = "socket") {
    const task = findTaskForEvent(event);
    const eventProjectId = Number(event.projectId);
    if (!task && source === "socket" && activeProjectId.value == null) return;
    if (!task && activeProjectId.value != null && eventProjectId !== activeProjectId.value) return;
    const updatedAt = Number(event.updatedAt) || Date.now();
    if (!task) {
      const domain = normalizeDomain(event.taskType, event.targetType, event.nodeId);
      const discovered = normalizeTaskInput({
        key: createTaskKey(domain, Number(event.projectId), event.targetId ?? event.taskId, event.nodeId, event.taskId),
        domain,
        taskId: event.taskId,
        unifiedTaskId: event.taskId,
        legacyTaskId: event.legacyTaskId,
        targetType: event.targetType,
        targetId: event.targetId ?? event.taskId,
        projectId: Number(event.projectId),
        scriptId: event.scriptId,
        nodeId: event.nodeId,
        status: normalizeTaskStatus(event.status),
        result: normalizeTaskResult(event.result ?? event, mediaFallbackType(domain)),
        reason: event.reason ?? "",
        phase: event.phase,
        progress: event.progress,
        version: event.version,
        source,
        updatedAt,
      });
      setTask(discovered);
      if (ACTIVE_STATUSES.has(discovered.status)) start();
      return;
    }
    snapshotReconciliations.delete(task.key);
    if (!isNewerTaskEvent(task, { version: event.version, updatedAt })) return;
    updateTask(task.key, {
      unifiedTaskId: event.taskId ?? task.unifiedTaskId,
      legacyTaskId: event.legacyTaskId ?? task.legacyTaskId,
      taskId: event.taskId ?? task.taskId,
      targetType: event.targetType ?? task.targetType,
      status: normalizeTaskStatus(event.status, task.status),
      result: normalizeTaskResult(event.result ?? event, mediaFallbackType(task.domain)),
      reason: event.reason ?? "",
      phase: event.phase ?? task.phase,
      progress: event.progress ?? task.progress,
      version: event.version ?? task.version,
      source,
      updatedAt,
    });
  }

  function normalizeTaskDetailRecord(task: RuntimeTask, detail: Record<string, any>): Partial<RuntimeTask> {
    const resultJson = parseJsonObject(detail.resultJson ?? detail.result_json);
    const result = detail.result ?? detail.resultData ?? detail.resultJson ?? resultJson;
    const updatedAt = Number(detail.updatedAt ?? detail.updateTime ?? detail.finishedAt ?? detail.createTime) || Date.now();
    return {
      unifiedTaskId: detail.taskId ?? detail.unifiedTaskId ?? task.unifiedTaskId,
      legacyTaskId: detail.legacyTaskId ?? detail.id ?? task.legacyTaskId,
      taskId: detail.taskId ?? detail.unifiedTaskId ?? task.taskId,
      targetType: detail.targetType ?? task.targetType,
      targetId: detail.targetId ?? task.targetId,
      scriptId: detail.scriptId ?? task.scriptId,
      nodeId: detail.nodeId ?? task.nodeId,
      status: normalizeTaskStatus(detail.status, task.status),
      result: normalizeTaskResult(result && typeof result === "object" ? result : resultJson, mediaFallbackType(task.domain)),
      reason: detail.reason ?? detail.errorReason ?? detail.message ?? "",
      phase: detail.phase ?? task.phase,
      progress: detail.progress ?? task.progress,
      version: detail.version ?? task.version,
      source: "snapshot",
      updatedAt,
    };
  }

  function reconcileSnapshotMissing(expectedTasks: RuntimeTask[], records: TaskStatusEvent[]) {
    const returnedIds = new Set(records.map((record) => String(record.taskId)));
    expectedTasks.forEach((task) => {
      if (!task.unifiedTaskId || returnedIds.has(String(task.unifiedTaskId))) {
        snapshotReconciliations.delete(task.key);
        return;
      }
      const previous = snapshotReconciliations.get(task.key);
      const missingCount = (previous?.missingCount ?? 0) + 1;
      snapshotReconciliations.set(task.key, {
        taskKey: task.key,
        missingCount,
        lastCheckedAt: Date.now(),
      });
    });
  }

  function startUnifiedSocket() {
    if (unifiedSocket) return;
    unifiedSocket = io(buildSocketNamespaceUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true,
      auth: { token: localStorage.getItem("token") },
    });
    unifiedSocket.on("connect", () => {
      if (running.value) {
        void refreshUnified().catch((error) => console.warn("[taskCenter] socket recovery sync failed", error));
      }
    });
    unifiedSocket.on("reconnect", () => {
      if (running.value) {
        void refreshUnified().catch((error) => console.warn("[taskCenter] socket reconnect sync failed", error));
      }
    });
    unifiedSocket.on("task:status", (event: TaskStatusEvent) => applyUnifiedEvent(event, "socket"));
  }

  async function refreshUnifiedTasks(tasksToRefresh: RuntimeTask[], scopeGuard?: ProjectScopeGuard) {
    const groups = new Map<string, RuntimeTask[]>();
    tasksToRefresh.forEach((task) => {
      if (!task.unifiedTaskId) return;
      const key = `${task.projectId}:${task.scriptId ?? ""}`;
      groups.set(key, [...(groups.get(key) ?? []), task]);
    });
    for (const group of groups.values()) {
      const response = await trackedRequest(group[0].domain, (signal) =>
        axios.post(
          "/task/status/snapshot",
          {
            projectId: group[0].projectId,
            scriptId: group[0].scriptId,
            taskIds: group.map((task) => task.unifiedTaskId!).filter(Boolean),
          },
          { signal, suppressNetworkErrorNotify: true } as any,
        ),
      );
      if (scopeGuard && (activeProjectId.value !== scopeGuard.projectId || projectScopeRevision !== scopeGuard.revision)) return;
      const snapshot = (response as any)?.data?.data ?? (response as any)?.data ?? response;
      const records = (Array.isArray(snapshot) ? snapshot : snapshot?.tasks ?? []) as TaskStatusEvent[];
      records.forEach((record: TaskStatusEvent) => applyUnifiedEvent(record, "snapshot"));
      reconcileSnapshotMissing(group, records);
    }
  }

  async function refreshUnified() {
    const projectId = activeProjectId.value;
    if (projectId != null) {
      await syncProjectTasks(projectId);
      return;
    }
    await refreshUnifiedTasks(activeTasks.value);
  }

  async function resyncTask(key: string) {
    const task = findTaskByKey(key);
    const taskId = task?.unifiedTaskId ?? (typeof task?.taskId === "string" ? task.taskId : undefined);
    if (!task || !taskId) throw new Error("Task cannot be synced without unified taskId");
    try {
      const response = await axios.post("/task/taskDetails", { taskId });
      const data = unwrapResponseData(response);
      const detail = (data?.task ?? data?.detail ?? data) as Record<string, any>;
      if (!detail || typeof detail !== "object") throw new Error("Task detail response is empty");
      updateTask(task.key, normalizeTaskDetailRecord(task, detail));
      snapshotReconciliations.delete(task.key);
    } catch (error) {
      if (isMissingTaskError(error)) {
        const previous = snapshotReconciliations.get(task.key);
        snapshotReconciliations.set(task.key, {
          taskKey: task.key,
          missingCount: Math.max(previous?.missingCount ?? 0, SNAPSHOT_MISSING_THRESHOLD),
          lastCheckedAt: Date.now(),
        });
        return;
      }
      throw error;
    }
  }

  async function syncProjectTasks(projectId: number, scriptId?: number) {
    if (!projectId) return;
    const scopeRevision = activeProjectId.value === projectId ? projectScopeRevision : null;
    const response = await trackedRequest("media", (signal) =>
      axios.post(
        "/task/status/snapshot",
        {
          projectId,
          ...(scriptId != null ? { scriptId } : {}),
        },
        { signal, suppressNetworkErrorNotify: true } as any,
      ),
    );
    if (scopeRevision != null && (scopeRevision !== projectScopeRevision || activeProjectId.value !== projectId)) return;
    const snapshot = (response as any)?.data?.data ?? (response as any)?.data ?? response;
    const records = (Array.isArray(snapshot) ? snapshot : snapshot?.tasks ?? []) as TaskStatusEvent[];
    records
      .filter((record) => Number(record.projectId) === projectId)
      .forEach((record) => applyUnifiedEvent(record, "snapshot"));

    const knownProjectTasks = activeTasks.value.filter(
      (task) =>
        task.projectId === projectId &&
        (scriptId == null || task.scriptId === scriptId) &&
        Boolean(task.unifiedTaskId),
    );
    await refreshUnifiedTasks(
      knownProjectTasks,
      scopeRevision == null ? undefined : { projectId, revision: scopeRevision },
    );
  }

  const unifiedAdapter: TaskSourceAdapter = {
    start: startUnifiedSocket,
    stop() {
      unifiedSocket?.disconnect();
      unifiedSocket = null;
    },
    register() {},
    unregister() {},
    refresh: refreshUnified,
  };

  function adapterForCurrentTransport() {
    return activeTransport.value === "unified-events" ? unifiedAdapter : legacyAdapter;
  }

  async function resolveTransport() {
    if (transportMode.value === "legacy-polling") {
      activeTransport.value = "legacy-polling";
      return;
    }
    if (transportMode.value === "unified-events") {
      activeTransport.value = "unified-events";
      unifiedAdapter.start();
      return;
    }
    if (unifiedProbeFinished) return;
    unifiedProbeFinished = true;
    try {
      await refreshUnified();
      activeTransport.value = "unified-events";
      unifiedAdapter.start();
    } catch {
      activeTransport.value = "legacy-polling";
    }
  }

  async function refresh(domain?: TaskDomain) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      await resolveTransport();
      await adapterForCurrentTransport().refresh(domain);
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  async function runCycle() {
    timer = null;
    if (!running.value || (activeProjectId.value == null && activeTaskCount.value === 0)) return;
    if (interacting.value && !(typeof document !== "undefined" && document.hidden)) {
      schedule(500);
      return;
    }
    try {
      await refresh();
      failureCount = 0;
    } catch (error) {
      if ((error as any)?.name !== "CanceledError" && (error as any)?.name !== "AbortError") {
        failureCount++;
        console.warn("[taskCenter] refresh failed", error);
      }
    } finally {
      schedule();
    }
  }

  function installGlobalHandlers() {
    if (visibilityHandlerInstalled || typeof document === "undefined") return;
    visibilityHandlerInstalled = true;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    if (import.meta.env.DEV && typeof PerformanceObserver !== "undefined") {
      try {
        performanceObserver = new PerformanceObserver((list) => {
          const latest = list.getEntries().at(-1);
          if (latest) lastLongTask.value = Math.round(latest.duration);
        });
        performanceObserver.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
      } catch {}
    }
  }

  function handleVisibilityChange() {
    if (!running.value || (activeProjectId.value == null && activeTaskCount.value === 0)) return;
    if (timer) clearTimeout(timer);
    timer = null;
    if (document.hidden) schedule(30_000);
    else void runCycle();
  }

  function handleOnline() {
    if (running.value && (activeProjectId.value != null || activeTaskCount.value > 0)) void runCycle();
  }

  function clearProjectTasks(projectId: number) {
    Array.from(tasks.values())
      .filter((task) => task.projectId === projectId)
      .forEach((task) => removeTask(task.key));
  }

  function clearTasksOutsideProject(projectId: number) {
    Array.from(tasks.values())
      .filter((task) => task.projectId > 0 && task.projectId !== projectId)
      .forEach((task) => removeTask(task.key));
  }

  async function activateProjectScope(projectId: number) {
    const nextProjectId = Number(projectId);
    if (!Number.isFinite(nextProjectId) || nextProjectId <= 0) {
      deactivateProjectScope();
      return;
    }

    const previousProjectId = activeProjectId.value;
    if (previousProjectId !== nextProjectId) {
      projectScopeRevision++;
      activeProjectId.value = nextProjectId;
      clearTasksOutsideProject(nextProjectId);
    }

    start();
    await syncProjectTasks(nextProjectId);
  }

  function deactivateProjectScope() {
    const previousProjectId = activeProjectId.value;
    projectScopeRevision++;
    activeProjectId.value = null;
    stop();
    if (previousProjectId != null) clearProjectTasks(previousProjectId);
  }

  function start() {
    installGlobalHandlers();
    if (running.value) {
      if (!timer && !refreshPromise) schedule(0);
      return;
    }
    running.value = true;
    adapterForCurrentTransport().start();
    schedule(0);
  }

  function stop() {
    running.value = false;
    if (timer) clearTimeout(timer);
    timer = null;
    adapterForCurrentTransport().stop();
    requestControllers.forEach((controller) => controller.abort());
    requestControllers.clear();
  }

  function beginInteraction() {
    interacting.value = true;
  }

  function endInteraction() {
    interacting.value = false;
    if (running.value && (activeProjectId.value != null || activeTaskCount.value > 0)) {
      if (timer) clearTimeout(timer);
      timer = null;
      schedule(0);
    }
  }

  function setTransport(mode: TaskTransport) {
    stop();
    transportMode.value = mode;
    localStorage.setItem(TRANSPORT_STORAGE_KEY, mode);
    unifiedProbeFinished = false;
    activeTransport.value = mode === "unified-events" ? "unified-events" : "legacy-polling";
    if (activeProjectId.value != null || activeTaskCount.value > 0) start();
  }

  async function cancelTask(key: string) {
    const task = findTaskByKey(key);
    const taskId = task?.unifiedTaskId ?? (typeof task?.taskId === "string" ? task.taskId : undefined);
    if (!task || !taskId) throw new Error("Task cannot be cancelled without unified taskId");
    try {
      const response = await axios.post("/task/cancel", { taskId });
      const data = (response as any)?.data ?? response;
      updateTask(task.key, {
        status: normalizeTaskStatus(data?.status, "cancelled"),
        reason: data?.message ?? "",
        result: data,
        source: "snapshot",
        version: task.version !== undefined ? task.version + 1 : undefined,
        updatedAt: Date.now(),
      });
      snapshotReconciliations.delete(task.key);
      return data;
    } catch (error: any) {
      const status = error?.status ?? error?.response?.status ?? error?.code;
      if (status === 409) {
        throw new Error(error?.message || "任务已提交供应商，无法安全取消");
      }
      throw error;
    }
  }

  async function getRuntimeDiagnostics() {
    const response = await axios.post("/diagnostics/runtime/status", {});
    return (response as any)?.data ?? response;
  }

  function dispose() {
    activeProjectId.value = null;
    projectScopeRevision++;
    stop();
    tasks.clear();
    listeners.clear();
    snapshotReconciliations.clear();
    registeredListenerCount.value = 0;
    cleanupTimers.forEach((cleanupTimer) => clearTimeout(cleanupTimer));
    cleanupTimers.clear();
    if (visibilityHandlerInstalled && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      visibilityHandlerInstalled = false;
    }
    performanceObserver?.disconnect();
    performanceObserver = null;
  }

  onScopeDispose(stop);

  return {
    tasks,
    knownTasks,
    snapshotWarnings,
    snapshotWarningCount,
    activeTasks,
    activeTaskCount,
    activeProjectId,
    running,
    interacting,
    inFlightRequests,
    registeredListenerCount,
    pollCount,
    lastPollDuration,
    lastLongTask,
    transportMode,
    activeTransport,
    registerTask,
    unregisterTask,
    removeTask,
    getTask,
    updateTask,
    cancelTask,
    resyncTask,
    syncProjectTasks,
    activateProjectScope,
    deactivateProjectScope,
    getRuntimeDiagnostics,
    refresh,
    start,
    stop,
    beginInteraction,
    endInteraction,
    setTransport,
    dispose,
  };
});
