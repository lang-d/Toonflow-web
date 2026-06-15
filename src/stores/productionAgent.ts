import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat } from "@/utils/useChat";
import type { FlowData, Storyboard } from "@/views/production/utils/flowBuilder";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";
import { useDebounceFn } from "@vueuse/core";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { attachLegacyMediaFields, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import type { MediaRef } from "@/types/api";

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
    onMounted(() => {
      if (messages.value.length <= 0) messages.value = [...defMsg, ...messages.value];
    });

    const flowData = ref<FlowData>({
      script: "",
      scriptPlan: "",
      storyboardTable: "",
      assets: [],
      storyboard: [],
      workbench: {
        videoList: [],
      },
    });

    const episodesId = ref<number>();
    const taskCenter = useTaskCenterStore();
    const assetTaskBindings = new Map<number, () => void>();
    const storyboardTaskBindings = new Map<number, () => void>();

    const { connected, messages, chat, stopGenerate, socket, status, reconnect, connect, disconnect } = useChat({
      url: `${settingStore().baseUrl}/socket/productionAgent`,
      auth: () => ({
        isolationKey: `${projectId}:productionAgent:${episodesId.value}`,
        projectId: projectId,
        scriptId: episodesId.value,
      }),
      manageLifecycle: false,
      autoConnect: false,
      xmlTags: [
        { tag: "script", keepInMessage: false },
        { tag: "scriptPlan", keepInMessage: false },
        { tag: "storyboardTable", keepInMessage: false },
        { tag: "storyboardItem", keepInMessage: false },
      ],
      onXmlTag: async (data) => {
        const { tag, value, children, attrs, status } = data;
        if (tag === "script") {
          flowData.value.script = value ?? "";
        } else if (tag === "scriptPlan") {
          flowData.value.scriptPlan = value ?? "";
        } else if (tag === "storyboardTable") {
          flowData.value.storyboardTable = value ?? "";
        } else if (tag === "storyboardItem") {
          if (status === "complete") {
            const prompt = attrs.prompt ?? "";
            const duration = Number(attrs.duration) || 0;
            const track = attrs.track || "";
            const shouldGenerateImage =
              (typeof attrs.shouldGenerateImage == "boolean" && attrs.shouldGenerateImage) ||
              String(attrs.shouldGenerateImage).toLowerCase() == "true"
                ? 1
                : 0;

            const videoDesc = attrs?.videoDesc ?? "";
            const existingIndex = flowData.value.storyboard.findIndex(
              (s) => s.prompt == prompt && s.duration == duration && videoDesc == s.videoDesc,
            );
            if (existingIndex !== -1) {
              // 宸插瓨鍦ㄥ垯鏇存柊 content锛屼繚鐣?id
              flowData.value.storyboard[existingIndex].prompt = prompt;
            } else {
              flowData.value.storyboard.push({
                prompt: prompt || "",
                duration: Number(duration) || 0,
                state: "未生成" as any,
                src: null,
                associateAssetsIds: JSON.parse(attrs.associateAssetsIds) || [],
                videoDesc: videoDesc,
                shouldGenerateImage: shouldGenerateImage,
              });
              await addStoryboardInfo([
                {
                  prompt: prompt || "",
                  duration: Number(duration) || 0,
                  track: track || "",
                  state: "未生成" as any,
                  src: null,
                  videoDesc,
                  shouldGenerateImage,
                  associateAssetsIds: JSON.parse(attrs.associateAssetsIds) || [],
                },
              ]);
            }
          }
        }
        if (status == "complete") {
          throttledFn();
        }
      },
    });

    function normalizeAssetLike<T extends Record<string, any>>(item: T): T {
      const media = normalizeMediaRef(item.media ?? item, "image");
      return attachLegacyMediaFields(item, media);
    }

    function normalizeFlowData(data: FlowData): FlowData {
      return {
        ...data,
        assets: (data.assets ?? []).map((asset: any) =>
          normalizeAssetLike({
            ...asset,
            derive: (asset.derive ?? []).map((derive: any) => normalizeAssetLike(derive)),
          }),
        ),
        storyboard: (data.storyboard ?? []).map((item: any) => normalizeAssetLike(item)),
      };
    }

    const throttledFn = useDebounceFn(
      () => {
        setFlowData(episodesId.value);
      },
      1_000,
      { maxWait: 3_000 },
    );

    function serializeFlowForAgent() {
      return {
        script: flowData.value.script,
        scriptPlan: flowData.value.scriptPlan,
        storyboardTable: flowData.value.storyboardTable,
        assets: flowData.value.assets.map((item: any) => ({
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
        storyboard: flowData.value.storyboard.map((item: any) => ({
          ...item,
          prompt: undefined,
          src: undefined,
          flowId: undefined,
        })),
        workbench: flowData.value.workbench,
      };
    }

    const stopSocketWatch = watch(
      socket,
      (s) => {
        if (s) {
          s.on("connect", () => {
            getHistory();
          });
          s.on("getFlowData", (_, callback) => {
            callback(serializeFlowForAgent());
          });
          s.on("addDeriveAsset", async (data, callback) => {
            const assets = flowData.value.assets.find((a) => a.id === data.assetsId);
            if (!assets) return callback({ success: false, message: $t("storyboard.assets.notExist") });
            const deriveAssetList = assets.derive || [];
            const item = deriveAssetList.find((d) => d.id === data.id);
            if (item) {
              if (!item) return callback({ success: false, message: $t("storyboard.assets.notDerivativeExist") });
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
          s.on("delDeriveAsset", async (data, callback) => {
            const assets = flowData.value.assets.find((a) => a.id === data.assetsId);
            if (!assets) return callback({ success: false, message: $t("storyboard.assets.notExist") });
            const deriveAssetList = assets.derive || [];
            const index = deriveAssetList.findIndex((d) => d.id === data.id);
            if (index === -1) return callback({ success: false, message: $t("storyboard.assets.notDerivativeExist") });
            deriveAssetList.splice(index, 1);
            callback({ success: true, message: $t("storyboard.assets.derivativeDelSuccess") });
          });
          s.on("generateDeriveAsset", async (data, callback) => {
            const assetsData = await batchGenerateAssets(data.ids);
            callback({ success: true, message: assetsData });
          });
          s.on("generateStoryboard", async (data, callback) => {
            const storyData = await batchGenerateStoryboard(data.ids);
            callback({ success: true, message: storyData });
          });
        }
      },
      { immediate: true },
    );

    async function setFlowData(scriptId?: number) {
      await axios.post("/production/saveFlowData", {
        projectId: projectId,
        data: flowData.value,
        episodesId: scriptId || episodesId.value,
      });
    }

    async function getFlowData() {
      const { data } = await axios.post("/production/getFlowData", {
        projectId: projectId,
        episodesId: episodesId.value,
      });
      flowData.value = normalizeFlowData(data);
      syncLegacyTasks();
    }
    async function batchGenerateStoryboard(allIds: number[], compulsory: boolean = false) {
      allIds.forEach((id) => taskCenter.removeTask(createTaskKey("storyboardImage", Number(projectId), id)));
      try {
        const { data } = await axios.post("/production/storyboard/batchGenerateImage", {
          scriptId: episodesId.value,
          projectId: projectId,
          storyboardIds: allIds,
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
          compulsory,
        });
        if (data) {
          if (flowData.value.storyboard.length === 0) {
            flowData.value.storyboard = data;
            syncStoryboardTasks();
            return data;
          } else {
            flowData.value.storyboard.forEach((item) => {
              const findData = data.find((i: any) => i.id == item.id);
              if (findData) {
                const normalized = normalizeAssetLike(findData);
                item.state = normalized.state;
                item.media = normalized.media as MediaRef | undefined;
                item.src = normalized.src;
                (item as any).taskId = findData.taskId;
              }
            });
          }
        }
        syncStoryboardTasks();
        return data;
      } catch (e) {
        window.$message.error((e as any)?.message);
      }
    }
    async function batchGenerateAssets(allIds: number[]) {
      allIds.forEach((id) => taskCenter.removeTask(createTaskKey("assetImage", Number(projectId), id)));
      flowData.value.assets.forEach((asset) => {
        if (asset.derive) {
          asset.derive.forEach((derive) => {
            if (allIds.includes(derive.id)) {
              derive.state = "生成中" as any;
            }
          });
        }
      });
      syncAssetTasks();
      try {
        const { data } = await axios.post("/production/assets/batchGenerateAssetsImage", {
          assetIds: allIds,
          projectId: projectId,
          scriptId: episodesId.value,
          concurrentCount: settingStore().otherSetting.assetsBatchGenereateSize,
        });
        if (data) {
          data.forEach((record: { id: number; state: any; src: string; taskId?: string; legacyTaskId?: number }) => {
            const normalized = normalizeAssetLike(record) as any;
            flowData.value.assets.forEach((asset) => {
              if (asset.derive) {
                asset.derive.forEach((derive) => {
                  if (derive.id === record.id) {
                    derive.state = normalized.state;
                    (derive as any).media = normalized.media;
                    derive.src = normalized.src;
                    (derive as any).taskId = record.taskId;
                    (derive as any).legacyTaskId = record.legacyTaskId;
                    if ((record as any).prompt !== undefined) derive.prompt = (record as any).prompt;
                  }
                });
              }
            });
          });
        }
        syncAssetTasks();
        return data;
      } catch (e) {}
    }
    function releaseAssetTask(id: number) {
      assetTaskBindings.get(id)?.();
      assetTaskBindings.delete(id);
    }

    function releaseStoryboardTask(id: number) {
      storyboardTaskBindings.get(id)?.();
      storyboardTaskBindings.delete(id);
    }

    function applyAssetTask(derive: any, task: RuntimeTask) {
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
        queueMicrotask(() => releaseAssetTask(derive.id));
      }
    }

    function applyStoryboardTask(item: Storyboard, task: RuntimeTask) {
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
      item.reason = task.reason ?? "";
      if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
        queueMicrotask(() => item.id && releaseStoryboardTask(item.id));
      }
    }

    function syncAssetTasks() {
      const activeIds = new Set<number>();
      flowData.value.assets.forEach((asset) => {
        asset.derive?.forEach((derive) => {
          if (normalizeTaskStatus(derive.state, "pending") !== "processing") return;
          activeIds.add(derive.id);
          const unifiedTaskId = (derive as any).taskId;
          if (assetTaskBindings.has(derive.id) && (!unifiedTaskId || taskCenter.getTask(createTaskKey("assetImage", Number(projectId), derive.id, undefined, unifiedTaskId)))) return;
          if (assetTaskBindings.has(derive.id)) releaseAssetTask(derive.id);
          const key = createTaskKey("assetImage", Number(projectId), derive.id, undefined, unifiedTaskId);
          const release = taskCenter.registerTask(
            {
              key,
              domain: "assetImage",
              unifiedTaskId,
              legacyTaskId: (derive as any).legacyTaskId,
              targetType: "productionAsset",
              targetId: derive.id,
              projectId: Number(projectId),
              scriptId: episodesId.value,
              status: "processing",
            },
            (task) => applyAssetTask(derive, task),
          );
          assetTaskBindings.set(derive.id, release);
        });
      });
      Array.from(assetTaskBindings.keys()).forEach((id) => {
        if (!activeIds.has(id)) releaseAssetTask(id);
      });
    }

    function syncStoryboardTasks() {
      const activeIds = new Set<number>();
      flowData.value.storyboard.forEach((item) => {
        if (!item.id || normalizeTaskStatus(item.state, "pending") !== "processing") return;
        activeIds.add(item.id);
        const unifiedTaskId = (item as any).taskId;
        if (storyboardTaskBindings.has(item.id) && (!unifiedTaskId || taskCenter.getTask(createTaskKey("storyboardImage", Number(projectId), item.id, undefined, unifiedTaskId)))) return;
        if (storyboardTaskBindings.has(item.id)) releaseStoryboardTask(item.id);
        const key = createTaskKey("storyboardImage", Number(projectId), item.id, undefined, unifiedTaskId);
        const release = taskCenter.registerTask(
          {
            key,
            domain: "storyboardImage",
            unifiedTaskId,
            targetType: "storyboard",
            targetId: item.id,
            projectId: Number(projectId),
            scriptId: episodesId.value,
            status: "processing",
          },
          (task) => applyStoryboardTask(item, task),
        );
        storyboardTaskBindings.set(item.id, release);
      });
      Array.from(storyboardTaskBindings.keys()).forEach((id) => {
        if (!activeIds.has(id)) releaseStoryboardTask(id);
      });
    }

    function syncLegacyTasks() {
      syncAssetTasks();
      syncStoryboardTasks();
    }

    function updateContext() {
      if (episodesId.value! < 0) return;
      const ctx = {
        isolationKey: `${projectId}:productionAgent:${episodesId.value}`,
        projectId: projectId,
        scriptId: episodesId.value,
      };
      if (!connected.value) connect();
      socket.value!.emit("updateContext", ctx);
    }
    async function addStoryboardInfo(items: any[]) {
      const { data } = await axios.post("/production/storyboard/batchAddStoryboardInfo", {
        scriptId: episodesId.value,
        data: items,
        projectId: projectId,
      });

      flowData.value.storyboard.forEach((item) => {
        const updated = data.find((d: Storyboard) => d.prompt == item.prompt && d.duration == item.duration && d.videoDesc == item.videoDesc);
        if (updated) {
          const normalized = normalizeAssetLike(updated);
          item.id = updated.id;
          item.trackId = updated.trackId;
          item.media = normalized.media;
          item.src = normalized.src;
          item.state = normalized.state;
          item.associateAssetsIds = updated.associateAssetsIds;
        }
      });
      syncStoryboardTasks();
    }

    const loadingHistory = ref(false);
    async function getHistory() {
      loadingHistory.value = true;
      const { data } = await axios.post(`/agents/getMemory`, {
        projectId: projectId,
        episodesId: episodesId.value,
        agentType: "productionAgent",
      });
      messages.value = [];
      messages.value = [...defMsg, ...data];
      loadingHistory.value = false;
    }

    const thinkLevel = ref(0);

    function updateThinkConfig(value: number) {
      thinkLevel.value = value;
      if (socket.value) {
        socket.value.emit("updateThinkConfig", { think: value > 0, thinlLevel: value });
      }
    }

    function disposeSession() {
      assetTaskBindings.forEach((release) => release());
      storyboardTaskBindings.forEach((release) => release());
      assetTaskBindings.clear();
      storyboardTaskBindings.clear();
      stopSocketWatch();
      socket.value?.removeAllListeners();
      disconnect();
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
  const status = ref("pending");
  const flowData = ref<FlowData>({
    script: "",
    scriptPlan: "",
    storyboardTable: "",
    assets: [],
    storyboard: [],
    workbench: {
      videoList: [],
    },
  });
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
