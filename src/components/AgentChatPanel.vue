<template>
  <div class="rightChatBox agentChatPanel" :style="{ width: boxWidth + 'px' }">
    <div ref="resizeHandleRef" class="resizeHandle"></div>
    <div class="header f ac jb">
      <span class="text">
        <i-dot theme="outline" :fill="connected ? 'green' : 'red'" />
        {{ title }}
      </span>
      <div class="close">
        <i-click-to-fold size="18" @click.stop="emit('close')" />
      </div>
    </div>
    <div ref="chatBoxRef" class="chatBox">
      <slot name="status" />
      <slot name="before-messages" />
      <t-chat-list :clear-history="false" v-loading="historyLoading">
        <template v-for="message in chatMessages" :key="message.id">
          <t-chat-message
            :message="message"
            :name="message.name"
            :placement="message.role === 'user' ? 'right' : 'left'"
            :variant="message.role === 'user' ? 'base' : 'outline'"
            :status="message.status"
            allowContentSegmentCustom />
          <div v-if="message.actions?.length" class="messageActions">
            <t-button
              v-for="action in message.actions"
              :key="action.value"
              size="small"
              :theme="action.theme || 'primary'"
              :variant="action.variant || 'outline'"
              :disabled="action.disabled || loading"
              @click="emit('action', action.value)">
              {{ action.label }}
            </t-button>
          </div>
        </template>
      </t-chat-list>
      <slot name="timeline" />
      <t-chat-sender
        class="inputBox"
        :disabled="loading || !connected"
        v-model="inputValue"
        :loading="loading"
        :placeholder="placeholder"
        @send="handleSend"
        @stop="emit('stop')">
        <template #footer-prefix>
          <slot name="footer-prefix" />
        </template>
      </t-chat-sender>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMouse, useMousePressed } from "@vueuse/core";

export interface AgentPanelMessage {
  id: string;
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
  name?: string;
  status?: "complete" | "pending" | "streaming" | "error" | "loading";
  actions?: AgentPanelAction[];
}

export interface AgentPanelAction {
  label: string;
  value: string;
  theme?: "default" | "primary" | "success" | "warning" | "danger";
  variant?: "base" | "outline" | "dashed" | "text";
  disabled?: boolean;
}

const props = defineProps<{
  title: string;
  placeholder: string;
  connected: boolean;
  loading: boolean;
  messages: AgentPanelMessage[];
  historyLoading?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  send: [text: string];
  stop: [];
  action: [value: string];
}>();

const inputValue = ref("");
const resizeHandleRef = ref<HTMLElement | null>(null);
const chatBoxRef = ref<HTMLElement | null>(null);
const boxWidth = ref(400);
const MIN_WIDTH = 400;

const { pressed } = useMousePressed({ target: resizeHandleRef });
const { x } = useMouse();
const dragStartX = ref(0);
const dragStartWidth = ref(400);

const chatMessages = computed(() =>
  props.messages.map((message) => {
    const isLoading = message.status === "loading" || message.status === "pending" || message.status === "streaming";
    const status = isLoading ? "pending" : message.status === "error" ? "error" : "complete";
    if (Array.isArray(message.content)) {
      return {
        ...message,
        name: message.name || (message.role === "user" ? $t("components.artifactGenerateDialog.you") : $t("components.artifactGenerateDialog.agent")),
        status,
        content: message.content,
      };
    }
    return {
      id: message.id,
      role: message.role,
      name: message.name || (message.role === "user" ? $t("components.artifactGenerateDialog.you") : $t("components.artifactGenerateDialog.agent")),
      status,
      content: [
        {
          type: "text",
          status,
          data: isLoading ? $t("components.artifactGenerateDialog.generating") : message.content,
        },
      ],
      actions: message.actions,
    };
  }),
);

watch(pressed, (isPressed) => {
  if (isPressed) {
    dragStartX.value = x.value;
    dragStartWidth.value = boxWidth.value;
  }
});

watchEffect(() => {
  if (pressed.value) {
    const maxWidth = window.innerWidth * 0.8;
    boxWidth.value = Math.min(maxWidth, Math.max(MIN_WIDTH, dragStartWidth.value + (dragStartX.value - x.value)));
  }
});

watch(() => props.messages, () => scrollToBottom(), { deep: true });

function handleSend(text: string) {
  const value = text.trim();
  if (!value || props.loading || !props.connected) return;
  emit("send", value);
  inputValue.value = "";
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    const list = chatBoxRef.value?.querySelector<HTMLElement>(".t-chat__list");
    if (list) list.scrollTop = list.scrollHeight;
  });
}
</script>

<style lang="scss" scoped>
.rightChatBox {
  position: absolute;
  top: 10px;
  right: 0;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  z-index: 20;
  min-width: 400px;
  height: calc(100% - 20px);
  margin-right: 5px;
  border-radius: 10px;
  border: 1px solid var(--td-border-level-1-color);
  background-color: var(--td-bg-color-container);
  overflow-y: auto;
  box-shadow: -4px 2px 10px var(--td-shadow-1);

  .resizeHandle {
    user-select: none;
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    z-index: 10;

    &:hover {
      background-color: var(--td-bg-color-container-hover);
    }
  }

  .chatBox {
    width: 100%;
    height: calc(100% - 50px);
    display: flex;
    flex-direction: column;
    padding-left: 8px;

    .inputBox {
      padding-right: 8px;
    }
  }

  :deep(.t-chat__list) {
    flex: 1 1 auto;
    min-height: 0;
    padding-right: 8px;
    overflow: auto;
  }

  .messageActions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: -4px 0 12px 48px;
  }

  .header {
    height: 40px;
    line-height: 40px;
    padding: 0 10px;
    flex-shrink: 0;

    .text {
      font-size: 18px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
    }

    .close {
      cursor: pointer;
      aspect-ratio: 1/1;
    }
  }
}
</style>
