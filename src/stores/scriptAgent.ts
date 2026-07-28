import { computed, ref, watch, type Ref, type WatchStopHandle } from "vue";
import { defineStore } from "pinia";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat } from "@/utils/useChat";

export type ScriptAgentRunStatus = "running" | "awaiting_user" | "completed" | "failed" | "cancelled" | "interrupted";

export interface ScriptAgentRun {
  runId: string;
  status: ScriptAgentRunStatus;
  currentStage: string | null;
  currentSubAgent: string | null;
  reason: string | null;
  resultJson?: unknown;
}

export interface ScriptAgentWorkspace {
  workspaceId: number | null;
  storySkeletonAsset: ScriptAgentTextAsset | null;
  adaptationStrategyAsset: ScriptAgentTextAsset | null;
  scripts: Array<{ id: number; name: string; contentAsset: ScriptAgentTextAsset | null }>;
}

export interface ScriptAgentTextAsset { id: number; size: number; hash?: string; updateTime?: number; }

export interface ScriptAgentArchivedOutput {
  id: number;
  size: number;
  summary: string | null;
  target: string | null;
}

export interface ScriptAgentTimelineItem {
  id: number | string;
  kind: string;
  eventType: string;
  createdAt: number;
  stage: string | null;
  subAgent: string | null;
  status: string | null;
  title: string | null;
  detail: string | null;
  phase: string | null;
  payload: Record<string, unknown>;
  archivedOutput: ScriptAgentArchivedOutput | null;
}

type ScriptAgentChat = ReturnType<typeof useChat>;

interface ScriptAgentSession {
  projectId: number;
  isolationKey: string;
  chatApi: ScriptAgentChat;
  activeRun: Ref<ScriptAgentRun | null>;
  latestRun: Ref<ScriptAgentRun | null>;
  timeline: Ref<ScriptAgentTimelineItem[]>;
  workspace: Ref<ScriptAgentWorkspace>;
  liveProgress: Ref<ScriptAgentTimelineItem | null>;
  submitting: Ref<boolean>;
  loadingWorkspace: Ref<boolean>;
  loadingHistory: Ref<boolean>;
  loadingRun: Ref<boolean>;
  detailRequestId: number;
  runStatusError: Ref<string>;
  workspaceError: Ref<string>;
  pollTimer: ReturnType<typeof setInterval> | null;
  pollRunId: string | null;
  pollInFlight: boolean;
  contextPromise: Promise<boolean> | null;
  recoveryPromise: Promise<void> | null;
  recoveryRevision: Ref<number>;
  stopSocketWatch: WatchStopHandle;
}

const SCRIPT_AGENT_KEY = "scriptAgent";
const SCRIPT_AGENT_SCRIPT_ID = 0;
const RUN_STATUS_POLL_MS = 5_000;
const SOCKET_READY_TIMEOUT_MS = 10_000;

const emptyWorkspace = (): ScriptAgentWorkspace => ({ workspaceId: null, storySkeletonAsset: null, adaptationStrategyAsset: null, scripts: [] });

function payloadOf<T>(response: any): T {
  return (response?.data ?? response ?? {}) as T;
}

function normalizeRun(value: unknown): ScriptAgentRun | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const runId = source.runId ?? source.run_id;
  const status = String(source.status ?? "");
  if (!runId || !["running", "awaiting_user", "completed", "failed", "cancelled", "interrupted"].includes(status)) return null;
  return {
    runId: String(runId),
    status: status as ScriptAgentRunStatus,
    currentStage: source.currentStage == null && source.current_stage == null ? null : String(source.currentStage ?? source.current_stage),
    currentSubAgent: source.currentSubAgent == null && source.current_sub_agent == null ? null : String(source.currentSubAgent ?? source.current_sub_agent),
    reason: source.reason == null || !String(source.reason).trim() ? null : String(source.reason),
    resultJson: source.resultJson ?? source.result_json,
  };
}

function normalizeTimelineItem(value: unknown, index: number): ScriptAgentTimelineItem | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const payload = source.payload && typeof source.payload === "object" && !Array.isArray(source.payload) ? source.payload as Record<string, unknown> : {};
  const kind = String(source.kind ?? source.eventType ?? source.event_type ?? "").trim();
  if (!kind) return null;
  const textAssetId = Number(payload.textAssetId ?? payload.text_asset_id);
  return {
    id: source.id == null ? index : Number(source.id) || String(source.id),
    kind,
    eventType: String(source.eventType ?? source.event_type ?? kind),
    createdAt: Number(source.createdAt ?? source.created_at ?? 0) || 0,
    stage: source.stage == null ? (payload.stage == null ? null : String(payload.stage)) : String(source.stage),
    subAgent: source.subAgent == null && source.sub_agent == null ? (payload.subAgent == null ? null : String(payload.subAgent)) : String(source.subAgent ?? source.sub_agent),
    status: source.status == null ? null : String(source.status),
    title: payload.title == null || !String(payload.title).trim() ? null : String(payload.title),
    detail: payload.detail == null || !String(payload.detail).trim() ? null : String(payload.detail),
    phase: payload.phase == null || !String(payload.phase).trim() ? null : String(payload.phase),
    payload,
    archivedOutput: kind === "agent_output_archived" && Number.isFinite(textAssetId) && textAssetId > 0
      ? { id: textAssetId, size: Number(payload.size) || 0, summary: payload.summary == null || !String(payload.summary).trim() ? null : String(payload.summary), target: payload.target == null ? null : String(payload.target) }
      : null,
  };
}

function normalizeWorkspace(value: unknown): ScriptAgentWorkspace {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const stageAssets = source.stageAssets && typeof source.stageAssets === "object" ? source.stageAssets as Record<string, unknown> : {};
  const normalizeTextAsset = (asset: unknown): ScriptAgentTextAsset | null => {
    if (!asset || typeof asset !== "object") return null;
    const sourceAsset = asset as Record<string, unknown>;
    const id = Number(sourceAsset.id);
    return Number.isFinite(id) && id > 0 ? { id, size: Number(sourceAsset.size) || 0, ...(sourceAsset.hash == null ? {} : { hash: String(sourceAsset.hash) }), ...(sourceAsset.updateTime == null ? {} : { updateTime: Number(sourceAsset.updateTime) || 0 }) } : null;
  };
  return {
    workspaceId: Number(source.workspaceId) || null,
    storySkeletonAsset: normalizeTextAsset(stageAssets.storySkeleton ?? source.storySkeletonAsset),
    adaptationStrategyAsset: normalizeTextAsset(stageAssets.adaptationStrategy ?? source.adaptationStrategyAsset),
    scripts: Array.isArray(source.scripts)
      ? source.scripts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({ id: Number(item.id), name: String(item.name ?? ""), contentAsset: normalizeTextAsset(item.contentAsset) })).filter((item) => Number.isFinite(item.id) && item.id > 0)
      : [],
  };
}

function normalizeHistory(value: unknown): ChatMessagesData[] {
  if (!Array.isArray(value)) return [];
  return structuredClone(value).sort((a: any, b: any) => Number(a?.createTime ?? 0) - Number(b?.createTime ?? 0)).map((message: any) => ({
    ...message,
    status: "complete",
    content: Array.isArray(message?.content) ? message.content.map((content: any) => ({ ...content, status: "complete" })) : [],
  })) as ChatMessagesData[];
}

function completeLiveMessages(messages: ChatMessagesData[]) {
  let changed = false;
  messages.forEach((message: any) => {
    if (["pending", "streaming", "loading"].includes(message?.status)) { message.status = "complete"; changed = true; }
    message?.content?.forEach?.((content: any) => {
      if (["pending", "streaming", "loading"].includes(content?.status)) { content.status = "complete"; changed = true; }
    });
  });
  return changed;
}

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.message || error?.data?.message || error?.message || fallback;
}

const useScriptAgentSessionsStore = defineStore("scriptAgentSessions", () => {
  const sessions = new Map<number, ScriptAgentSession>();
  const activeProjectId = ref<number | null>(null);

  function stopPolling(session: ScriptAgentSession) {
    if (session.pollTimer) clearInterval(session.pollTimer);
    session.pollTimer = null;
    session.pollRunId = null;
    session.pollInFlight = false;
  }

  function finishLocalRun(session: ScriptAgentSession) {
    session.activeRun.value = null;
    session.submitting.value = false;
    stopPolling(session);
    if (completeLiveMessages(session.chatApi.messages.value)) session.chatApi.syncGenerationStatus();
  }

  function startPolling(session: ScriptAgentSession) {
    const runId = session.activeRun.value?.runId;
    if (!runId) return stopPolling(session);
    if (session.pollTimer && session.pollRunId === runId) return;
    stopPolling(session);
    session.pollRunId = runId;
    session.pollTimer = setInterval(() => {
      if (session.pollInFlight || session.activeRun.value?.runId !== runId) return;
      session.pollInFlight = true;
      void syncRunStatus(session).finally(() => { session.pollInFlight = false; });
    }, RUN_STATUS_POLL_MS);
  }

  function applyRunState(session: ScriptAgentSession, activeValue: unknown, latestValue?: unknown) {
    const activeRun = normalizeRun(activeValue);
    const latestRun = normalizeRun(latestValue) ?? activeRun ?? session.latestRun.value;
    session.activeRun.value = activeRun?.status === "running" ? activeRun : null;
    session.latestRun.value = latestRun;
    if (session.activeRun.value) {
      session.submitting.value = false;
      startPolling(session);
    } else {
      finishLocalRun(session);
    }
  }

  async function syncRunStatus(session: ScriptAgentSession) {
    session.loadingRun.value = true;
    try {
      const response = await axios.post("/agent/run/status", {
        agentKey: SCRIPT_AGENT_KEY,
        projectId: session.projectId,
        scriptId: SCRIPT_AGENT_SCRIPT_ID,
      });
      const status = payloadOf<{ activeRun?: unknown; latestRun?: unknown }>(response);
      applyRunState(session, status.activeRun, status.latestRun);
      session.runStatusError.value = "";
      return session.activeRun.value ?? session.latestRun.value;
    } catch (error) {
      session.runStatusError.value = errorMessage(error, "剧本 Agent 运行状态同步失败");
      return null;
    } finally {
      session.loadingRun.value = false;
    }
  }

  async function loadRunDetail(session: ScriptAgentSession, runId?: string | null) {
    const targetRunId = runId ?? session.activeRun.value?.runId ?? session.latestRun.value?.runId;
    if (!targetRunId) {
      session.timeline.value = [];
      session.liveProgress.value = null;
      return null;
    }
    const requestId = ++session.detailRequestId;
    try {
      const response = await axios.post("/agent/run/detail", { runId: targetRunId });
      if (requestId !== session.detailRequestId) return null;
      const currentRunId = session.activeRun.value?.runId ?? session.latestRun.value?.runId ?? null;
      if (currentRunId && currentRunId !== targetRunId) return null;
      const detail = payloadOf<{ run?: unknown; timeline?: unknown[]; events?: unknown[] }>(response);
      const run = normalizeRun(detail.run);
      if (run) applyRunState(session, run.status === "running" ? run : null, run);
      session.timeline.value = (detail.timeline ?? detail.events ?? [])
        .map(normalizeTimelineItem)
        .filter((item): item is ScriptAgentTimelineItem => Boolean(item))
        .sort((left, right) => left.createdAt - right.createdAt || String(left.id).localeCompare(String(right.id)));
      session.liveProgress.value = [...session.timeline.value].reverse().find((item) => item.kind === "agent_progress") ?? null;
      return run;
    } catch (error) {
      session.runStatusError.value = errorMessage(error, "剧本 Agent 执行轨迹同步失败");
      return null;
    }
  }

  async function loadWorkspace(session: ScriptAgentSession) {
    session.loadingWorkspace.value = true;
    try {
      const response = await axios.post("/scriptAgent/workspaceDetail", { projectId: session.projectId, includeContent: false });
      session.workspace.value = normalizeWorkspace(payloadOf(response));
      session.workspaceError.value = "";
    } catch (error) {
      session.workspaceError.value = errorMessage(error, "剧本工作区读取失败");
    } finally {
      session.loadingWorkspace.value = false;
    }
  }

  async function loadHistory(session: ScriptAgentSession) {
    session.loadingHistory.value = true;
    try {
      const response = await axios.post("/agents/getMemory", { projectId: session.projectId, agentType: SCRIPT_AGENT_KEY });
      session.chatApi.messages.value = normalizeHistory(payloadOf(response));
      session.chatApi.syncGenerationStatus();
    } catch (error) {
      session.runStatusError.value = errorMessage(error, "剧本 Agent 历史消息同步失败");
    } finally {
      session.loadingHistory.value = false;
    }
  }

  function socketContext(session: ScriptAgentSession) {
    return { projectId: session.projectId, isolationKey: session.isolationKey };
  }

  function waitForSocket(session: ScriptAgentSession): Promise<boolean> {
    const socket = session.chatApi.socket.value as any;
    if (!socket) return Promise.resolve(false);
    if (socket.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const finish = (result: boolean) => {
        clearTimeout(timer);
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
        resolve(result);
      };
      const onConnect = () => finish(true);
      const onError = () => finish(false);
      const timer = setTimeout(() => finish(false), SOCKET_READY_TIMEOUT_MS);
      socket.once("connect", onConnect);
      socket.once("connect_error", onError);
    });
  }

  function confirmContext(session: ScriptAgentSession, allowRunningScope: boolean) {
    if (session.contextPromise) return session.contextPromise;
    const socket = session.chatApi.socket.value as any;
    if (!socket?.connected) return Promise.resolve(false);
    session.contextPromise = new Promise((resolve) => {
      const finish = (success: boolean, message?: string) => {
        clearTimeout(timer);
        session.contextPromise = null;
        if (!success && message) session.runStatusError.value = message;
        resolve(success);
      };
      const timer = setTimeout(() => finish(false, "剧本 Agent 上下文确认超时"), SOCKET_READY_TIMEOUT_MS);
      socket.emit("updateContext", socketContext(session), (result: any) => {
        if (result?.success) return finish(true);
        const message = String(result?.message || "剧本 Agent 上下文确认失败");
        if (allowRunningScope && /running|正在运行/i.test(message)) return finish(true);
        finish(false, message);
      });
    });
    return session.contextPromise;
  }

  async function ensureSocketReady(session: ScriptAgentSession, allowRunningScope = false) {
    if (!session.chatApi.connected.value) {
      if (!session.chatApi.connecting.value) session.chatApi.connect();
      if (!await waitForSocket(session)) {
        session.runStatusError.value = "剧本 Agent 连接超时";
        return false;
      }
    }
    return confirmContext(session, allowRunningScope);
  }

  async function recoverSession(session: ScriptAgentSession) {
    if (session.recoveryPromise) return session.recoveryPromise;
    session.recoveryPromise = (async () => {
      await ensureSocketReady(session, true);
      await syncRunStatus(session);
      const run = session.activeRun.value ?? session.latestRun.value;
      if (run?.runId) await loadRunDetail(session, run.runId);
      else {
        session.timeline.value = [];
        session.liveProgress.value = null;
      }
      await loadWorkspace(session);
      await loadHistory(session);
      session.recoveryRevision.value += 1;
    })();
    try {
      await session.recoveryPromise;
    } finally {
      session.recoveryPromise = null;
    }
  }

  function handleRunUpdate(session: ScriptAgentSession, payload: any) {
    if (payload?.agentKey && payload.agentKey !== SCRIPT_AGENT_KEY) return;
    if (payload?.projectId != null && Number(payload.projectId) !== session.projectId) return;
    if (payload?.scriptId != null && Number(payload.scriptId) !== SCRIPT_AGENT_SCRIPT_ID) return;
    if (payload?.progress) {
      session.liveProgress.value = normalizeTimelineItem({ kind: "agent_progress", payload: payload.progress, createdAt: payload.serverTime }, -1);
    }
    const activeRun = normalizeRun(payload?.activeRun);
    const run = normalizeRun(payload?.run);
    const resolved = payload?.rejected ? activeRun ?? run : run ?? activeRun;
    if (resolved) applyRunState(session, resolved.status === "running" ? resolved : null, resolved);
    session.submitting.value = false;
    if (payload?.rejected) window.$message?.warning?.(payload.reason || "当前剧本 Agent 仍在运行");
    if (payload?.terminalPersistenceFailed) {
      session.runStatusError.value = "运行终态正在持久化，正在重新同步后端状态";
      void recoverSession(session);
      return;
    }
    if (resolved?.status !== "running" || payload?.terminal || payload?.resumed) void recoverSession(session);
  }

  function ensureSession(projectId: number) {
    const existing = sessions.get(projectId);
    if (existing) return existing;
    let session!: ScriptAgentSession;
    const chatApi = useChat({
      url: `${settingStore().baseUrl}/socket/scriptAgent`,
      auth: () => socketContext(session),
      autoConnect: false,
      manageLifecycle: false,
      isolated: true,
      onError: (error) => { session.runStatusError.value = error.message || "剧本 Agent 连接失败"; },
    });
    session = {
      projectId,
      isolationKey: `${projectId}:${SCRIPT_AGENT_KEY}`,
      chatApi,
      activeRun: ref(null),
      latestRun: ref(null),
      timeline: ref([]),
      workspace: ref(emptyWorkspace()),
      liveProgress: ref(null),
      submitting: ref(false),
      loadingWorkspace: ref(false),
      loadingHistory: ref(false),
      loadingRun: ref(false),
      detailRequestId: 0,
      runStatusError: ref(""),
      workspaceError: ref(""),
      pollTimer: null,
      pollRunId: null,
      pollInFlight: false,
      contextPromise: null,
      recoveryPromise: null,
      recoveryRevision: ref(0),
      stopSocketWatch: () => {},
    };
    session.stopSocketWatch = watch(chatApi.socket, (socket) => {
      if (!socket) return;
      socket.on("connect", () => { void recoverSession(session); });
      socket.on("agent:run:update", (payload: unknown) => handleRunUpdate(session, payload));
      socket.on("scriptAgent:workspace:update", (payload: any) => {
        if (Number(payload?.projectId) === session.projectId) void loadWorkspace(session);
      });
    }, { immediate: true });
    sessions.set(projectId, session);
    return session;
  }

  function activate(projectId: number) {
    activeProjectId.value = projectId;
    return ensureSession(projectId);
  }

  function getActiveSession() {
    return activeProjectId.value == null ? null : sessions.get(activeProjectId.value) ?? null;
  }

  async function chat(content: string) {
    const session = getActiveSession();
    if (!session || !content.trim()) return false;
    await syncRunStatus(session);
    if (session.activeRun.value?.status === "running") {
      window.$message?.warning?.(session.activeRun.value.reason || "当前剧本 Agent 正在运行");
      return false;
    }
    session.submitting.value = true;
    try {
      if (!await ensureSocketReady(session)) return false;
      const previousRunId = session.latestRun.value?.runId ?? null;
      const sent = session.chatApi.chat(content, undefined, socketContext(session));
      if (!sent) {
        window.$message?.error?.("消息未发送，请检查连接后重试");
        return false;
      }
      window.setTimeout(() => {
        void syncRunStatus(session).then(() => {
          if (!session.activeRun.value && session.latestRun.value?.runId === previousRunId) {
            window.$message?.warning?.("消息未被后端接收，请重试");
          }
        });
      }, 3_000);
      return true;
    } catch (error) {
      session.runStatusError.value = errorMessage(error, "剧本 Agent 暂时不可发送消息");
      return false;
    } finally {
      if (!session.activeRun.value) session.submitting.value = false;
    }
  }

  async function stop() {
    const session = getActiveSession();
    if (!session || session.activeRun.value?.status !== "running") return false;
    if (!session.chatApi.connected.value) {
      session.chatApi.connect();
      if (!await waitForSocket(session)) return false;
    }
    return session.chatApi.stopGenerate(undefined, socketContext(session));
  }

  async function saveStage(stage: "storySkeleton" | "adaptationStrategy", content: string) {
    const session = getActiveSession();
    if (!session) return false;
    try {
      await axios.post("/scriptAgent/saveWorkspaceStage", { projectId: session.projectId, stage, content });
      await loadWorkspace(session);
      return true;
    } catch (error: any) {
      if (Number(error?.response?.status ?? error?.status) === 409) await recoverSession(session);
      throw error;
    }
  }

  async function upsertScript(input: { id?: number; name: string; content: string }) {
    const session = getActiveSession();
    if (!session) return false;
    try {
      await axios.post("/scriptAgent/upsertScript", { projectId: session.projectId, ...input });
      await loadWorkspace(session);
      return true;
    } catch (error: any) {
      if (Number(error?.response?.status ?? error?.status) === 409) await recoverSession(session);
      throw error;
    }
  }

  async function deleteScript(id: number) {
    const session = getActiveSession();
    if (!session) return false;
    try {
      await axios.post("/scriptAgent/deleteScript", { projectId: session.projectId, id });
      await loadWorkspace(session);
      return true;
    } catch (error: any) {
      if (Number(error?.response?.status ?? error?.status) === 409) await recoverSession(session);
      throw error;
    }
  }

  function reconnect() {
    getActiveSession()?.chatApi.reconnect();
  }

  function updateThinkConfig(value: number) {
    const session = getActiveSession();
    if (!session) return;
    session.chatApi.socket.value?.emit("updateThinkConfig", { ...socketContext(session), think: value > 0, thinlLevel: value });
  }

  function dispose(projectId?: number) {
    sessions.forEach((session, id) => {
      if (projectId != null && id !== projectId) return;
      stopPolling(session);
      session.stopSocketWatch();
      session.chatApi.disconnect();
      sessions.delete(id);
      if (activeProjectId.value === id) activeProjectId.value = null;
    });
  }

  const current = computed(() => getActiveSession());
  const connected = computed(() => current.value?.chatApi.connected.value ?? false);
  const messages = computed(() => current.value?.chatApi.messages.value ?? []);
  const activeRun = computed(() => current.value?.activeRun.value ?? null);
  const latestRun = computed(() => current.value?.latestRun.value ?? null);
  const workspace = computed(() => current.value?.workspace.value ?? emptyWorkspace());
  const timeline = computed(() => current.value?.timeline.value ?? []);
  const businessProgress = computed(() => activeRun.value?.status === "running" ? current.value?.liveProgress.value ?? null : null);
  const archivedOutputs = computed(() => Array.from(new Map(timeline.value.filter((item) => item.archivedOutput).map((item) => [item.archivedOutput!.id, item.archivedOutput!] as const)).values()).reverse());
  const runRunning = computed(() => activeRun.value?.status === "running");
  const submitting = computed(() => current.value?.submitting.value ?? false);
  const loadingHistory = computed(() => current.value?.loadingHistory.value ?? false);
  const loadingWorkspace = computed(() => current.value?.loadingWorkspace.value ?? false);
  const runStatusError = computed(() => current.value?.runStatusError.value ?? "");
  const workspaceError = computed(() => current.value?.workspaceError.value ?? "");
  const recoveryRevision = computed(() => current.value?.recoveryRevision.value ?? 0);

  return {
    activate,
    recover: async (projectId?: number) => {
      const id = projectId ?? activeProjectId.value;
      if (id == null) return;
      await recoverSession(activate(id));
    },
    syncRunStatus: async () => {
      const session = getActiveSession();
      return session ? syncRunStatus(session) : null;
    },
    loadWorkspace: async () => {
      const session = getActiveSession();
      if (session) await loadWorkspace(session);
    },
    getHistory: async () => {
      const session = getActiveSession();
      if (session) await loadHistory(session);
    },
    connected,
    messages,
    activeRun,
    latestRun,
    workspace,
    timeline,
    businessProgress,
    archivedOutputs,
    runRunning,
    submitting,
    loadingHistory,
    loadingWorkspace,
    runStatusError,
    workspaceError,
    recoveryRevision,
    chat,
    stop,
    saveStage,
    upsertScript,
    deleteScript,
    reconnect,
    updateThinkConfig,
    dispose,
  };
});

export default function useScriptAgentStore() {
  const projectId = Number(projectStore().project?.id);
  if (!Number.isFinite(projectId) || projectId <= 0) throw new Error("No project selected");
  const store = useScriptAgentSessionsStore();
  store.activate(projectId);
  return store;
}
