import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat, type XmlTagEvent } from "@/utils/useChat";
import type {
  DeriveAsset,
  DirectorPlanGenerationState,
  FlowData,
  Storyboard,
  StoryboardGenerationLastFailure,
  StoryboardTableMeta,
} from "@/views/production/utils/flowBuilder";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { attachLegacyMediaFields, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type { MediaRef } from "@/types/api";
import type { Ref, WatchStopHandle } from "vue";

type ProductionChat = ReturnType<typeof useChat>;

export type ProductionAgentRunStatus = "running" | "awaiting_user" | "completed" | "failed" | "cancelled" | "interrupted";

export interface ProductionAgentRun {
  runId: string;
  status: ProductionAgentRunStatus;
  currentStage: string | null;
  currentSubAgent: string | null;
  reason: string | null;
}

export interface FullTextAssetMeta {
  id: number;
  size: number;
  summary: string | null;
  targetType: string;
}

export interface AgentMemoryExt {
  fullTextAsset?: FullTextAssetMeta;
  fullTextAssets?: FullTextAssetMeta[];
  [key: string]: unknown;
}

export interface AgentRunTimelineItem {
  id: number;
  eventType: string;
  kind: string;
  createdAt: number;
  stage: string | null;
  subAgent: string | null;
  status: string | null;
  title: string | null;
  detail: string | null;
  phase: string | null;
  fullTextAsset: FullTextAssetMeta | null;
  payload: unknown;
}

export interface AgentRunDetail {
  run: ProductionAgentRun | null;
  timeline: AgentRunTimelineItem[];
}

export interface AgentBusinessProgress {
  title: string;
  detail: string | null;
  phase: string | null;
  stage: string | null;
  subAgent: string | null;
  createdAt: number;
}

interface ProductionAgentRunStatusPayload {
  serverTime?: number;
  activeRun?: unknown;
  latestRun?: unknown;
}

interface ProductionAgentRunUpdatePayload {
  agentKey?: string;
  projectId?: number | string;
  scriptId?: number | string;
  serverTime?: number;
  status?: ProductionAgentRunStatus;
  run?: unknown;
  rejected?: boolean;
  activeRun?: unknown;
  reason?: string | null;
  terminalPersistenceFailed?: boolean;
}

interface EpisodeSession {
  episodeId: number;
  isolationKey: string;
  flowData: Ref<FlowData>;
  loadingHistory: Ref<boolean>;
  thinkLevel: Ref<number>;
  activeRun: Ref<ProductionAgentRun | null>;
  latestRun: Ref<ProductionAgentRun | null>;
  runStatusLoading: Ref<boolean>;
  runStatusError: Ref<string>;
  runtimeNotice: Ref<string>;
  runtimeRestartRunId: string | null;
  runDetail: Ref<AgentRunDetail | null>;
  runTimeline: Ref<AgentRunTimelineItem[]>;
  runDetailLoading: Ref<boolean>;
  runDetailError: Ref<string>;
  submitting: Ref<boolean>;
  chatApi: ProductionChat;
  stopSocketWatch: WatchStopHandle;
  assetTaskBindings: Map<number, () => void>;
  storyboardTaskBindings: Map<number, () => void>;
  historyRequestId: number;
  historyReconcileId: number;
  flowRequestId: number;
  runStatusRequestId: number;
  runDetailRequestId: number;
  recoveryRequestId: number;
  runServerTime: number;
  recoveryPromise: Promise<void> | null;
  submissionSyncTimer: ReturnType<typeof setTimeout> | null;
  runStatusPollTimer: ReturnType<typeof setInterval> | null;
  runStatusPollRunId: string | null;
  runStatusPollInFlight: boolean;
  terminalRunKeys: Set<string>;
  contentSavePromise: Promise<void>;
  flowRefreshPromise: Promise<void> | null;
  completedMessageIds: Set<string>;
  storyboardFailureNoticeKeys: Set<string>;
}

interface ProductionAssetTaskBinding {
  projectId: number;
  episodeId: number;
  assetId: number;
  taskId: string;
  unifiedTaskId?: string;
  legacyTaskId?: number;
  imageId?: number;
  flowId?: number;
  nodeId?: string | null;
  createdAt: number;
}

interface ProductionAssetBatchTask {
  assetId: number | string;
  taskId?: string | number | null;
  unifiedTaskId?: string | null;
  legacyTaskId?: number | string | null;
  imageId?: number;
  flowId?: number;
  nodeId?: string | null;
  status?: string;
  state?: string;
  prompt?: string;
  model?: string;
  quality?: string;
  ratio?: string;
}

interface ProductionAssetBatchError {
  assetId: number | string;
  error?: string;
  message?: string;
}

interface ProductionAssetBatchResult {
  total: number;
  successCount: number;
  failedCount: number;
  tasks: ProductionAssetBatchTask[];
  errors: ProductionAssetBatchError[];
}

const CHAT_TERMINAL_STATUSES = new Set(["complete", "error", "stop"]);
const HISTORY_RECONCILE_MAX_ATTEMPTS = 20;
const HISTORY_RECONCILE_RETRY_DELAY_MS = 3_000;
const HISTORY_RECONCILE_TEXT_TAIL_LENGTH = 80;
const HISTORY_RECONCILE_MIN_TEXT_LENGTH = 120;
const PRODUCTION_ASSET_TASK_TTL_MS = 24 * 60 * 60 * 1000;
const PRODUCTION_AGENT_KEY = "productionAgent";
const RUN_STATUS_SYNC_DELAY_MS = 3_000;
const RUN_STATUS_POLL_INTERVAL_MS = 5_000;
const SOCKET_READY_TIMEOUT_MS = 10_000;
const CONTEXT_ACK_TIMEOUT_MS = 5_000;
const RUN_STATUSES = new Set<ProductionAgentRunStatus>(["running", "awaiting_user", "completed", "failed", "cancelled", "interrupted"]);

function normalizeProductionAgentRun(value: unknown): ProductionAgentRun | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const status = source.status;
  if (typeof status !== "string" || !RUN_STATUSES.has(status as ProductionAgentRunStatus)) return null;
  const runId = source.runId ?? source.run_id;
  if (runId == null || String(runId).trim() === "") return null;
  return {
    runId: String(runId),
    status: status as ProductionAgentRunStatus,
    currentStage: (source.currentStage ?? source.current_stage) == null ? null : String(source.currentStage ?? source.current_stage),
    currentSubAgent: (source.currentSubAgent ?? source.current_sub_agent) == null ? null : String(source.currentSubAgent ?? source.current_sub_agent),
    reason: source.reason == null || String(source.reason).trim() === "" ? null : String(source.reason),
  };
}

function normalizeFullTextAssetMeta(value: unknown): FullTextAssetMeta | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = Number(source.id ?? source.textAssetId ?? source.text_asset_id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    size: Number(source.size) || 0,
    summary: source.summary == null || String(source.summary).trim() === "" ? null : String(source.summary),
    targetType: String(source.targetType ?? source.target_type ?? "text"),
  };
}

function normalizeRunTimeline(value: unknown): AgentRunTimelineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const payload = item.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? (item.payload as Record<string, unknown>) : {};
      const kind = String(item.kind ?? "event");
      const fullTextAsset =
        kind === "agent_output_archived"
          ? normalizeFullTextAssetMeta({
              id: payload.textAssetId ?? payload.text_asset_id,
              size: payload.size,
              summary: payload.summary,
              targetType: "agentOutput",
            })
          : null;
      return {
        id: Number(item.id) || index,
        eventType: String(item.eventType ?? item.event_type ?? "event"),
        kind,
        createdAt: Number(item.createdAt ?? item.created_at ?? 0) || 0,
        stage: item.stage == null ? null : String(item.stage),
        subAgent: item.subAgent == null && item.sub_agent == null ? null : String(item.subAgent ?? item.sub_agent),
        status: item.status == null ? null : String(item.status),
        title: payload.title == null || String(payload.title).trim() === "" ? null : String(payload.title),
        detail: payload.detail == null || String(payload.detail).trim() === "" ? null : String(payload.detail),
        phase: payload.phase == null || String(payload.phase).trim() === "" ? null : String(payload.phase),
        fullTextAsset,
        payload: item.payload,
      };
    })
    .sort((left, right) => left.createdAt - right.createdAt || left.id - right.id);
}

function normalizeAgentRunDetail(value: unknown): AgentRunDetail {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    run: normalizeProductionAgentRun(source.run ?? source),
    timeline: normalizeRunTimeline(source.timeline),
  };
}

function productionAssetTaskStorageKey(projectId: number, episodeId: number) {
  return `productionAssetTasks:${projectId}:${episodeId}`;
}

function readProductionAssetTaskBindings(projectId: number, episodeId: number): ProductionAssetTaskBinding[] {
  const key = productionAssetTaskStorageKey(projectId, episodeId);
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) throw new Error("invalid production asset task cache");
    const now = Date.now();
    const bindings = parsed.filter(
      (item): item is ProductionAssetTaskBinding =>
        Number(item?.projectId) === projectId &&
        Number(item?.episodeId) === episodeId &&
        Number.isFinite(Number(item?.assetId)) &&
        typeof item?.taskId === "string" &&
        Boolean(item.taskId) &&
        Number.isFinite(Number(item?.createdAt)) &&
        now - Number(item.createdAt) <= PRODUCTION_ASSET_TASK_TTL_MS,
    );
    if (bindings.length !== parsed.length) {
      if (bindings.length) localStorage.setItem(key, JSON.stringify(bindings));
      else localStorage.removeItem(key);
    }
    return bindings;
  } catch {
    localStorage.removeItem(key);
    return [];
  }
}

function writeProductionAssetTaskBindings(projectId: number, episodeId: number, bindings: ProductionAssetTaskBinding[]) {
  const key = productionAssetTaskStorageKey(projectId, episodeId);
  try {
    if (bindings.length) localStorage.setItem(key, JSON.stringify(bindings));
    else localStorage.removeItem(key);
  } catch (error) {
    console.warn("[productionAgent] failed to persist asset task bindings", error);
  }
}

function upsertProductionAssetTaskBinding(binding: ProductionAssetTaskBinding) {
  const bindings = readProductionAssetTaskBindings(binding.projectId, binding.episodeId).filter((item) => item.assetId !== binding.assetId);
  bindings.push(binding);
  writeProductionAssetTaskBindings(binding.projectId, binding.episodeId, bindings);
}

function removeProductionAssetTaskBinding(projectId: number, episodeId: number, assetId: number, taskId?: string) {
  const bindings = readProductionAssetTaskBindings(projectId, episodeId);
  const next = bindings.filter((item) => item.assetId !== assetId || (taskId !== undefined && item.taskId !== taskId));
  if (next.length !== bindings.length) writeProductionAssetTaskBindings(projectId, episodeId, next);
}

function normalizeNumericIds(ids: unknown): number[] {
  const values = Array.isArray(ids) ? ids : [ids];
  return Array.from(
    new Set(
      values
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
}

function normalizeBatchGenerateAssetsResult(value: any): ProductionAssetBatchResult {
  const result = value?.tasks || value?.errors ? value : value?.data;
  const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  return {
    total: Number(result?.total ?? tasks.length + errors.length),
    successCount: Number(result?.successCount ?? tasks.length),
    failedCount: Number(result?.failedCount ?? errors.length),
    tasks,
    errors,
  };
}

function getBatchAssetErrorMessage(error: ProductionAssetBatchError) {
  return error.error || error.message || "衍生资产生成任务创建失败";
}

function createEmptyFlowData(): FlowData {
  return {
    script: "",
    scriptPlan: "",
    directorPlanGeneration: {
      current: null,
      lastFailure: null,
    },
    storyboardTable: "",
    storyboardTableMeta: undefined,
    storyboardGenerationLastFailure: null,
    assets: [],
    storyboard: [],
    workbench: {
      videoList: [],
    },
  };
}

function cloneDefaultMessages(messages: ChatMessagesData[]) {
  return structuredClone(messages) as ChatMessagesData[];
}

function normalizeHistoryMessages(messages: unknown): ChatMessagesData[] {
  if (!Array.isArray(messages)) return [];
  return structuredClone(messages)
    .map((message: any) => ({
      ...message,
      createTime: Number(message?.createTime ?? new Date(message?.datetime ?? 0).getTime()) || 0,
      status: "complete",
      ext: normalizeAgentMemoryExt(message?.ext),
      content: Array.isArray(message?.content)
        ? message.content.map((content: any) => ({
            ...content,
            status: "complete",
            ext: normalizeAgentMemoryExt(content?.ext),
          }))
        : [],
    }))
    .sort((left: any, right: any) => Number(left.createTime) - Number(right.createTime) || Number(left.id) - Number(right.id)) as ChatMessagesData[];
}

function normalizeAgentMemoryExt(value: unknown): AgentMemoryExt | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const assets = [source.fullTextAsset, ...(Array.isArray(source.fullTextAssets) ? source.fullTextAssets : [])]
    .map(normalizeFullTextAssetMeta)
    .filter((item): item is FullTextAssetMeta => Boolean(item));
  const uniqueAssets = Array.from(new Map(assets.map((item) => [item.id, item])).values());
  if (!uniqueAssets.length) return { ...source };
  return { ...source, fullTextAsset: uniqueAssets[0], fullTextAssets: uniqueAssets };
}

function isLiveGenerationMessage(message: any) {
  if (message?.role !== "assistant") return false;
  if (message.status === "pending" || message.status === "streaming") return true;
  return Array.isArray(message.content) && message.content.some((content: any) => content?.status === "pending" || content?.status === "streaming");
}

function getLiveGenerationMessageIds(messages: ChatMessagesData[]) {
  return messages
    .filter(isLiveGenerationMessage)
    .map((message: any) => (message?.id == null ? "" : String(message.id)))
    .filter(Boolean);
}

function hasLiveGenerationMessage(messages: ChatMessagesData[]) {
  return getLiveGenerationMessageIds(messages).length > 0;
}

function completeLiveGenerationMessages(messages: ChatMessagesData[]) {
  let changed = false;
  messages.forEach((message: any) => {
    if (message?.role !== "assistant") return;
    if (message.status === "pending" || message.status === "streaming") {
      message.status = "complete";
      changed = true;
    }
    if (!Array.isArray(message.content)) return;
    message.content.forEach((content: any) => {
      if (content?.status !== "pending" && content?.status !== "streaming") return;
      content.status = "complete";
      changed = true;
    });
  });
  return changed;
}

function isTerminalHistoryMessage(message: any) {
  if (message?.role !== "assistant") return false;
  if (CHAT_TERMINAL_STATUSES.has(String(message.status))) return true;
  const content = Array.isArray(message.content) ? message.content : [];
  if (message.status === "pending" || message.status === "streaming") return false;
  if (content.some((item: any) => item?.status === "pending" || item?.status === "streaming")) return false;
  return content.length > 0;
}

function extractContentText(content: any): string {
  const data = content?.data;
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  return [data.text, data.content, data.markdown, data.title, data.message].filter((value) => typeof value === "string").join("\n");
}

function extractMessageText(message: any): string {
  const content = Array.isArray(message?.content) ? message.content : [];
  return content.map(extractContentText).filter(Boolean).join("\n").replace(/\s+/g, " ").trim();
}

function findTerminalHistoryMessage(messages: unknown, messageIds: string[], liveMessages: ChatMessagesData[]) {
  if (!Array.isArray(messages)) return undefined;
  const idSet = new Set(messageIds);
  const terminalMessages = messages.filter(isTerminalHistoryMessage);
  const idMatched = terminalMessages.find((message: any) => idSet.has(String(message?.id)));
  if (idMatched) return idMatched;

  const liveTails = liveMessages
    .map(extractMessageText)
    .filter((text) => text.length >= HISTORY_RECONCILE_MIN_TEXT_LENGTH)
    .map((text) => text.slice(-HISTORY_RECONCILE_TEXT_TAIL_LENGTH));
  if (!liveTails.length) return undefined;
  return terminalMessages.find((message: any) => {
    const historyText = extractMessageText(message);
    return liveTails.some((tail) => historyText.includes(tail));
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function extractFullTextAssetId(text: unknown): number | undefined {
  if (typeof text !== "string") return undefined;
  const match = text.match(/full\s+text\s+asset\s*:\s*(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function countStoryboardTableRows(text: unknown) {
  if (typeof text !== "string") return 0;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|") && !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line)).length;
}

function normalizeStoryboardTableMeta(meta: any, storyboardTable: unknown): StoryboardTableMeta | undefined {
  if (!meta || typeof meta !== "object") {
    const textAssetId = extractFullTextAssetId(storyboardTable);
    return textAssetId
      ? {
          source: "draft",
          rowCount: 0,
          complete: false,
          textAssetId,
        }
      : undefined;
  }

  const textAssetId = Number(meta.textAssetId ?? meta.text_asset_id ?? extractFullTextAssetId(storyboardTable));
  return {
    source: meta.source === "structured" || meta.source === "draft" || meta.source === "empty" ? meta.source : "draft",
    rowCount: Number(meta.rowCount ?? meta.row_count ?? 0),
    readyCount: Number(meta.readyCount ?? meta.ready_count ?? 0),
    draftCount: Number(meta.draftCount ?? meta.draft_count ?? 0),
    legacyCount: Number(meta.legacyCount ?? meta.legacy_count ?? 0),
    complete: meta.complete == null ? undefined : Boolean(meta.complete),
    hash: meta.hash == null ? undefined : String(meta.hash),
    ...(Number.isFinite(textAssetId) && textAssetId > 0 ? { textAssetId } : {}),
  };
}

function normalizeFactStatus(value: unknown) {
  return value === "ready" || value === "draft" || value === "legacy" ? value : "legacy";
}

function normalizeStoryboardGenerationLastFailure(value: any): StoryboardGenerationLastFailure | null {
  if (!value || typeof value !== "object") return null;
  const state = value.state === "invalid" || value.state === "failed" ? value.state : null;
  if (!state) return null;
  const updatedAt = Number(value.updatedAt ?? value.updated_at ?? 0);
  return {
    generationId: String(value.generationId ?? value.generation_id ?? ""),
    state,
    expectedRowCount: Number(value.expectedRowCount ?? value.expected_row_count ?? 0),
    errorJson: value.errorJson == null ? undefined : String(value.errorJson),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeDirectorPlanGeneration(value: any): DirectorPlanGenerationState {
  const current = value?.current && typeof value.current === "object" ? value.current : null;
  const lastFailure = value?.lastFailure ?? value?.last_failure;
  return {
    current: current
      ? {
          generationId: String(current.generationId ?? current.generation_id ?? ""),
          state: String(current.state ?? ""),
          textAssetId: normalizeNullableNumber(current.textAssetId ?? current.text_asset_id),
          version: normalizeNullableNumber(current.version),
          updatedAt: Number(current.updatedAt ?? current.updated_at ?? 0) || 0,
        }
      : null,
    lastFailure:
      lastFailure && typeof lastFailure === "object"
        ? {
            generationId: String(lastFailure.generationId ?? lastFailure.generation_id ?? ""),
            state: String(lastFailure.state ?? ""),
            errorJson: lastFailure.errorJson ?? lastFailure.error_json ?? null,
            updatedAt: Number(lastFailure.updatedAt ?? lastFailure.updated_at ?? 0) || 0,
          }
        : null,
  };
}

type StoryboardCommitResult =
  | { status: "committed"; rowCount?: number; groupCount?: number; revision?: number }
  | { status: "invalid"; issues?: Array<{ index?: number; field?: string; message?: string }> }
  | { status: "failed"; error?: { message?: string; code?: string } };

type DirectorPlanCommitResult =
  | { status: "committed"; generationId?: string; textAssetId?: number; version?: number }
  | { status: "invalid" | "failed"; generationId?: string; errorJson?: string; error?: { message?: string; code?: string } };

function isDirectorPlanCommitResult(value: any): value is DirectorPlanCommitResult {
  return (
    (value?.status === "committed" || value?.status === "invalid" || value?.status === "failed") &&
    (value?.generationId !== undefined || value?.generation_id !== undefined || value?.textAssetId !== undefined || value?.text_asset_id !== undefined)
  );
}

function isStoryboardCommitResult(value: any): value is StoryboardCommitResult {
  if (isDirectorPlanCommitResult(value)) return false;
  return value?.status === "committed" || value?.status === "invalid" || value?.status === "failed";
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function extractStoryboardCommitResult(value: any): StoryboardCommitResult | undefined {
  if (!value) return undefined;
  if (isStoryboardCommitResult(value)) return value;
  const parsed = parseMaybeJson(value);
  if (parsed && parsed !== value) return extractStoryboardCommitResult(parsed);
  if (typeof value !== "object") return undefined;

  for (const key of ["result", "data", "commitResult", "storyboardCommitResult"]) {
    const found = extractStoryboardCommitResult(value[key]);
    if (found) return found;
  }
  return undefined;
}

function extractDirectorPlanCommitResult(value: any): DirectorPlanCommitResult | undefined {
  if (!value) return undefined;
  if (isDirectorPlanCommitResult(value)) return value;
  const parsed = parseMaybeJson(value);
  if (parsed && parsed !== value) return extractDirectorPlanCommitResult(parsed);
  if (typeof value !== "object") return undefined;

  for (const key of ["result", "data", "commitResult", "directorPlanCommitResult", "directorPlanResult"]) {
    const found = extractDirectorPlanCommitResult(value[key]);
    if (found) return found;
  }
  return undefined;
}

function commitResultFromThinkingTitle(title: unknown): StoryboardCommitResult | undefined {
  if (typeof title !== "string") return undefined;
  if (title === "storyboard table committed") return { status: "committed" };
  if (title === "storyboard table validation failed") return { status: "invalid" };
  if (title === "storyboard table commit failed") return { status: "failed" };
  return undefined;
}

function storyboardFailureNoticeKey(failure: StoryboardGenerationLastFailure) {
  return `${failure.generationId || "unknown"}:${failure.state}:${failure.updatedAt || 0}`;
}

function storyboardFailureMessage(failure: StoryboardGenerationLastFailure) {
  if (failure.state === "invalid") return "分镜表校验失败，请重新生成或检查分镜字段。";
  try {
    const error = failure.errorJson ? JSON.parse(failure.errorJson) : undefined;
    if (typeof error?.message === "string" && error.message.trim()) return error.message;
  } catch {}
  return "分镜表提交失败，请稍后重试。";
}

function directorPlanFailureMessage(errorJson?: string | null, fallback?: string) {
  if (fallback) return fallback;
  try {
    const error = errorJson ? JSON.parse(errorJson) : undefined;
    if (typeof error?.message === "string" && error.message.trim()) return error.message;
    if (Array.isArray(error?.issues) && error.issues.length) {
      const summary = error.issues
        .map((issue: any) => issue?.message || issue?.field || "")
        .filter(Boolean)
        .slice(0, 3)
        .join("；");
      if (summary) return summary;
    }
  } catch {}
  return errorJson || "导演规划提交失败，请稍后重试。";
}

function makeProductionAgentStore(projectId: string) {
  return defineStore(`productionAgent-${projectId}`, () => {
    const defMsg: ChatMessagesData[] = [
      {
        id: "welcome",
        role: "assistant",
        content: [
          { type: "text", status: "complete", data: $t("workbench.production.chatBox.welcomeMessage") },
          {
            type: "suggestion",
            status: "complete",
            data: [{ title: $t("workbench.production.chatBox.startMakingVideo"), prompt: $t("workbench.production.chatBox.startMakingVideoPrompt") }],
          },
        ],
      },
    ];

    const episodesId = ref<number>();
    const sessions = new Map<number, EpisodeSession>();
    const fallbackFlowData = ref<FlowData>(createEmptyFlowData());
    const taskCenter = useTaskCenterStore();

    watch(
      () => episodesId.value,
      (_nextEpisodeId, previousEpisodeId) => {
        if (!previousEpisodeId) return;
        const previousSession = sessions.get(previousEpisodeId);
        if (previousSession) stopRunStatusPoll(previousSession);
      },
    );

    function getContext(scriptId: number) {
      return {
        isolationKey: `${projectId}:productionAgent:${scriptId}`,
        projectId,
        scriptId,
      };
    }

    function normalizeAssetLike<T extends Record<string, any>>(item: T): T {
      const media = normalizeMediaRef(item.media ?? item, "image");
      return attachLegacyMediaFields(item, media);
    }

    function normalizeFlowData(data: FlowData): FlowData {
      const storyboardTable = data?.storyboardTable ?? "";
      const storyboardTableMeta = normalizeStoryboardTableMeta((data as any)?.storyboardTableMeta, storyboardTable);
      const storyboardGenerationLastFailure = normalizeStoryboardGenerationLastFailure((data as any)?.storyboardGenerationLastFailure);
      const directorPlanGeneration = normalizeDirectorPlanGeneration((data as any)?.directorPlanGeneration);
      return {
        ...createEmptyFlowData(),
        ...(data ?? {}),
        storyboardTable,
        storyboardTableMeta,
        storyboardGenerationLastFailure,
        directorPlanGeneration,
        assets: (data?.assets ?? []).map((asset: any) =>
          normalizeAssetLike({
            ...asset,
            derive: (asset.derive ?? []).map((derive: any) =>
              normalizeAssetLike({
                ...derive,
                status: normalizeTaskStatus(derive.status ?? derive.state, "pending"),
              }),
            ),
          }),
        ),
        storyboard: (data?.storyboard ?? []).map((item: any) =>
          normalizeAssetLike({
            ...item,
            factStatus: normalizeFactStatus(item?.factStatus),
            status: normalizeTaskStatus(item?.status ?? item?.state, "pending"),
          }),
        ),
      };
    }

    function findDeriveAssetById(session: EpisodeSession, id: number) {
      for (const asset of session.flowData.value.assets) {
        const derive = asset.derive?.find((item) => item.id === id);
        if (derive) return derive;
      }
      return undefined;
    }

    function restoreAssetTaskBindings(session: EpisodeSession) {
      const numericProjectId = Number(projectId);
      readProductionAssetTaskBindings(numericProjectId, session.episodeId).forEach((binding) => {
        const derive = findDeriveAssetById(session, binding.assetId);
        if (!derive) {
          removeProductionAssetTaskBinding(numericProjectId, session.episodeId, binding.assetId, binding.taskId);
          return;
        }
        derive.taskId = binding.taskId;
        derive.unifiedTaskId = binding.unifiedTaskId ?? binding.taskId;
        derive.legacyTaskId = binding.legacyTaskId;
        derive.imageId = binding.imageId;
        derive.flowId = binding.flowId ?? derive.flowId;
        derive.nodeId = binding.nodeId ?? derive.nodeId;
        derive.status = "queued";
        derive.state = "生成中";
      });
    }

    function toLegacyAssetState(status: RuntimeTask["status"]): DeriveAsset["state"] {
      if (status === "completed") return "已完成";
      if (status === "failed" || status === "cancelled") return "生成失败";
      return "生成中";
    }

    function notifyStoryboardFailure(session: EpisodeSession, failure: StoryboardGenerationLastFailure | null) {
      if (!failure) return false;
      const key = storyboardFailureNoticeKey(failure);
      if (session.storyboardFailureNoticeKeys.has(key)) return true;
      session.storyboardFailureNoticeKeys.add(key);
      if (session.storyboardFailureNoticeKeys.size > 100) {
        const oldest = session.storyboardFailureNoticeKeys.values().next().value;
        if (oldest) session.storyboardFailureNoticeKeys.delete(oldest);
      }
      window.$message?.error?.(storyboardFailureMessage(failure));
      return true;
    }

    function getSaveWarnings(response: any): string[] {
      const warnings = response?.data?.warnings ?? response?.warnings;
      return Array.isArray(warnings) ? warnings.filter((item) => typeof item === "string") : [];
    }

    function hasIncompleteStoryboardTableWarning(warnings: string[]) {
      return warnings.some((warning) => /ignored incomplete storyboardTable/i.test(warning));
    }

    function getSession(scriptId = episodesId.value) {
      if (!scriptId || scriptId < 0) return null;
      return ensureSession(scriptId);
    }

    function getActiveSession() {
      return getSession(episodesId.value);
    }

    function clearSubmissionSyncTimer(session: EpisodeSession) {
      if (session.submissionSyncTimer) clearTimeout(session.submissionSyncTimer);
      session.submissionSyncTimer = null;
    }

    function stopRunStatusPoll(session: EpisodeSession) {
      if (session.runStatusPollTimer) clearInterval(session.runStatusPollTimer);
      session.runStatusPollTimer = null;
      session.runStatusPollRunId = null;
      session.runStatusPollInFlight = false;
    }

    function finalizeNonRunningRun(session: EpisodeSession, completeLiveMessages = true) {
      session.activeRun.value = null;
      session.submitting.value = false;
      clearSubmissionSyncTimer(session);
      stopRunStatusPoll(session);
      if (completeLiveMessages && completeLiveGenerationMessages(session.chatApi.messages.value)) {
        session.chatApi.syncGenerationStatus();
      }
    }

    function releaseLocalRunBlock(session: EpisodeSession) {
      session.submitting.value = false;
      clearSubmissionSyncTimer(session);
      stopRunStatusPoll(session);
      if (completeLiveGenerationMessages(session.chatApi.messages.value)) {
        session.chatApi.syncGenerationStatus();
      }
    }

    function startRunStatusPoll(session: EpisodeSession, runId: string) {
      if (session.runStatusPollTimer && session.runStatusPollRunId === runId) return;
      stopRunStatusPoll(session);
      session.runStatusPollRunId = runId;
      session.runStatusPollTimer = setInterval(() => {
        if (session.runStatusPollInFlight) return;
        const activeRun = session.activeRun.value;
        if (!activeRun || activeRun.status !== "running" || activeRun.runId !== session.runStatusPollRunId) {
          stopRunStatusPoll(session);
          return;
        }
        session.runStatusPollInFlight = true;
        void syncRunStatus(session.episodeId).finally(() => {
          session.runStatusPollInFlight = false;
        });
      }, RUN_STATUS_POLL_INTERVAL_MS);
    }

    function applyResolvedRunStatus(session: EpisodeSession, latestRun: ProductionAgentRun | null, activeRun?: ProductionAgentRun | null) {
      const previousActiveRun = session.activeRun.value;
      const runningRun = activeRun?.status === "running" ? activeRun : null;
      session.activeRun.value = runningRun;
      session.latestRun.value = latestRun ?? runningRun;

      if (runningRun) {
        session.runtimeNotice.value = "";
        session.submitting.value = false;
        clearSubmissionSyncTimer(session);
        startRunStatusPoll(session, runningRun.runId);
        return { transitionedToNonRunning: false, latestRun: session.latestRun.value };
      }

      const shouldCompleteLiveMessages = previousActiveRun?.status === "running" || Boolean(session.latestRun.value);
      finalizeNonRunningRun(session, shouldCompleteLiveMessages);
      return {
        transitionedToNonRunning: previousActiveRun?.status === "running" && Boolean(session.latestRun.value) && session.latestRun.value?.status !== "running",
        latestRun: session.latestRun.value,
      };
    }

    function applyRunStatusSnapshot(session: EpisodeSession, payload: ProductionAgentRunStatusPayload) {
      const serverTime = Number(payload.serverTime ?? 0);
      if (serverTime > 0 && serverTime < session.runServerTime) return false;
      if (serverTime > 0) session.runServerTime = serverTime;

      const activeRun = normalizeProductionAgentRun(payload.activeRun);
      const latestRun = normalizeProductionAgentRun(payload.latestRun);
      const result = applyResolvedRunStatus(session, latestRun ?? activeRun, activeRun);
      session.runStatusError.value = "";
      return result;
    }

    async function syncRunStatus(scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) return null;
      const requestId = ++session.runStatusRequestId;
      session.runStatusLoading.value = true;
      try {
        const response: any = await axios.post("/agent/run/status", {
          agentKey: PRODUCTION_AGENT_KEY,
          projectId: Number(projectId),
          scriptId: session.episodeId,
        });
        if (requestId !== session.runStatusRequestId) return session.activeRun.value ?? session.latestRun.value;
        const payload = (response?.data ?? response ?? {}) as ProductionAgentRunStatusPayload;
        const result = applyRunStatusSnapshot(session, payload);
        if (result && typeof result === "object" && result.transitionedToNonRunning && result.latestRun) {
          refreshTerminalRun(session, result.latestRun);
        }
        return session.activeRun.value ?? session.latestRun.value;
      } catch (error: any) {
        if (requestId === session.runStatusRequestId) {
          session.runStatusError.value = error?.message || $t("workbench.production.chatBox.runStatusSyncFailed");
        }
        return null;
      } finally {
        if (requestId === session.runStatusRequestId) session.runStatusLoading.value = false;
      }
    }

    function waitForProductionAgentSocketConnected(session: EpisodeSession) {
      if (session.chatApi.socket.value?.connected) return Promise.resolve();

      session.chatApi.connect();
      const socket = session.chatApi.socket.value;
      if (!socket) return Promise.reject(new Error("Production Agent socket 未初始化"));
      if (socket.connected) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          socket.off("connect", onConnect);
          socket.off("connect_error", onError);
          socket.off("disconnect", onDisconnect);
          clearTimeout(timer);
        };
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (error) reject(error);
          else resolve();
        };
        const onConnect = () => finish();
        const onError = (error: any) => finish(new Error(error?.message || "Production Agent socket 连接失败"));
        const onDisconnect = (reason?: string) => finish(new Error(reason ? `Production Agent socket 已断开：${reason}` : "Production Agent socket 已断开"));
        const timer = setTimeout(() => finish(new Error("Production Agent socket 连接超时")), SOCKET_READY_TIMEOUT_MS);

        socket.once("connect", onConnect);
        socket.once("connect_error", onError);
        socket.once("disconnect", onDisconnect);
      });
    }

    function confirmProductionAgentContext(session: EpisodeSession) {
      const socket = session.chatApi.socket.value;
      if (!socket?.connected) return Promise.reject(new Error("Production Agent socket 未连接"));
      const context = getContext(session.episodeId);

      return new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(() => finish(new Error("Production Agent 上下文确认超时")), CONTEXT_ACK_TIMEOUT_MS);
        socket.emit("updateContext", context, (response: any) => {
          if (response?.success) {
            finish();
            return;
          }
          finish(new Error(response?.message || "Production Agent 上下文确认失败"));
        });
      });
    }

    async function ensureProductionAgentSocketReady(session: EpisodeSession) {
      await waitForProductionAgentSocketConnected(session);
      await confirmProductionAgentContext(session);
    }

    async function loadRunDetail(session: EpisodeSession, runId: string, recoveryId?: number) {
      const requestId = ++session.runDetailRequestId;
      session.runDetailLoading.value = true;
      try {
        const response: any = await axios.post("/agent/run/detail", { runId });
        if (requestId !== session.runDetailRequestId || (recoveryId != null && recoveryId !== session.recoveryRequestId)) return null;
        if (session.latestRun.value?.runId && session.latestRun.value.runId !== runId) return null;
        const detail = normalizeAgentRunDetail(response?.data ?? response ?? {});
        session.runDetail.value = detail;
        session.runTimeline.value = detail.timeline;
        if (detail.run?.status === "interrupted" && detail.timeline.some((item) => item.kind === "runtime_restarted") && session.runtimeRestartRunId !== detail.run.runId) {
          session.runtimeRestartRunId = detail.run.runId;
          session.runtimeNotice.value = "Agent runtime 已重启，上一轮运行已中断。";
          void getHistory(session.episodeId);
        }
        if (detail.run) {
          const activeDetailRun = session.activeRun.value?.runId === detail.run.runId && detail.run.status === "running" ? detail.run : null;
          applyResolvedRunStatus(session, detail.run, activeDetailRun);
        }
        session.runDetailError.value = "";
        return detail;
      } catch (error: any) {
        if (requestId === session.runDetailRequestId && (recoveryId == null || recoveryId === session.recoveryRequestId)) {
          session.runDetailError.value = error?.message || "运行轨迹同步失败";
        }
        return null;
      } finally {
        if (requestId === session.runDetailRequestId) session.runDetailLoading.value = false;
      }
    }

    function clearRunDetail(session: EpisodeSession) {
      session.runDetailRequestId++;
      session.runDetail.value = null;
      session.runTimeline.value = [];
      session.runDetailError.value = "";
      session.runDetailLoading.value = false;
    }

    async function recoverPanel(scriptId = episodesId.value, force = false) {
      const session = getSession(scriptId);
      if (!session) return;
      if (session.recoveryPromise && !force) return session.recoveryPromise;

      const recoveryId = ++session.recoveryRequestId;
      const recovery = (async () => {
        stopRunStatusPoll(session);
        await ensureProductionAgentSocketReady(session).catch((error) => {
          console.warn("[productionAgent] failed to confirm socket context during recovery", error);
        });

        await syncRunStatus(session.episodeId);
        if (recoveryId !== session.recoveryRequestId) return;

        try {
          await getHistory(session.episodeId);
        } catch (error) {
          console.warn("[productionAgent] failed to recover Memory", error);
        }
        if (recoveryId !== session.recoveryRequestId) return;

        const run = session.latestRun.value ?? session.activeRun.value;
        if (run?.runId) await loadRunDetail(session, run.runId, recoveryId);
        else clearRunDetail(session);
      })();
      session.recoveryPromise = recovery;
      try {
        await recovery;
      } finally {
        if (session.recoveryPromise === recovery) session.recoveryPromise = null;
      }
    }

    function refreshTerminalRun(session: EpisodeSession, run: ProductionAgentRun) {
      const key = `${run.runId}:${run.status}`;
      if (session.terminalRunKeys.has(key)) return;
      session.terminalRunKeys.add(key);
      if (session.terminalRunKeys.size > 100) {
        const oldest = session.terminalRunKeys.values().next().value;
        if (oldest) session.terminalRunKeys.delete(oldest);
      }
      const detailSync = run.runId ? loadRunDetail(session, run.runId).catch(() => null) : Promise.resolve(null);
      void detailSync.finally(() => refreshCompletedAgentFlow(session));
    }

    function handleRunUpdate(session: EpisodeSession, payload: ProductionAgentRunUpdatePayload) {
      if (payload.agentKey && payload.agentKey !== PRODUCTION_AGENT_KEY) return;
      if (payload.projectId != null && Number(payload.projectId) !== Number(projectId)) return;
      if (payload.scriptId != null && Number(payload.scriptId) !== session.episodeId) return;

      const serverTime = Number(payload.serverTime ?? 0);
      if (serverTime > 0 && serverTime < session.runServerTime) return;
      if (serverTime > 0) session.runServerTime = serverTime;

      const run = normalizeProductionAgentRun(payload.run);
      const activeRun = normalizeProductionAgentRun(payload.activeRun);
      const resolvedRun = payload.rejected ? activeRun ?? run : run ?? activeRun;
      if (resolvedRun && payload.reason && !resolvedRun.reason) resolvedRun.reason = payload.reason;
      if (resolvedRun) {
        applyResolvedRunStatus(session, resolvedRun, resolvedRun.status === "running" ? activeRun : null);
      }

      session.runStatusError.value = "";
      session.submitting.value = false;
      clearSubmissionSyncTimer(session);

      if (payload.terminalPersistenceFailed) {
        session.runtimeNotice.value = "运行终态正在持久化，正在重新同步后端状态。";
        void syncRunStatus(session.episodeId).then(() => {
          const refreshed = session.activeRun.value ?? session.latestRun.value;
          if (refreshed?.runId) return loadRunDetail(session, refreshed.runId);
          return null;
        }).finally(() => refreshCompletedAgentFlow(session));
        return;
      }

      if (payload.rejected) {
        window.$message?.warning?.(payload.reason || resolvedRun?.reason || $t("workbench.production.chatBox.runAlreadyRunning"));
        return;
      }
      if (resolvedRun && resolvedRun.status !== "running") {
        refreshTerminalRun(session, resolvedRun);
      }
    }

    function serializeFlowForAgent(session: EpisodeSession) {
      const data = session.flowData.value;
      return {
        script: data.script,
        scriptPlan: data.scriptPlan,
        storyboardTable: data.storyboardTable,
        assets: data.assets.map((item: any) => ({
          ...item,
          prompt: undefined,
          flowId: undefined,
          src: undefined,
          derive: item.derive?.map((deriveItem: any) => ({
            ...deriveItem,
            prompt: undefined,
            flowId: undefined,
            src: undefined,
          })),
        })),
        storyboard: data.storyboard.map((item: any) => ({
          ...item,
          prompt: undefined,
          src: undefined,
          flowId: undefined,
        })),
        workbench: data.workbench,
      };
    }

    async function handleXmlTag(session: EpisodeSession, data: XmlTagEvent) {
      const { tag, value, status, isComplete } = data;
      if (tag !== "script") return;
      session.flowData.value.script = value ?? "";

      if (status !== "complete" || !isComplete) return;
      session.contentSavePromise = session.contentSavePromise.catch(() => {}).then(() => setFlowData(session.episodeId));
      await session.contentSavePromise;
    }

    async function refreshCompletedAgentFlow(session: EpisodeSession, messageId?: string) {
      if (messageId && session.completedMessageIds.has(messageId)) return;
      if (messageId) {
        session.completedMessageIds.add(messageId);
        if (session.completedMessageIds.size > 200) {
          const oldest = session.completedMessageIds.values().next().value;
          if (oldest) session.completedMessageIds.delete(oldest);
        }
      }
      const previousRefresh = session.flowRefreshPromise?.catch(() => {}) ?? Promise.resolve();
      const nextRefresh = previousRefresh.then(async () => {
        await session.contentSavePromise.catch(() => {});
        await getFlowData(session.episodeId);
      });
      session.flowRefreshPromise = nextRefresh;
      try {
        await nextRefresh;
      } finally {
        if (session.flowRefreshPromise === nextRefresh) session.flowRefreshPromise = null;
      }
    }

    async function handleStoryboardCommitTerminal(session: EpisodeSession, result: StoryboardCommitResult, messageId?: string) {
      if (result.status === "committed") {
        await refreshCompletedAgentFlow(session, messageId);
        return;
      }

      await refreshCompletedAgentFlow(session, messageId);
      const failure = session.flowData.value.storyboardGenerationLastFailure;
      const notified = notifyStoryboardFailure(session, failure);
      if (notified) return;
      if (result.status === "invalid") {
        window.$message?.error?.("分镜表校验失败，请重新生成或检查分镜字段。");
      } else {
        window.$message?.error?.(result.error?.message || "分镜表提交失败，请稍后重试。");
      }
    }

    async function handleDirectorPlanCommitTerminal(session: EpisodeSession, result: DirectorPlanCommitResult, messageId?: string) {
      await refreshCompletedAgentFlow(session, messageId);
      if (result.status === "committed") return;
      const failure = session.flowData.value.directorPlanGeneration.lastFailure;
      const message = directorPlanFailureMessage(failure?.errorJson ?? result.errorJson, result.error?.message);
      window.$message?.error?.(message);
    }

    function handleCommitResultPayload(session: EpisodeSession, payload: unknown, messageId?: string) {
      const directorResult = extractDirectorPlanCommitResult(payload);
      if (directorResult) {
        void handleDirectorPlanCommitTerminal(session, directorResult, messageId);
        return true;
      }
      const result = extractStoryboardCommitResult(payload);
      if (!result) return false;
      void handleStoryboardCommitTerminal(session, result, messageId);
      return true;
    }

    async function fetchAgentMemory(session: EpisodeSession) {
      const { data } = await axios.post(`/agents/getMemory`, {
        projectId,
        episodesId: session.episodeId,
        agentType: "productionAgent",
      });
      return data;
    }

    function applyAgentHistory(session: EpisodeSession, data: unknown) {
      const history = normalizeHistoryMessages(data);
      session.chatApi.messages.value = history.length ? history : cloneDefaultMessages(defMsg);
      session.chatApi.syncGenerationStatus();
    }

    async function reconcileLiveGenerationHistory(session: EpisodeSession, messageIds: string[], reconcileId: number, attempt = 0) {
      if (reconcileId !== session.historyReconcileId) return;
      const currentLiveMessages = session.chatApi.messages.value.filter(isLiveGenerationMessage);
      const currentLiveIds = getLiveGenerationMessageIds(currentLiveMessages);
      const activeIds = messageIds.filter((id) => currentLiveIds.includes(id));
      if (!activeIds.length) return;

      try {
        const data = await fetchAgentMemory(session);
        if (reconcileId !== session.historyReconcileId) return;
        const terminalMessage = findTerminalHistoryMessage(data, activeIds, currentLiveMessages);
        if (terminalMessage) {
          const terminalMessageId = String((terminalMessage as any).id);
          applyAgentHistory(session, data);
          if ((terminalMessage as any).status === "complete" || (terminalMessage as any).status == null) {
            await refreshCompletedAgentFlow(session, terminalMessageId);
          }
          return;
        }
      } catch (error) {
        if (attempt >= HISTORY_RECONCILE_MAX_ATTEMPTS) {
          console.warn("[productionAgent] reconcile live history failed", error);
        }
      }

      if (attempt >= HISTORY_RECONCILE_MAX_ATTEMPTS) return;
      await delay(HISTORY_RECONCILE_RETRY_DELAY_MS);
      await reconcileLiveGenerationHistory(session, activeIds, reconcileId, attempt + 1);
    }

    function startLiveGenerationHistoryReconcile(session: EpisodeSession) {
      const liveMessageIds = getLiveGenerationMessageIds(session.chatApi.messages.value);
      if (!liveMessageIds.length) {
        void getHistory(session.episodeId);
        return;
      }
      const reconcileId = ++session.historyReconcileId;
      void reconcileLiveGenerationHistory(session, liveMessageIds, reconcileId);
    }

    function setupSocketHandlers(session: EpisodeSession) {
      return watch(
        session.chatApi.socket,
        (socket) => {
          if (!socket) return;
          socket.on("connect", () => {
            void recoverPanel(session.episodeId);
          });
          socket.on("agent:run:update", (payload: ProductionAgentRunUpdatePayload) => {
            handleRunUpdate(session, payload ?? {});
          });
          socket.on("getFlowData", (_, callback) => {
            callback(serializeFlowForAgent(session));
          });
          socket.on("addDeriveAsset", async (data, callback) => {
            const assets = session.flowData.value.assets.find((asset) => asset.id === data.assetsId);
            if (!assets) return callback({ success: false, message: $t("storyboard.assets.notExist") });
            const deriveAssetList = assets.derive || [];
            const item = deriveAssetList.find((derive) => derive.id === data.id);
            if (item) {
              item.name = data.name;
              item.desc = data.describe ?? item.desc ?? "";
              item.prompt = data.prompt ?? item.prompt ?? "";
              item.promptMode = data.promptMode ?? item.promptMode;
              item.flowId = data.flowId ?? item.flowId;
              item.nodeId = data.nodeId ?? item.nodeId;
              item.type = assets.type;
              callback({ success: true, message: $t("storyboard.assets.derivativeUpdateSuccess") });
            } else {
              deriveAssetList.push({
                assetsId: data.assetsId,
                id: data.id,
                name: data.name,
                type: assets.type,
                desc: data.describe,
                prompt: data.prompt ?? "",
                promptMode: data.promptMode,
                flowId: data.flowId,
                nodeId: data.nodeId,
                state: "未生成" as any,
                src: "",
              });
              callback({ success: true, message: $t("storyboard.assets.derivativeAddSuccess") });
            }
          });
          socket.on("delDeriveAsset", async (data, callback) => {
            const assets = session.flowData.value.assets.find((asset) => asset.id === data.assetsId);
            if (!assets) return callback({ success: false, message: $t("storyboard.assets.notExist") });
            const deriveAssetList = assets.derive || [];
            const index = deriveAssetList.findIndex((derive) => derive.id === data.id);
            if (index === -1) return callback({ success: false, message: $t("storyboard.assets.notDerivativeExist") });
            deriveAssetList.splice(index, 1);
            callback({ success: true, message: $t("storyboard.assets.derivativeDelSuccess") });
          });
          socket.on("generateDeriveAsset", async (data, callback) => {
            try {
              const assetsData = await batchGenerateAssets(data.ids, session.episodeId);
              callback({ success: true, message: assetsData });
            } catch (error) {
              callback({ success: false, message: (error as any)?.message ?? String(error) });
            }
          });
          socket.on("generateStoryboard", async (data, callback) => {
            const storyData = await batchGenerateStoryboard(data.ids, data.compulsory ?? false, session.episodeId);
            callback({ success: true, message: storyData });
          });
          socket.on("message", (event: { id?: string; role?: string; status?: string; ext?: Record<string, any> }) => {
            handleCommitResultPayload(session, event.ext, event.id);
            if (event.role === "assistant" && event.status === "complete") {
              void refreshCompletedAgentFlow(session, event.id);
            }
          });
          socket.on("message:update", (event: { id?: string; status?: string; ext?: Record<string, any> }) => {
            handleCommitResultPayload(session, event.ext, event.id);
            if (event.status === "complete") void refreshCompletedAgentFlow(session, event.id);
          });
          socket.on("content:add", (event: { messageId?: string; content?: any }) => {
            handleCommitResultPayload(session, event.content?.data, event.messageId);
          });
          socket.on("content:update", (event: { messageId?: string; type?: string; data?: any }) => {
            if (event.type === "thinking") {
              const result = commitResultFromThinkingTitle(event.data?.title);
              if (result) void handleStoryboardCommitTerminal(session, result, event.messageId);
              return;
            }
            handleCommitResultPayload(session, event.data, event.messageId);
          });
        },
        { immediate: true },
      );
    }

    function ensureSession(scriptId: number): EpisodeSession {
      const existing = sessions.get(scriptId);
      if (existing) return existing;

      let session!: EpisodeSession;
      const flowData = ref<FlowData>(createEmptyFlowData());
      const loadingHistory = ref(false);
      const thinkLevel = ref(0);
      const activeRun = ref<ProductionAgentRun | null>(null);
      const latestRun = ref<ProductionAgentRun | null>(null);
      const runStatusLoading = ref(false);
      const runStatusError = ref("");
      const runtimeNotice = ref("");
      const runDetail = ref<AgentRunDetail | null>(null);
      const runTimeline = ref<AgentRunTimelineItem[]>([]);
      const runDetailLoading = ref(false);
      const runDetailError = ref("");
      const submitting = ref(false);
      const chatApi = useChat({
        url: `${settingStore().baseUrl}/socket/productionAgent`,
        auth: () => getContext(scriptId),
        manageLifecycle: false,
        autoConnect: false,
        isolated: true,
        xmlTags: [
          { tag: "script", keepInMessage: false },
        ],
        onXmlTag: (event) => {
          void handleXmlTag(session, event);
        },
      });
      chatApi.messages.value = cloneDefaultMessages(defMsg);

      session = {
        episodeId: scriptId,
        isolationKey: getContext(scriptId).isolationKey,
        flowData,
        loadingHistory,
        thinkLevel,
        activeRun,
        latestRun,
        runStatusLoading,
        runStatusError,
        runtimeNotice,
        runtimeRestartRunId: null,
        runDetail,
        runTimeline,
        runDetailLoading,
        runDetailError,
        submitting,
        chatApi,
        stopSocketWatch: () => {},
        assetTaskBindings: new Map(),
        storyboardTaskBindings: new Map(),
        historyRequestId: 0,
        historyReconcileId: 0,
        flowRequestId: 0,
        runStatusRequestId: 0,
        runDetailRequestId: 0,
        recoveryRequestId: 0,
        runServerTime: 0,
        recoveryPromise: null,
        submissionSyncTimer: null,
        runStatusPollTimer: null,
        runStatusPollRunId: null,
        runStatusPollInFlight: false,
        terminalRunKeys: new Set(),
        contentSavePromise: Promise.resolve(),
        flowRefreshPromise: null,
        completedMessageIds: new Set(),
        storyboardFailureNoticeKeys: new Set(),
      };
      session.stopSocketWatch = setupSocketHandlers(session);
      sessions.set(scriptId, session);
      return session;
    }

    const connected = computed(() => getActiveSession()?.chatApi.connected.value ?? false);
    const messages = computed({
      get: () => getActiveSession()?.chatApi.messages.value ?? [],
      set: (value: ChatMessagesData[]) => {
        const session = getActiveSession();
        if (session) session.chatApi.messages.value = value;
      },
    });
    const socket = computed(() => getActiveSession()?.chatApi.socket.value ?? null);
    const messageStatus = computed(() => getActiveSession()?.chatApi.status.value ?? "idle");
    const currentRun = computed(() => {
      const session = getActiveSession();
      return session?.activeRun.value ?? session?.latestRun.value ?? null;
    });
    const runStatus = computed(() => currentRun.value?.status ?? null);
    const runReason = computed(() => getActiveSession()?.runtimeNotice.value || currentRun.value?.reason || null);
    const runCurrentStage = computed(() => currentRun.value?.currentStage ?? null);
    const runCurrentSubAgent = computed(() => currentRun.value?.currentSubAgent ?? null);
    const runRunning = computed(() => getActiveSession()?.activeRun.value?.status === "running");
    const runStatusLoading = computed(() => getActiveSession()?.runStatusLoading.value ?? false);
    const runStatusError = computed(() => getActiveSession()?.runStatusError.value ?? "");
    const agentRunDetail = computed(() => getActiveSession()?.runDetail.value ?? null);
    const runTimeline = computed(() => getActiveSession()?.runTimeline.value ?? []);
    const businessProgress = computed<AgentBusinessProgress | null>(() => {
      if (getActiveSession()?.activeRun.value?.status !== "running") return null;
      const item = runTimeline.value
        .slice()
        .reverse()
        .find((entry) => entry.kind === "agent_progress" && entry.title);
      if (!item?.title) return null;
      return {
        title: item.title,
        detail: item.detail,
        phase: item.phase,
        stage: item.stage,
        subAgent: item.subAgent,
        createdAt: item.createdAt,
      };
    });
    const archivedOutputs = computed<FullTextAssetMeta[]>(() =>
      Array.from(
        new Map(
          runTimeline.value
            .filter((item) => item.kind === "agent_output_archived" && item.fullTextAsset)
            .map((item) => [item.fullTextAsset!.id, item.fullTextAsset!] as const),
        ).values(),
      ).reverse(),
    );
    const runDetailLoading = computed(() => getActiveSession()?.runDetailLoading.value ?? false);
    const runDetailError = computed(() => getActiveSession()?.runDetailError.value ?? "");
    const submitting = computed(() => getActiveSession()?.submitting.value ?? false);
    const flowData = computed({
      get: () => getActiveSession()?.flowData.value ?? fallbackFlowData.value,
      set: (value: FlowData) => {
        const session = getActiveSession();
        if (session) session.flowData.value = value;
        else fallbackFlowData.value = value;
      },
    });
    const loadingHistory = computed(() => getActiveSession()?.loadingHistory.value ?? false);
    const thinkLevel = computed(() => getActiveSession()?.thinkLevel.value ?? 0);

    async function setFlowData(scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) return;
      const saveData: Partial<FlowData> = { ...session.flowData.value };
      delete saveData.storyboard;
      delete saveData.storyboardTable;
      delete saveData.storyboardTableMeta;
      delete saveData.storyboardGenerationLastFailure;
      delete saveData.directorPlanGeneration;
      const response = await axios.post("/production/saveFlowData", {
        projectId,
        data: saveData,
        episodesId: session.episodeId,
      });
      const warnings = getSaveWarnings(response);
      if (!warnings.length) return;
      console.warn("[production/saveFlowData] warnings", warnings);
      if (hasIncompleteStoryboardTableWarning(warnings)) {
        window.$message?.warning?.("生产数据已保存，服务端已忽略不完整的分镜表草稿。");
        await getFlowData(session.episodeId);
      } else {
        window.$message?.warning?.("生产数据已保存，服务端返回 warning，已记录到控制台。");
      }
    }

    async function getFlowData(scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) return;
      const requestId = ++session.flowRequestId;
      const { data } = await axios.post("/production/getFlowData", {
        projectId,
        episodesId: session.episodeId,
      });
      if (requestId !== session.flowRequestId) return;
      session.assetTaskBindings.forEach((release) => release());
      session.assetTaskBindings.clear();
      session.flowData.value = normalizeFlowData(data);
      restoreAssetTaskBindings(session);
      notifyStoryboardFailure(session, session.flowData.value.storyboardGenerationLastFailure);
      if (import.meta.env.DEV) {
        const table = session.flowData.value.storyboardTable;
        console.debug("[production/getFlowData]", {
          episodeId: session.episodeId,
          storyboardCount: session.flowData.value.storyboard.length,
          storyboardTableMeta: session.flowData.value.storyboardTableMeta,
          storyboardTableRows: countStoryboardTableRows(table),
          textAssetMarker: extractFullTextAssetId(table),
          tableLength: typeof table === "string" ? table.length : 0,
        });
      }
      syncLegacyTasks(session);
    }

    function releaseAssetTask(session: EpisodeSession, id: number) {
      session.assetTaskBindings.get(id)?.();
      session.assetTaskBindings.delete(id);
    }

    function releaseStoryboardTask(session: EpisodeSession, id: number) {
      session.storyboardTaskBindings.get(id)?.();
      session.storyboardTaskBindings.delete(id);
    }

    function applyAssetTask(session: EpisodeSession, deriveId: number, task: RuntimeTask) {
      const derive = findDeriveAssetById(session, deriveId);
      if (!derive) {
        queueMicrotask(() => releaseAssetTask(session, deriveId));
        return;
      }
      const record = (task.result ?? {}) as any;
      derive.status = task.status;
      derive.state = toLegacyAssetState(task.status);
      derive.unifiedTaskId = task.unifiedTaskId ?? derive.unifiedTaskId;
      derive.taskId = task.unifiedTaskId ?? task.taskId?.toString() ?? derive.taskId;
      derive.legacyTaskId = typeof task.legacyTaskId === "number" ? task.legacyTaskId : Number(task.legacyTaskId) || derive.legacyTaskId;
      derive.flowId = Number(record.flowId ?? derive.flowId) || derive.flowId;
      derive.nodeId = record.nodeId ?? task.nodeId ?? derive.nodeId;
      const media = normalizeMediaRef(record.media ?? record, "image");
      if (media && task.status === "completed") {
        derive.media = media;
        derive.src = getMediaPreviewUrl(media);
      }
      derive.errorReason = task.reason ?? "";
      if (record.prompt !== undefined) derive.prompt = record.prompt;
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        removeProductionAssetTaskBinding(Number(projectId), session.episodeId, deriveId, task.unifiedTaskId ?? derive.unifiedTaskId ?? derive.taskId);
        queueMicrotask(() => releaseAssetTask(session, deriveId));
      }
    }

    function applyStoryboardTask(session: EpisodeSession, task: RuntimeTask) {
      const storyboardId = Number(task.targetId ?? (task.result as any)?.businessId);
      if (!Number.isFinite(storyboardId)) return;

      const item = session.flowData.value.storyboard.find((row) => row.id === storyboardId);
      if (!item) {
        queueMicrotask(() => releaseStoryboardTask(session, storyboardId));
        return;
      }

      const record = (task.result ?? {}) as any;
      item.status = task.status;
      item.state = toStoryboardTaskState(task.status);
      item.taskId = task.unifiedTaskId ?? String(task.legacyTaskId ?? task.taskId ?? item.taskId ?? "");
      item.unifiedTaskId = task.unifiedTaskId ?? item.unifiedTaskId ?? null;
      item.legacyTaskId = task.legacyTaskId ?? item.legacyTaskId ?? null;
      item.flowId = Number(record.flowId ?? item.flowId) || item.flowId;
      item.nodeId = record.nodeId ?? task.nodeId ?? item.nodeId;
      const media = normalizeMediaRef(record.media ?? record, "image");
      if (media) {
        item.media = media;
        item.src = getMediaPreviewUrl(media);
      }
      item.reason = task.status === "completed" ? "" : (task.reason ?? "");
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        queueMicrotask(() => releaseStoryboardTask(session, storyboardId));
      }
    }

    function toStoryboardTaskState(status: RuntimeTask["status"]): Storyboard["state"] {
      if (status === "completed") return "已完成";
      if (status === "failed" || status === "cancelled") return "生成失败";
      if (status === "queued" || status === "submitting" || status === "processing") return "生成中";
      return "未生成";
    }

    function getStoryboardTaskIds(record: Record<string, any>) {
      const unifiedTaskId =
        record.unifiedTaskId ?? (typeof record.taskId === "string" && !/^\d+$/.test(record.taskId) ? record.taskId : undefined);
      const legacyTaskId =
        record.legacyTaskId ?? (typeof record.taskId === "number" || (typeof record.taskId === "string" && /^\d+$/.test(record.taskId)) ? record.taskId : undefined);
      const taskId = unifiedTaskId ?? (legacyTaskId == null ? record.taskId : String(legacyTaskId));
      return { taskId, unifiedTaskId, legacyTaskId };
    }

    function applyStoryboardBatchRecord(target: Storyboard, record: Record<string, any>) {
      const normalized = normalizeAssetLike(record);
      if (record.prompt !== undefined) target.prompt = record.prompt ?? "";
      if (Array.isArray(record.associateAssetsIds)) target.associateAssetsIds = record.associateAssetsIds;
      if (Array.isArray(record.referenceImages)) target.referenceImages = record.referenceImages;
      if (record.flowId !== undefined) target.flowId = Number(record.flowId) || target.flowId;
      if (record.nodeId !== undefined) target.nodeId = record.nodeId ?? null;
      if (record.reason !== undefined) target.reason = record.reason ?? "";
      if (normalized.media) target.media = normalized.media as MediaRef;
      if (normalized.src !== undefined) target.src = normalized.src;
      const status = normalizeTaskStatus(record.status ?? normalized.status ?? normalized.state, normalizeTaskStatus(target.status ?? target.state, "processing"));
      target.status = status;
      target.state = (record.state ?? toStoryboardTaskState(status)) as Storyboard["state"];
      const { taskId, unifiedTaskId, legacyTaskId } = getStoryboardTaskIds(record);
      target.taskId = taskId == null ? "" : String(taskId);
      target.unifiedTaskId = unifiedTaskId ?? null;
      target.legacyTaskId = legacyTaskId ?? null;
    }

    function syncAssetTasks(session: EpisodeSession) {
      const activeIds = new Set<number>();
      session.flowData.value.assets.forEach((asset) => {
        asset.derive?.forEach((derive) => {
          const status = normalizeTaskStatus(derive.status ?? derive.state, "pending");
          if (!["queued", "submitting", "processing"].includes(status)) return;
          const unifiedTaskId = derive.unifiedTaskId ?? (derive.taskId && !/^\d+$/.test(String(derive.taskId)) ? derive.taskId : undefined);
          const legacyTaskId = derive.legacyTaskId ?? (derive.taskId && /^\d+$/.test(String(derive.taskId)) ? Number(derive.taskId) : undefined);
          if (!unifiedTaskId && !legacyTaskId && !derive.taskId) return;
          activeIds.add(derive.id);
          const taskKey = createTaskKey("flowImage", Number(projectId), derive.id, derive.nodeId ?? undefined, unifiedTaskId);
          if (
            session.assetTaskBindings.has(derive.id) &&
            taskCenter.getTask(taskKey)
          ) {
            return;
          }
          if (session.assetTaskBindings.has(derive.id)) releaseAssetTask(session, derive.id);
          const release = taskCenter.registerTask(
            {
              key: taskKey,
              domain: "flowImage",
              taskId: derive.taskId,
              unifiedTaskId,
              legacyTaskId,
              targetType: "deriveAsset",
              targetId: derive.id,
              projectId: Number(projectId),
              scriptId: session.episodeId,
              nodeId: derive.nodeId ?? undefined,
              status,
            },
            (task) => applyAssetTask(session, derive.id, task),
          );
          session.assetTaskBindings.set(derive.id, release);
        });
      });
      Array.from(session.assetTaskBindings.keys()).forEach((id) => {
        if (!activeIds.has(id)) releaseAssetTask(session, id);
      });
    }

    function syncStoryboardTasks(session: EpisodeSession) {
      const activeIds = new Set<number>();
      session.flowData.value.storyboard.forEach((item) => {
        const status = normalizeTaskStatus(item.status ?? item.state, "pending");
        if (!item.id || !["queued", "submitting", "processing"].includes(status)) return;
        const storyboardId = item.id;
        const { taskId, unifiedTaskId, legacyTaskId } = getStoryboardTaskIds(item as any);
        if (!taskId && !unifiedTaskId && !legacyTaskId) return;
        const nodeId = item.nodeId ?? undefined;
        activeIds.add(storyboardId);
        const taskKey = createTaskKey("flowImage", Number(projectId), storyboardId, nodeId, unifiedTaskId);
        if (
          session.storyboardTaskBindings.has(storyboardId) &&
          taskCenter.getTask(taskKey)
        ) {
          return;
        }
        if (session.storyboardTaskBindings.has(storyboardId)) releaseStoryboardTask(session, storyboardId);
        const release = taskCenter.registerTask(
          {
            key: taskKey,
            domain: "flowImage",
            taskId,
            unifiedTaskId,
            legacyTaskId,
            targetType: "storyboard",
            targetId: storyboardId,
            projectId: Number(projectId),
            scriptId: session.episodeId,
            nodeId,
            status,
          },
          (task) => applyStoryboardTask(session, task),
        );
        session.storyboardTaskBindings.set(storyboardId, release);
      });
      Array.from(session.storyboardTaskBindings.keys()).forEach((id) => {
        if (!activeIds.has(id)) releaseStoryboardTask(session, id);
      });
    }

    function syncLegacyTasks(session: EpisodeSession) {
      syncAssetTasks(session);
      syncStoryboardTasks(session);
    }

    async function batchGenerateStoryboard(allIds: number[], compulsory = false, scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) return;
      allIds.forEach((id) => {
        taskCenter.removeTask(createTaskKey("storyboardImage", Number(projectId), id));
        const item = session.flowData.value.storyboard.find((row) => row.id === id);
        if (item) {
          taskCenter.removeTask(createTaskKey("storyboardImage", Number(projectId), id, undefined, item.unifiedTaskId ?? undefined));
          taskCenter.removeTask(createTaskKey("flowImage", Number(projectId), id, item.nodeId ?? undefined, item.unifiedTaskId ?? undefined));
        }
      });
      try {
        const { data } = await axios.post("/production/storyboard/batchGenerateImage", {
          scriptId: session.episodeId,
          projectId,
          storyboardIds: allIds,
          compulsory,
        });
        if (data) {
          if (session.flowData.value.storyboard.length === 0) {
            session.flowData.value.storyboard = data.map((record: any) =>
              normalizeAssetLike({
                ...record,
                status: normalizeTaskStatus(record.status ?? record.state, "pending"),
              }),
            );
            syncStoryboardTasks(session);
            return data;
          }
          session.flowData.value.storyboard.forEach((item) => {
            const findData = data.find((record: any) => record.id === item.id);
            if (findData) applyStoryboardBatchRecord(item, findData);
          });
        }
        syncStoryboardTasks(session);
        return data;
      } catch (error) {
        window.$message.error((error as any)?.message);
      }
    }

    async function batchGenerateAssets(allIds: unknown[], scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) throw new Error("Production session is unavailable");
      const activeSession = session;
      const currentProject = projectStore().project;
      if (!currentProject?.imageModel || !currentProject.imageQuality) throw new Error("请先配置图片模型和清晰度");

      const normalizedIds = normalizeNumericIds(allIds);
      if (!normalizedIds.length) throw new Error("没有可提交的衍生资产 ID");

      const selectedIds = new Set(normalizedIds);
      const selectedDeriveAssets = session.flowData.value.assets
        .flatMap((asset) => asset.derive ?? [])
        .filter((derive) => selectedIds.has(derive.id))
        .map((derive) => ({ derive }));

      if (!selectedDeriveAssets.length) throw new Error("没有可生成图片的角色、场景或道具资产");

      const previousState = new Map(
        selectedDeriveAssets.map(({ derive }) => [
          derive.id,
          {
            state: derive.state,
            taskId: derive.taskId,
            unifiedTaskId: derive.unifiedTaskId,
            legacyTaskId: derive.legacyTaskId,
            imageId: derive.imageId,
            flowId: derive.flowId,
            nodeId: derive.nodeId,
            errorReason: derive.errorReason,
            status: derive.status,
            prompt: derive.prompt,
          },
        ]),
      );
      const previousBindings = new Map(
        readProductionAssetTaskBindings(Number(projectId), session.episodeId)
          .filter((binding) => selectedIds.has(binding.assetId))
          .map((binding) => [binding.assetId, binding]),
      );

      function restoreDeriveAsset(derive: DeriveAsset, errorReason?: string) {
        releaseAssetTask(activeSession, derive.id);
        const previous = previousState.get(derive.id);
        if (previous) Object.assign(derive, previous);
        if (errorReason) derive.errorReason = errorReason;
        const previousBinding = previousBindings.get(derive.id);
        if (previousBinding) upsertProductionAssetTaskBinding(previousBinding);
      }

      selectedDeriveAssets.forEach(({ derive }) => {
        releaseAssetTask(session, derive.id);
        taskCenter.removeTask(createTaskKey("flowImage", Number(projectId), derive.id, derive.nodeId ?? undefined, derive.unifiedTaskId ?? undefined));
        taskCenter.removeTask(createTaskKey("assetImage", Number(projectId), derive.id, undefined, derive.taskId));
        removeProductionAssetTaskBinding(Number(projectId), session.episodeId, derive.id);
        derive.taskId = undefined;
        derive.unifiedTaskId = undefined;
        derive.legacyTaskId = undefined;
        derive.errorReason = "";
        derive.status = "submitting";
        derive.state = "生成中";
      });

      try {
        const { data } = await axios.post("/production/assets/batchGenerateAssetsImage", {
          projectId: Number(projectId),
          scriptId: session.episodeId,
          assetIds: selectedDeriveAssets.map(({ derive }) => derive.id),
          model: currentProject.imageModel,
          quality: currentProject.imageQuality,
          ratio: "16:9",
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
        });
        const result = normalizeBatchGenerateAssetsResult(data);
        if (!result.tasks.length && !result.errors.length) {
          throw new Error("后端未返回可识别的衍生资产生成任务结果");
        }
        const deriveById = new Map(selectedDeriveAssets.map(({ derive }) => [derive.id, derive]));
        const returnedAssetIds = new Set<number>();
        const normalizedErrors: ProductionAssetBatchError[] = [...result.errors];
        for (const task of result.tasks) {
          const assetId = Number(task.assetId);
          const derive = deriveById.get(assetId);
          if (!derive) continue;
          const unifiedTaskId =
            task.unifiedTaskId ?? (typeof task.taskId === "string" && !/^\d+$/.test(task.taskId) ? task.taskId : undefined);
          const rawLegacyTaskId =
            task.legacyTaskId ?? (typeof task.taskId === "number" || (typeof task.taskId === "string" && /^\d+$/.test(task.taskId)) ? Number(task.taskId) : undefined);
          const legacyTaskId = rawLegacyTaskId == null || !Number.isFinite(Number(rawLegacyTaskId)) ? undefined : Number(rawLegacyTaskId);
          const taskId = unifiedTaskId ?? (task.taskId == null ? undefined : String(task.taskId)) ?? (legacyTaskId == null ? undefined : String(legacyTaskId));
          if (!taskId) {
            normalizedErrors.push({ assetId: derive.id, error: "后端返回的任务缺少 taskId" });
            continue;
          }
          returnedAssetIds.add(derive.id);
          derive.taskId = taskId;
          derive.unifiedTaskId = unifiedTaskId;
          derive.legacyTaskId = legacyTaskId;
          derive.imageId = task.imageId;
          derive.flowId = task.flowId ?? derive.flowId;
          derive.nodeId = task.nodeId ?? derive.nodeId;
          derive.ratio = task.ratio ?? derive.ratio;
          if (task.prompt !== undefined) derive.prompt = task.prompt;
          derive.status = normalizeTaskStatus(task.status ?? task.state, "queued");
          derive.state = toLegacyAssetState(derive.status);
          upsertProductionAssetTaskBinding({
            projectId: Number(projectId),
            episodeId: session.episodeId,
            assetId: derive.id,
            taskId,
            unifiedTaskId,
            legacyTaskId,
            imageId: task.imageId,
            flowId: derive.flowId,
            nodeId: derive.nodeId,
            createdAt: Date.now(),
          });
        }
        const erroredAssetIds = new Set<number>();
        for (const error of normalizedErrors) {
          const assetId = Number(error.assetId);
          if (!Number.isFinite(assetId)) continue;
          const derive = deriveById.get(assetId);
          if (!derive) continue;
          erroredAssetIds.add(derive.id);
          if (returnedAssetIds.has(derive.id)) continue;
          restoreDeriveAsset(derive, getBatchAssetErrorMessage(error));
        }
        selectedDeriveAssets.forEach(({ derive }) => {
          if (returnedAssetIds.has(derive.id) || erroredAssetIds.has(derive.id)) return;
          restoreDeriveAsset(derive);
        });
        syncAssetTasks(session);
        result.errors = normalizedErrors;
        result.successCount = returnedAssetIds.size;
        result.failedCount = normalizedErrors.length;
        result.total = result.total || result.successCount + result.failedCount;
        if (result.successCount === 0 && result.failedCount > 0) {
          const businessError = new Error(getBatchAssetErrorMessage(result.errors[0]));
          (businessError as any).productionAssetBusinessFailure = true;
          throw businessError;
        }
        return result;
      } catch (error) {
        if ((error as any)?.productionAssetBusinessFailure) {
          syncAssetTasks(session);
          throw error;
        }
        selectedDeriveAssets.forEach(({ derive }) => {
          restoreDeriveAsset(derive);
        });
        syncAssetTasks(session);
        throw error;
      }
    }

    async function updateContext(scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) return;
      await ensureProductionAgentSocketReady(session).catch((error) => {
        console.warn("[productionAgent] failed to update socket context", error);
      });
    }

    async function getHistory(scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) return;
      session.historyReconcileId++;
      session.loadingHistory.value = true;
      const requestId = ++session.historyRequestId;
      try {
        const data = await fetchAgentMemory(session);
        if (requestId !== session.historyRequestId) return;
        const hasLiveMessage = hasLiveGenerationMessage(session.chatApi.messages.value);
        if (hasLiveMessage && session.activeRun.value?.status === "running") {
          session.chatApi.syncGenerationStatus();
          startLiveGenerationHistoryReconcile(session);
          return;
        }
        if (hasLiveMessage) {
          completeLiveGenerationMessages(session.chatApi.messages.value);
          session.chatApi.syncGenerationStatus();
        }
        applyAgentHistory(session, data);
      } finally {
        if (requestId === session.historyRequestId) session.loadingHistory.value = false;
      }
    }

    async function chat(content: string) {
      const session = getActiveSession();
      if (!session) return false;
      if (session.activeRun.value?.status === "running" || session.submitting.value) {
        await syncRunStatus(session.episodeId);
        if (session.activeRun.value?.status !== "running") {
          releaseLocalRunBlock(session);
        }
        if (session.activeRun.value?.status === "running" || session.submitting.value) {
          window.$message?.warning?.(session.activeRun.value?.reason || $t("workbench.production.chatBox.runAlreadyRunning"));
          return false;
        }
      }

      const previousLatestRunId = session.latestRun.value?.runId ?? null;
      session.submitting.value = true;
      try {
        await ensureProductionAgentSocketReady(session);
      } catch (error: any) {
        session.submitting.value = false;
        window.$message?.error?.(error?.message || "Production Agent 连接失败，请重试");
        return false;
      }

      const sent = session.chatApi.chat(content, undefined, getContext(session.episodeId));
      if (!sent) {
        session.submitting.value = false;
        window.$message?.error?.("消息未发送，请检查连接后重试");
        return false;
      }

      clearSubmissionSyncTimer(session);
      session.submissionSyncTimer = setTimeout(() => {
        session.submissionSyncTimer = null;
        void syncRunStatus(session.episodeId).then(() => {
          const activeRun = session.activeRun.value;
          const latestRun = session.latestRun.value;
          if (!activeRun && (latestRun?.runId ?? null) === previousLatestRunId) {
            window.$message?.warning?.("消息未被后端接收，请重试");
          }
        }).finally(() => {
          session.submitting.value = false;
        });
      }, RUN_STATUS_SYNC_DELAY_MS);
      return true;
    }

    function stopGenerate() {
      const session = getActiveSession();
      if (!session || session.activeRun.value?.status !== "running") return false;
      return session.chatApi.stopGenerate(undefined, getContext(session.episodeId));
    }

    function reconnect() {
      const session = getActiveSession();
      if (!session) return;
      session.chatApi.reconnect();
    }

    function updateThinkConfig(value: number) {
      const session = getActiveSession();
      if (!session) return;
      session.thinkLevel.value = value;
      session.chatApi.socket.value?.emit("updateThinkConfig", {
        ...getContext(session.episodeId),
        think: value > 0,
        thinlLevel: value,
      });
    }

    function disposeSession() {
      sessions.forEach((session) => {
        session.assetTaskBindings.forEach((release) => release());
        session.storyboardTaskBindings.forEach((release) => release());
        session.assetTaskBindings.clear();
        session.storyboardTaskBindings.clear();
        clearSubmissionSyncTimer(session);
        stopRunStatusPoll(session);
        session.stopSocketWatch();
        session.chatApi.socket.value?.removeAllListeners();
        session.chatApi.disconnect();
      });
      sessions.clear();
      storeMap.delete(projectId);
    }

    return {
      connected,
      messages,
      chat,
      stopGenerate,
      socket,
      messageStatus,
      currentRun,
      runStatus,
      runReason,
      runCurrentStage,
      runCurrentSubAgent,
      runRunning,
      runStatusLoading,
      runStatusError,
      agentRunDetail,
      runTimeline,
      businessProgress,
      archivedOutputs,
      runDetailLoading,
      runDetailError,
      submitting,
      syncRunStatus,
      recoverPanel,
      flowData,
      setFlowData,
      getFlowData,
      episodesId,
      updateContext,
      getHistory,
      loadingHistory,
      batchGenerateStoryboard,
      batchGenerateAssets,
      reconnect,
      thinkLevel,
      updateThinkConfig,
      disposeSession,
    };
  });
}

const storeMap = new Map<string, ReturnType<typeof makeProductionAgentStore>>();

function createProductionAgentStore(projectId: string) {
  if (!storeMap.has(projectId)) {
    storeMap.set(projectId, makeProductionAgentStore(projectId));
  }
  return storeMap.get(projectId)!;
}

export function disposeProductionAgentStore(projectId?: string | number | null) {
  if (projectId == null || projectId === "") return;
  const useStore = storeMap.get(String(projectId));
  useStore?.().disposeSession();
}

export function disposeAllProductionAgentStores() {
  Array.from(storeMap.values()).forEach((useStore) => {
    useStore().disposeSession();
  });
}

const useEmptyProductionAgentStore = defineStore("productionAgent-empty", () => {
  const connected = ref(false);
  const messages = ref<ChatMessagesData[]>([]);
  const socket = ref(null);
  const messageStatus = ref("idle");
  const currentRun = ref<ProductionAgentRun | null>(null);
  const runStatus = ref<ProductionAgentRunStatus | null>(null);
  const runReason = ref<string | null>(null);
  const runCurrentStage = ref<string | null>(null);
  const runCurrentSubAgent = ref<string | null>(null);
  const runRunning = ref(false);
  const runStatusLoading = ref(false);
  const runStatusError = ref("");
  const agentRunDetail = ref<AgentRunDetail | null>(null);
  const runTimeline = ref<AgentRunTimelineItem[]>([]);
  const businessProgress = ref<AgentBusinessProgress | null>(null);
  const archivedOutputs = ref<FullTextAssetMeta[]>([]);
  const runDetailLoading = ref(false);
  const runDetailError = ref("");
  const submitting = ref(false);
  const flowData = ref<FlowData>(createEmptyFlowData());
  const episodesId = ref<number>();
  const loadingHistory = ref(false);
  const thinkLevel = ref(0);

  async function noopAsync() {}
  function noop() {}

  return {
    connected,
    messages,
    chat: noopAsync,
    stopGenerate: noop,
    socket,
    messageStatus,
    currentRun,
    runStatus,
    runReason,
    runCurrentStage,
    runCurrentSubAgent,
    runRunning,
    runStatusLoading,
    runStatusError,
    agentRunDetail,
    runTimeline,
    businessProgress,
    archivedOutputs,
    runDetailLoading,
    runDetailError,
    submitting,
    syncRunStatus: noopAsync,
    recoverPanel: noopAsync,
    flowData,
    setFlowData: noopAsync,
    getFlowData: noopAsync,
    episodesId,
    updateContext: noop,
    getHistory: noopAsync,
    loadingHistory,
    batchGenerateStoryboard: noopAsync,
    batchGenerateAssets: noopAsync,
    reconnect: noop,
    thinkLevel,
    updateThinkConfig: noop,
    disposeSession: noop,
  };
});

export default function useProductionAgentStore() {
  const id = projectStore().project?.id;
  if (!id) {
    if (import.meta.env.DEV) {
      console.warn("[productionAgent] No project selected, using empty production agent store.");
    }
    return useEmptyProductionAgentStore();
  }
  return createProductionAgentStore(id)();
}
