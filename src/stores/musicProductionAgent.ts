import { computed, ref, watch, type Ref, type WatchStopHandle } from "vue";
import { defineStore } from "pinia";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import settingStore from "@/stores/setting";
import {
  getMusicAgentMemory,
  getMusicAgentRunDetail,
  getMusicAgentRunStatus,
  getMusicTaskSnapshot,
  type MusicAgentRun,
  type MusicRecentTask,
  type MusicRunDetail,
  type MusicTaskTargetType,
  type MusicTimelineEvent,
} from "@/api/productionMusic";
import { useChat } from "@/utils/useChat";

type MusicAgentMode = "project" | "episode";
type MusicChat = ReturnType<typeof useChat>;
type RefreshTarget = "bible" | "plan" | "cues" | "lyrics" | "prompt" | "library" | "audio";

const MUSIC_AGENT_KEY = "musicProductionAgent";
const ACTIVE_RUN_STATUS = "running";
const MUSIC_TASK_TARGET_TYPES: MusicTaskTargetType[] = ["musicBible", "musicPlan", "musicPrompt", "musicLyrics", "musicCueAsset", "musicLibraryVersion"];
const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "cancelled"]);
const RUN_STATUS_POLL_MS = 5_000;
const SOCKET_READY_TIMEOUT_MS = 10_000;

export interface MusicAgentScope {
  projectId: number;
  mode: MusicAgentMode;
  scriptId?: number;
  runScriptId: number;
  isolationKey: string;
}

interface MusicAgentSession {
  scope: MusicAgentScope;
  chatApi: MusicChat;
  activeRun: Ref<MusicAgentRun | null>;
  latestRun: Ref<MusicAgentRun | null>;
  timeline: Ref<MusicTimelineEvent[]>;
  recentTasks: Ref<MusicRecentTask[]>;
  businessProgress: Ref<MusicTimelineEvent | null>;
  runStatusLoading: Ref<boolean>;
  runStatusError: Ref<string>;
  runtimeNotice: Ref<string>;
  runtimeRestartRunId: string | null;
  submitting: Ref<boolean>;
  recoveryRequestId: number;
  recoveryPromise: Promise<void> | null;
  contextPromise: Promise<boolean> | null;
  runStatusPollTimer: number | null;
  runStatusPollRunId: string | null;
  refreshTargets: Ref<RefreshTarget[]>;
  refreshRevision: Ref<number>;
  socketRecoveryRevision: Ref<number>;
  stopSocketWatch: WatchStopHandle;
}

function scopeKey(projectId: number, mode: MusicAgentMode, scriptId?: number) {
  return mode === "episode" && scriptId ? `${projectId}:episode:${scriptId}` : `${projectId}:project`;
}

function createScope(projectId: number, mode: MusicAgentMode, scriptId?: number): MusicAgentScope {
  const episode = mode === "episode" && Number(scriptId) > 0;
  return {
    projectId,
    mode: episode ? "episode" : "project",
    ...(episode ? { scriptId: Number(scriptId) } : {}),
    runScriptId: episode ? Number(scriptId) : 0,
    isolationKey: episode ? `${MUSIC_AGENT_KEY}:${projectId}:episode:${scriptId}` : `${MUSIC_AGENT_KEY}:${projectId}:project`,
  };
}

function normalizeRun(value: unknown): MusicAgentRun | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const runId = source.runId ?? source.run_id;
  if (runId == null || !String(runId).trim() || typeof source.status !== "string") return null;
  return {
    ...source,
    runId: String(runId),
    status: source.status,
    currentStage: source.currentStage == null ? (source.current_stage == null ? null : String(source.current_stage)) : String(source.currentStage),
    currentSubAgent: source.currentSubAgent == null ? (source.current_sub_agent == null ? null : String(source.current_sub_agent)) : String(source.currentSubAgent),
    reason: source.reason == null || !String(source.reason).trim() ? null : String(source.reason),
  };
}

function normalizeTimelineEvent(value: unknown): MusicTimelineEvent | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const payload = source.payload && typeof source.payload === "object" && !Array.isArray(source.payload) ? source.payload as Record<string, unknown> : {};
  const kind = String(source.kind ?? source.eventKind ?? "").trim();
  if (!kind) return null;
  return {
    ...source,
    kind,
    createdAt: source.createdAt == null && source.created_at == null && source.timestamp == null ? null : String(source.createdAt ?? source.created_at ?? source.timestamp),
    stage: source.stage == null ? (payload.stage == null ? null : String(payload.stage)) : String(source.stage),
    subAgent: source.subAgent == null ? (payload.subAgent == null ? null : String(payload.subAgent)) : String(source.subAgent),
    payload,
  };
}

function normalizeHistory(messages: unknown): ChatMessagesData[] {
  if (!Array.isArray(messages)) return [];
  return structuredClone(messages).map((message: any) => ({
    ...message,
    status: "complete",
    content: Array.isArray(message?.content) ? message.content.map((content: any) => ({ ...content, status: "complete" })) : [],
  })) as ChatMessagesData[];
}

function completeLiveMessages(messages: ChatMessagesData[]) {
  let changed = false;
  messages.forEach((message: any) => {
    if (["pending", "streaming", "loading"].includes(message?.status)) {
      message.status = "complete";
      changed = true;
    }
    message?.content?.forEach?.((content: any) => {
      if (["pending", "streaming", "loading"].includes(content?.status)) {
        content.status = "complete";
        changed = true;
      }
    });
  });
  return changed;
}

function taskRefreshTargets(task: Pick<MusicRecentTask, "targetType">): RefreshTarget[] {
  switch (task.targetType) {
    case "musicBible": return ["bible"];
    case "musicPlan": return ["plan", "cues"];
    case "musicLyrics": return ["lyrics"];
    case "musicPrompt": return ["prompt"];
    case "musicCueAsset": return ["cues", "audio"];
    case "musicLibraryVersion": return ["library", "audio"];
    default: return [];
  }
}

export const useMusicProductionAgentStore = defineStore("musicProductionAgent", () => {
  const sessions = new Map<string, MusicAgentSession>();
  const activeKey = ref("");

  function getSession(mode: MusicAgentMode, projectId: number, scriptId?: number) {
    return sessions.get(scopeKey(projectId, mode, scriptId));
  }

  function addRefreshTargets(session: MusicAgentSession, targets: RefreshTarget[]) {
    const next = Array.from(new Set([...session.refreshTargets.value, ...targets]));
    if (next.length === session.refreshTargets.value.length && next.every((item, index) => item === session.refreshTargets.value[index])) return;
    session.refreshTargets.value = next;
    session.refreshRevision.value += 1;
  }

  function stopRunStatusPolling(session: MusicAgentSession) {
    if (session.runStatusPollTimer) window.clearInterval(session.runStatusPollTimer);
    session.runStatusPollTimer = null;
    session.runStatusPollRunId = null;
  }

  function startRunStatusPolling(session: MusicAgentSession) {
    const runId = session.activeRun.value?.runId;
    if (!runId) return stopRunStatusPolling(session);
    if (session.runStatusPollTimer && session.runStatusPollRunId === runId) return;
    stopRunStatusPolling(session);
    session.runStatusPollRunId = runId;
    session.runStatusPollTimer = window.setInterval(() => {
      void syncRunState(session, { loadDetail: true, loadTasks: true }).catch((error: any) => {
        session.runStatusError.value = error?.message || "配乐导演状态同步失败";
      });
    }, RUN_STATUS_POLL_MS);
  }

  function applyRunState(session: MusicAgentSession, activeValue: unknown, latestValue?: unknown) {
    const activeRun = normalizeRun(activeValue);
    const latestRun = normalizeRun(latestValue) ?? activeRun ?? session.latestRun.value;
    session.activeRun.value = activeRun?.status === ACTIVE_RUN_STATUS ? activeRun : null;
    session.latestRun.value = latestRun;
    session.submitting.value = false;
    session.runStatusError.value = "";
    if (session.activeRun.value) {
      session.runtimeNotice.value = "";
      startRunStatusPolling(session);
    } else {
      stopRunStatusPolling(session);
      if (completeLiveMessages(session.chatApi.messages.value)) session.chatApi.syncGenerationStatus();
    }
  }

  function applyTimeline(session: MusicAgentSession, detail: MusicRunDetail) {
    const timeline = (detail.timeline ?? detail.events ?? []).map(normalizeTimelineEvent).filter((item): item is MusicTimelineEvent => Boolean(item));
    session.timeline.value = timeline;
    const latestProgress = [...timeline].reverse().find((item) => item.kind === "agent_progress") ?? null;
    session.businessProgress.value = latestProgress;
    if (detail.run) applyRunState(session, detail.run, detail.run);
    const run = normalizeRun(detail.run);
    if (run?.status === "interrupted" && timeline.some((item) => item.kind === "runtime_restarted") && session.runtimeRestartRunId !== run.runId) {
      session.runtimeRestartRunId = run.runId;
      session.runtimeNotice.value = "Agent runtime 已重启，上一轮运行已中断。";
      void getHistory(session.scope.mode, session.scope.projectId, session.scope.scriptId);
    }
  }

  function applyTaskSnapshot(session: MusicAgentSession, tasks: MusicRecentTask[]) {
    const previous = new Map(session.recentTasks.value.map((task) => [task.taskId, `${task.status}:${task.updatedAt ?? task.updateTime ?? ""}`]));
    session.recentTasks.value = tasks;
    tasks.forEach((task) => {
      const fingerprint = `${task.status}:${task.updatedAt ?? task.updateTime ?? ""}`;
      if (TERMINAL_TASK_STATUSES.has(String(task.status)) && previous.get(task.taskId) !== fingerprint) addRefreshTargets(session, taskRefreshTargets(task));
    });
  }

  async function syncRunDetail(session: MusicAgentSession, runId?: string | null) {
    const targetRunId = runId || session.activeRun.value?.runId || session.latestRun.value?.runId;
    if (!targetRunId) {
      session.timeline.value = [];
      session.businessProgress.value = null;
      return;
    }
    const detail = await getMusicAgentRunDetail({ runId: targetRunId });
    applyTimeline(session, detail);
  }

  async function syncTaskSnapshot(session: MusicAgentSession) {
    const snapshot = await getMusicTaskSnapshot({
      projectId: session.scope.projectId,
      ...(session.scope.mode === "episode" ? { scriptId: session.scope.scriptId } : {}),
      targetTypes: MUSIC_TASK_TARGET_TYPES,
      includeTerminal: true,
      limit: 100,
    });
    applyTaskSnapshot(session, snapshot.tasks ?? []);
  }

  async function syncRunState(session: MusicAgentSession, options: { loadDetail?: boolean; loadTasks?: boolean } = {}) {
    const status = await getMusicAgentRunStatus({ projectId: session.scope.projectId, scriptId: session.scope.runScriptId });
    applyRunState(session, status.activeRun, status.latestRun);
    if (options.loadDetail !== false) await syncRunDetail(session);
    if (options.loadTasks !== false) await syncTaskSnapshot(session);
  }

  function socketContext(session: MusicAgentSession) {
    return {
      projectId: session.scope.projectId,
      mode: session.scope.mode,
      ...(session.scope.scriptId ? { scriptId: session.scope.scriptId } : {}),
      isolationKey: session.scope.isolationKey,
    };
  }

  function waitForSocketConnection(session: MusicAgentSession): Promise<boolean> {
    const socket = session.chatApi.socket.value as any;
    if (!socket) return Promise.resolve(false);
    if (socket.connected) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => finish(false), SOCKET_READY_TIMEOUT_MS);
      const finish = (value: boolean) => {
        window.clearTimeout(timer);
        socket.off("connect", onConnect);
        socket.off("connect_error", onError);
        resolve(value);
      };
      const onConnect = () => finish(true);
      const onError = () => finish(false);
      socket.once("connect", onConnect);
      socket.once("connect_error", onError);
    });
  }

  function confirmSocketContext(session: MusicAgentSession, allowRunningScope = false): Promise<boolean> {
    if (session.contextPromise) return session.contextPromise;
    const socket = session.chatApi.socket.value as any;
    if (!socket?.connected) return Promise.resolve(false);
    socket.auth = { token: localStorage.getItem("token"), ...socketContext(session) };
    session.contextPromise = new Promise((resolve) => {
      const timer = window.setTimeout(() => finish(false), SOCKET_READY_TIMEOUT_MS);
      const finish = (success: boolean, reason?: string) => {
        window.clearTimeout(timer);
        if (!success) session.runStatusError.value = reason || "配乐导演上下文确认失败";
        session.contextPromise = null;
        resolve(success);
      };
      socket.emit("updateContext", socketContext(session), (result: any) => {
        if (result?.success) finish(true);
        else {
          const reason = String(result?.reason || result?.message || "");
          // The Socket handshake already authenticates this exact scope. During a reconnect,
          // the backend intentionally refuses a redundant context update for an active Run.
          if (allowRunningScope && /running|正在运行/i.test(reason)) finish(true);
          else finish(false, reason);
        }
      });
    });
    return session.contextPromise;
  }

  async function ensureSocketReady(session: MusicAgentSession, allowRunningScope = false) {
    if (!session.chatApi.connected.value) {
      if (!session.chatApi.connecting.value) session.chatApi.connect();
      const connected = await waitForSocketConnection(session);
      if (!connected) {
        session.runStatusError.value = "配乐导演连接超时";
        return false;
      }
    }
    return confirmSocketContext(session, allowRunningScope);
  }

  function applyRunUpdate(session: MusicAgentSession, payload: any) {
    if (payload?.agentKey && payload.agentKey !== MUSIC_AGENT_KEY) return;
    if (payload?.projectId != null && Number(payload.projectId) !== session.scope.projectId) return;
    if (payload?.scriptId != null && Number(payload.scriptId) !== session.scope.runScriptId) return;
    if (payload?.terminalPersistenceFailed) {
      session.submitting.value = false;
      session.runtimeNotice.value = "运行终态正在持久化，正在重新同步后端状态。";
    }
    const run = payload?.rejected ? payload?.activeRun ?? payload?.run : payload?.run ?? payload?.activeRun;
    if (run) applyRunState(session, normalizeRun(run)?.status === ACTIVE_RUN_STATUS ? run : null, run);
    if (payload?.rejected) window.$message?.warning?.(payload.reason || "当前配乐导演任务仍在运行");
    void syncRunState(session, { loadDetail: true, loadTasks: true }).catch((error: any) => {
      session.runStatusError.value = error?.message || "配乐导演状态同步失败";
    });
  }

  function ensureSession(mode: MusicAgentMode, projectId: number, scriptId?: number) {
    const key = scopeKey(projectId, mode, scriptId);
    const existing = sessions.get(key);
    if (existing) return existing;
    const scope = createScope(projectId, mode, scriptId);
    let session!: MusicAgentSession;
    const chatApi = useChat({
      url: `${settingStore().baseUrl}/socket/musicProductionAgent`,
      auth: () => socketContext(session),
      autoConnect: false,
      manageLifecycle: false,
      isolated: true,
      onError: (error) => { session.runStatusError.value = error.message || "配乐导演连接失败"; },
    });
    session = {
      scope,
      chatApi,
      activeRun: ref(null),
      latestRun: ref(null),
      timeline: ref([]),
      recentTasks: ref([]),
      businessProgress: ref(null),
      runStatusLoading: ref(false),
        runStatusError: ref(""),
        runtimeNotice: ref(""),
        runtimeRestartRunId: null,
      submitting: ref(false),
      recoveryRequestId: 0,
      recoveryPromise: null,
      contextPromise: null,
      runStatusPollTimer: null,
      runStatusPollRunId: null,
      refreshTargets: ref([]),
      refreshRevision: ref(0),
      socketRecoveryRevision: ref(0),
      stopSocketWatch: () => {},
    };
    session.stopSocketWatch = watch(chatApi.socket, (socket) => {
      if (!socket) return;
      socket.on("connect", () => {
        void confirmSocketContext(session, true).then((ready) => {
          if (!ready) return;
          void recover(scope.mode, scope.projectId, scope.scriptId).then(() => {
            session.socketRecoveryRevision.value += 1;
          });
        });
      });
      socket.on("agent:run:update", (payload: unknown) => applyRunUpdate(session, payload));
    }, { immediate: true });
    sessions.set(key, session);
    return session;
  }

  function activate(mode: MusicAgentMode, projectId: number, scriptId?: number) {
    const session = ensureSession(mode, projectId, scriptId);
    activeKey.value = scopeKey(projectId, mode, scriptId);
    return session;
  }

  function connect(mode: MusicAgentMode, projectId: number, scriptId?: number) {
    const session = activate(mode, projectId, scriptId);
    void ensureSocketReady(session);
    return session;
  }

  function reconnect(mode: MusicAgentMode, projectId: number, scriptId?: number) {
    const session = activate(mode, projectId, scriptId);
    session.chatApi.reconnect();
    return session;
  }

  function recover(mode: MusicAgentMode, projectId: number, scriptId?: number): Promise<void> {
    const session = activate(mode, projectId, scriptId);
    if (session.recoveryPromise) return session.recoveryPromise;
    const requestId = ++session.recoveryRequestId;
    session.runStatusLoading.value = true;
    session.recoveryPromise = (async () => {
      try {
        if (!await ensureSocketReady(session, true)) return;
        await syncRunState(session, { loadDetail: true, loadTasks: true });
      } catch (error: any) {
        if (requestId === session.recoveryRequestId) session.runStatusError.value = error?.message || "配乐导演状态同步失败";
      } finally {
        if (requestId === session.recoveryRequestId) session.runStatusLoading.value = false;
        session.recoveryPromise = null;
      }
    })();
    return session.recoveryPromise;
  }

  async function getHistory(mode: MusicAgentMode, projectId: number, scriptId?: number) {
    const session = activate(mode, projectId, scriptId);
    const memory = await getMusicAgentMemory({ projectId, ...(session.scope.scriptId ? { scriptId: session.scope.scriptId } : {}) });
    session.chatApi.messages.value = normalizeHistory(memory);
    session.chatApi.syncGenerationStatus();
  }

  function takeRefreshTargets(mode: MusicAgentMode, projectId: number, scriptId?: number) {
    const session = getSession(mode, projectId, scriptId);
    if (!session) return [];
    const targets = session.refreshTargets.value;
    session.refreshTargets.value = [];
    return targets;
  }

  async function send(mode: MusicAgentMode, projectId: number, content: string, scriptId?: number): Promise<boolean> {
    const session = activate(mode, projectId, scriptId);
    try {
      await syncRunState(session, { loadDetail: true, loadTasks: true });
      if (session.activeRun.value?.status === ACTIVE_RUN_STATUS) {
        window.$message?.warning?.("当前配乐导演任务仍在后台处理中");
        return false;
      }
      if (!await ensureSocketReady(session)) return false;
      session.submitting.value = true;
      const sent = session.chatApi.chat(content, undefined, socketContext(session));
      if (!sent) return false;
      window.setTimeout(() => {
        void syncRunState(session, { loadDetail: true, loadTasks: true }).catch((error: any) => {
          session.runStatusError.value = error?.message || "配乐导演状态同步失败";
        });
      }, 3_000);
      return true;
    } catch (error: any) {
      session.runStatusError.value = error?.message || "配乐导演暂时不可发送消息";
      return false;
    } finally {
      if (!session.activeRun.value) session.submitting.value = false;
    }
  }

  async function stop(mode: MusicAgentMode, projectId: number, scriptId?: number) {
    const session = activate(mode, projectId, scriptId);
    if (!await ensureSocketReady(session)) return false;
    return session.chatApi.stopGenerate(undefined, socketContext(session));
  }

  function dispose(projectId?: number) {
    Array.from(sessions.entries()).forEach(([key, session]) => {
      if (projectId != null && session.scope.projectId !== projectId) return;
      stopRunStatusPolling(session);
      session.stopSocketWatch();
      session.chatApi.disconnect();
      sessions.delete(key);
      if (activeKey.value === key) activeKey.value = "";
    });
  }

  const activeSession = computed(() => sessions.get(activeKey.value) || null);
  const connected = computed(() => activeSession.value?.chatApi.connected.value ?? false);
  const messages = computed(() => activeSession.value?.chatApi.messages.value ?? []);
  const isGenerating = computed(() => activeSession.value?.chatApi.isGenerating.value ?? false);
  const activeRun = computed(() => activeSession.value?.activeRun.value ?? null);
  const latestRun = computed(() => activeSession.value?.latestRun.value ?? null);
  const timeline = computed(() => activeSession.value?.timeline.value ?? []);
  const recentTasks = computed(() => activeSession.value?.recentTasks.value ?? []);
  const businessProgress = computed(() => activeRun.value?.status === ACTIVE_RUN_STATUS ? activeSession.value?.businessProgress.value ?? null : null);
  const runRunning = computed(() => activeRun.value?.status === ACTIVE_RUN_STATUS);
  const submitting = computed(() => activeSession.value?.submitting.value ?? false);
  const runReason = computed(() => activeSession.value?.runtimeNotice.value || activeRun.value?.reason || latestRun.value?.reason || activeSession.value?.runStatusError.value || "");
  const refreshRevision = computed(() => activeSession.value?.refreshRevision.value ?? 0);
  const socketRecoveryRevision = computed(() => activeSession.value?.socketRecoveryRevision.value ?? 0);

  return { activeSession, connected, messages, isGenerating, activeRun, latestRun, timeline, recentTasks, businessProgress, runRunning, submitting, runReason, refreshRevision, socketRecoveryRevision, activate, recover, getHistory, takeRefreshTargets, connect, reconnect, send, stop, dispose };
});
