import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat, type XmlTagEvent } from "@/utils/useChat";
import type { FlowData, Storyboard, StoryboardGenerationLastFailure, StoryboardTableMeta } from "@/views/production/utils/flowBuilder";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { attachLegacyMediaFields, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type { MediaRef } from "@/types/api";
import type { Ref, WatchStopHandle } from "vue";

type ProductionChat = ReturnType<typeof useChat>;

interface EpisodeSession {
  episodeId: number;
  isolationKey: string;
  flowData: Ref<FlowData>;
  loadingHistory: Ref<boolean>;
  thinkLevel: Ref<number>;
  chatApi: ProductionChat;
  stopSocketWatch: WatchStopHandle;
  assetTaskBindings: Map<number, () => void>;
  storyboardTaskBindings: Map<number, () => void>;
  historyRequestId: number;
  historyReconcileId: number;
  flowRequestId: number;
  contentSavePromise: Promise<void>;
  flowRefreshPromise: Promise<void> | null;
  completedMessageIds: Set<string>;
  storyboardFailureNoticeKeys: Set<string>;
}

const CHAT_TERMINAL_STATUSES = new Set(["complete", "error", "stop"]);
const HISTORY_RECONCILE_MAX_ATTEMPTS = 20;
const HISTORY_RECONCILE_RETRY_DELAY_MS = 3_000;
const HISTORY_RECONCILE_TEXT_TAIL_LENGTH = 80;
const HISTORY_RECONCILE_MIN_TEXT_LENGTH = 120;

function createEmptyFlowData(): FlowData {
  return {
    script: "",
    scriptPlan: "",
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
  return structuredClone(messages).map((message: any) => ({
    ...message,
    status: "complete",
    content: Array.isArray(message?.content)
      ? message.content.map((content: any) => ({
          ...content,
          status: "complete",
    }))
    : [],
  })) as ChatMessagesData[];
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
  const idMatched = messages.find((message: any) => idSet.has(String(message?.id)) && isTerminalHistoryMessage(message));
  if (idMatched) return idMatched;

  const liveTails = liveMessages
    .map(extractMessageText)
    .filter((text) => text.length >= HISTORY_RECONCILE_MIN_TEXT_LENGTH)
    .map((text) => text.slice(-HISTORY_RECONCILE_TEXT_TAIL_LENGTH));
  if (!liveTails.length) return undefined;
  return messages.find((message: any) => {
    if (!isTerminalHistoryMessage(message)) return false;
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

type StoryboardCommitResult =
  | { status: "committed"; rowCount?: number; groupCount?: number; revision?: number }
  | { status: "invalid"; issues?: Array<{ index?: number; field?: string; message?: string }> }
  | { status: "failed"; error?: { message?: string; code?: string } };

function isStoryboardCommitResult(value: any): value is StoryboardCommitResult {
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
      return {
        ...createEmptyFlowData(),
        ...(data ?? {}),
        storyboardTable,
        storyboardTableMeta,
        storyboardGenerationLastFailure,
        assets: (data?.assets ?? []).map((asset: any) =>
          normalizeAssetLike({
            ...asset,
            derive: (asset.derive ?? []).map((derive: any) => normalizeAssetLike(derive)),
          }),
        ),
        storyboard: (data?.storyboard ?? []).map((item: any) =>
          normalizeAssetLike({
            ...item,
            factStatus: normalizeFactStatus(item?.factStatus),
          }),
        ),
      };
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

    function markAgentMessageTerminal(session: EpisodeSession, messageId: string | undefined, status: "complete" | "error") {
      if (!messageId) return;
      const msg = session.chatApi.findMessage(messageId) as any;
      if (!msg) return;
      msg.status = status;
      msg.content?.forEach((content: any) => {
        if (content.status === "pending" || content.status === "streaming") content.status = status;
      });
      session.chatApi.currentMessageId.value = null;
      session.chatApi.status.value = "idle";
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
      if (tag === "script") {
        session.flowData.value.script = value ?? "";
      } else if (tag === "scriptPlan") {
        session.flowData.value.scriptPlan = value ?? "";
      }

      if (status !== "complete" || !isComplete) return;
      if (tag !== "script" && tag !== "scriptPlan") return;
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
        markAgentMessageTerminal(session, messageId, "complete");
        await refreshCompletedAgentFlow(session, messageId);
        return;
      }

      markAgentMessageTerminal(session, messageId, "error");
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

    function handleCommitResultPayload(session: EpisodeSession, payload: unknown, messageId?: string) {
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
          await getHistory(session.episodeId);
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
            socket.emit("updateContext", getContext(session.episodeId));
            if (!hasLiveGenerationMessage(session.chatApi.messages.value)) {
              void getHistory(session.episodeId);
            } else {
              startLiveGenerationHistoryReconcile(session);
            }
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
              item.type = assets.type;
              callback({ success: true, message: $t("storyboard.assets.derivativeUpdateSuccess") });
            } else {
              deriveAssetList.push({
                assetsId: data.assetsId,
                id: data.id,
                name: data.name,
                type: assets.type,
                desc: data.describe,
                prompt: "",
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
            const assetsData = await batchGenerateAssets(data.ids, session.episodeId);
            callback({ success: true, message: assetsData });
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
            const result = event.type === "thinking" ? commitResultFromThinkingTitle(event.data?.title) : extractStoryboardCommitResult(event.data);
            if (result) void handleStoryboardCommitTerminal(session, result, event.messageId);
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
      const chatApi = useChat({
        url: `${settingStore().baseUrl}/socket/productionAgent`,
        auth: () => getContext(scriptId),
        manageLifecycle: false,
        autoConnect: false,
        xmlTags: [
          { tag: "script", keepInMessage: false },
          { tag: "scriptPlan", keepInMessage: false },
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
        chatApi,
        stopSocketWatch: () => {},
        assetTaskBindings: new Map(),
        storyboardTaskBindings: new Map(),
        historyRequestId: 0,
        historyReconcileId: 0,
        flowRequestId: 0,
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
    const status = computed(() => getActiveSession()?.chatApi.status.value ?? "idle");
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
      session.flowData.value = normalizeFlowData(data);
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

    function applyAssetTask(session: EpisodeSession, derive: any, task: RuntimeTask) {
      const record = (task.result ?? {}) as any;
      derive.state =
        task.status === "completed"
          ? ("已完成" as any)
          : task.status === "failed" || task.status === "cancelled"
            ? ("生成失败" as any)
            : ("生成中" as any);
      const media = normalizeMediaRef(record.media ?? record, "image");
      if (media) {
        derive.media = media;
        derive.src = getMediaPreviewUrl(media);
      }
      derive.errorReason = task.reason ?? "";
      if (record.prompt !== undefined) derive.prompt = record.prompt;
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        queueMicrotask(() => releaseAssetTask(session, derive.id));
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
      item.state =
        task.status === "completed"
          ? ("已完成" as any)
          : task.status === "failed" || task.status === "cancelled"
            ? ("生成失败" as any)
            : ("生成中" as any);
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

    function syncAssetTasks(session: EpisodeSession) {
      const activeIds = new Set<number>();
      session.flowData.value.assets.forEach((asset) => {
        asset.derive?.forEach((derive) => {
          if (normalizeTaskStatus(derive.state, "pending") !== "processing") return;
          activeIds.add(derive.id);
          const unifiedTaskId = (derive as any).taskId;
          if (
            session.assetTaskBindings.has(derive.id) &&
            (!unifiedTaskId || taskCenter.getTask(createTaskKey("assetImage", Number(projectId), derive.id, undefined, unifiedTaskId)))
          ) {
            return;
          }
          if (session.assetTaskBindings.has(derive.id)) releaseAssetTask(session, derive.id);
          const release = taskCenter.registerTask(
            {
              key: createTaskKey("assetImage", Number(projectId), derive.id, undefined, unifiedTaskId),
              domain: "assetImage",
              unifiedTaskId,
              legacyTaskId: (derive as any).legacyTaskId,
              targetType: "productionAsset",
              targetId: derive.id,
              projectId: Number(projectId),
              scriptId: session.episodeId,
              status: "processing",
            },
            (task) => applyAssetTask(session, derive, task),
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
        if (!item.id || normalizeTaskStatus(item.state, "pending") !== "processing") return;
        const storyboardId = item.id;
        activeIds.add(storyboardId);
        const unifiedTaskId = (item as any).taskId;
        if (
          session.storyboardTaskBindings.has(storyboardId) &&
          (!unifiedTaskId || taskCenter.getTask(createTaskKey("storyboardImage", Number(projectId), storyboardId, undefined, unifiedTaskId)))
        ) {
          return;
        }
        if (session.storyboardTaskBindings.has(storyboardId)) releaseStoryboardTask(session, storyboardId);
        const release = taskCenter.registerTask(
          {
            key: createTaskKey("storyboardImage", Number(projectId), storyboardId, undefined, unifiedTaskId),
            domain: "storyboardImage",
            unifiedTaskId,
            targetType: "storyboard",
            targetId: storyboardId,
            projectId: Number(projectId),
            scriptId: session.episodeId,
            status: "processing",
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
      allIds.forEach((id) => taskCenter.removeTask(createTaskKey("storyboardImage", Number(projectId), id)));
      try {
        const { data } = await axios.post("/production/storyboard/batchGenerateImage", {
          scriptId: session.episodeId,
          projectId,
          storyboardIds: allIds,
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
          compulsory,
        });
        if (data) {
          if (session.flowData.value.storyboard.length === 0) {
            session.flowData.value.storyboard = data;
            syncStoryboardTasks(session);
            return data;
          }
          session.flowData.value.storyboard.forEach((item) => {
            const findData = data.find((record: any) => record.id === item.id);
            if (findData) {
              const normalized = normalizeAssetLike(findData);
              item.state = normalized.state;
              item.media = normalized.media as MediaRef | undefined;
              item.src = normalized.src;
              (item as any).taskId = findData.taskId;
            }
          });
        }
        syncStoryboardTasks(session);
        return data;
      } catch (error) {
        window.$message.error((error as any)?.message);
      }
    }

    async function batchGenerateAssets(allIds: number[], scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) return;
      allIds.forEach((id) => taskCenter.removeTask(createTaskKey("assetImage", Number(projectId), id)));
      session.flowData.value.assets.forEach((asset) => {
        asset.derive?.forEach((derive) => {
          if (allIds.includes(derive.id)) derive.state = "生成中" as any;
        });
      });
      syncAssetTasks(session);
      try {
        const { data } = await axios.post("/production/assets/batchGenerateAssetsImage", {
          assetIds: allIds,
          projectId,
          scriptId: session.episodeId,
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
        });
        if (data) {
          data.forEach((record: { id: number; state: any; src: string; taskId?: string; legacyTaskId?: number }) => {
            const normalized = normalizeAssetLike(record) as any;
            session.flowData.value.assets.forEach((asset) => {
              asset.derive?.forEach((derive) => {
                if (derive.id === record.id) {
                  derive.state = normalized.state;
                  (derive as any).media = normalized.media;
                  derive.src = normalized.src;
                  (derive as any).taskId = record.taskId;
                  (derive as any).legacyTaskId = record.legacyTaskId;
                  if ((record as any).prompt !== undefined) derive.prompt = (record as any).prompt;
                }
              });
            });
          });
        }
        syncAssetTasks(session);
        return data;
      } catch {}
    }

    function updateContext(scriptId = episodesId.value) {
      const session = getSession(scriptId);
      if (!session) return;
      const ctx = getContext(session.episodeId);
      if (!session.chatApi.connected.value) session.chatApi.connect();
      session.chatApi.socket.value?.emit("updateContext", ctx);
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
        session.chatApi.messages.value = [...cloneDefaultMessages(defMsg), ...normalizeHistoryMessages(data)];
        session.chatApi.syncGenerationStatus();
      } finally {
        if (requestId === session.historyRequestId) session.loadingHistory.value = false;
      }
    }

    function chat(content: string) {
      const session = getActiveSession();
      if (!session) return false;
      return session.chatApi.chat(content, undefined, getContext(session.episodeId));
    }

    function stopGenerate() {
      const session = getActiveSession();
      if (!session) return false;
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
      status,
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

const useEmptyProductionAgentStore = defineStore("productionAgent-empty", () => {
  const connected = ref(false);
  const messages = ref<ChatMessagesData[]>([]);
  const socket = ref(null);
  const status = ref("idle");
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
    status,
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
