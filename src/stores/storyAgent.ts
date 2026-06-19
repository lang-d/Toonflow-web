import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { useChat } from "@/utils/useChat";
import type { ChatMessagesData } from "@tdesign-vue-next/chat";

interface StoryChatOptions {
  artifactId?: number;
  includeOpenAnnotations?: boolean;
}

function makeStoryAgentStore(projectId: string) {
  return defineStore(`storyAgent-${projectId}`, () => {
    const defaultMessages: ChatMessagesData[] = [
      {
        id: "welcome",
        role: "assistant",
        status: "complete",
        datetime: new Date().toISOString(),
        content: [
          {
            type: "text",
            status: "complete",
            data: "我是故事创作台助手。你可以从一个想法开始，也可以围绕当前文档继续打磨。",
          },
        ],
      } as ChatMessagesData,
    ];

    const { connected, connecting, messages, chat, stopGenerate, socket, status, connect, disconnect, reconnect, clearMessages } = useChat({
      url: `${settingStore().baseUrl}/socket/storyAgent`,
      auth: () => ({
        isolationKey: `story:${projectId}`,
        projectId,
      }),
      manageLifecycle: false,
      autoConnect: false,
    });

    function ensureWelcomeMessage() {
      if (!messages.value.length) {
        messages.value = [...defaultMessages];
      }
    }

    function send(content: string, options: StoryChatOptions = {}) {
      ensureWelcomeMessage();
      return chat(content, undefined, {
        projectId: Number(projectId),
        artifactId: options.artifactId,
        includeOpenAnnotations: options.includeOpenAnnotations,
      });
    }

    function stop() {
      return stopGenerate(undefined, { projectId: Number(projectId) });
    }

    function resetLocalMessages() {
      clearMessages();
      ensureWelcomeMessage();
    }

    ensureWelcomeMessage();

    return {
      connected,
      connecting,
      messages,
      socket,
      status,
      connect,
      disconnect,
      reconnect,
      send,
      stop,
      resetLocalMessages,
    };
  });
}

const storeMap = new Map<string, ReturnType<typeof makeStoryAgentStore>>();

function createStoryAgentStore(projectId: string) {
  if (!storeMap.has(projectId)) {
    storeMap.set(projectId, makeStoryAgentStore(projectId));
  }
  return storeMap.get(projectId)!;
}

const useEmptyStoryAgentStore = defineStore("storyAgent-empty", () => {
  const connected = ref(false);
  const connecting = ref(false);
  const messages = ref<ChatMessagesData[]>([]);
  const socket = ref(null);
  const status = ref("idle");

  function noop() {
    return false;
  }

  return {
    connected,
    connecting,
    messages,
    socket,
    status,
    connect: noop,
    disconnect: noop,
    reconnect: noop,
    send: noop,
    stop: noop,
    resetLocalMessages: noop,
  };
});

export default function useStoryAgentStore() {
  const id = projectStore().project?.id;
  if (!id) {
    if (import.meta.env.DEV) {
      console.warn("[storyAgent] No project selected, using empty story agent store.");
    }
    return useEmptyStoryAgentStore();
  }
  return createStoryAgentStore(id)();
}
