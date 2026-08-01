<template>
  <Teleport to="body">
    <div v-if="visible" class="textTestMask" @mousedown.self="handleClose">
      <section class="textTestDialog" role="dialog" aria-modal="true" :aria-label="$t('settings.vendor.test.textTitle') + ' - ' + modelName">
        <header class="dialogHeader">
          <span>{{ $t("settings.vendor.test.textTitle") }} - {{ modelName }}</span>
          <button class="closeButton" type="button" :aria-label="$t('settings.vendor.test.cancel')" @click="handleClose">x</button>
        </header>

        <div class="messageList" ref="messageListRef">
          <div v-if="messages.length === 0" class="emptyHint">
            {{ $t("settings.vendor.test.textEmptyHint") }}
          </div>
          <div v-for="(msg, idx) in messages" :key="idx" class="messageItem" :class="msg.role">
            <div class="bubble">
              <div class="role">
                {{ msg.role === "user" ? $t("settings.vendor.test.you") : $t("settings.vendor.test.assistant") }}
              </div>
              <div class="content">
                <span v-if="msg.thinking" class="thinkContent">{{ msg.thinking }}</span>
                <span>{{ msg.content }}</span>
                <span v-if="msg.loading" class="cursor">|</span>
              </div>
            </div>
          </div>
        </div>

        <div class="inputArea">
          <textarea
            v-model="inputText"
            :placeholder="$t('settings.vendor.test.textInputPlaceholder')"
            :disabled="loading"
            rows="3"
            @keydown.ctrl.enter.exact.prevent="handleSend" />
          <div class="inputActions">
            <span class="hint">Ctrl + Enter {{ $t("settings.vendor.test.send") }}</span>
            <div class="btns">
              <button class="secondaryButton" type="button" :disabled="loading || messages.length === 0" @click="handleClear">
                {{ $t("settings.vendor.test.clearHistory") }}
              </button>
              <button class="primaryButton" type="button" :disabled="loading || !inputText.trim()" @click="handleSend">
                {{ loading ? "..." : $t("settings.vendor.test.send") }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";

const props = defineProps<{
  vendorId: string;
  modelName: string;
}>();
const visible = defineModel<boolean>("visible", { default: false });

interface Message {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  loading?: boolean;
}

const messages = ref<Message[]>([]);
const inputText = ref("");
const loading = ref(false);
const messageListRef = ref<HTMLDivElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  });
}

async function handleSend() {
  const text = inputText.value.trim();
  if (!text || loading.value) return;

  messages.value.push({ role: "user", content: text });
  inputText.value = "";
  loading.value = true;
  const assistantMsg: Message = { role: "assistant", content: "", loading: true };
  messages.value.push(assistantMsg);
  scrollToBottom();

  try {
    const history = messages.value.slice(0, -1).map((message) => ({ role: message.role, content: message.content }));
    const { data } = await axios.post("/setting/vendorConfig/modelTest/textTest", {
      modelName: props.modelName,
      id: props.vendorId,
      messages: history,
    });
    assistantMsg.content = typeof data === "string" ? data : (data?.content ?? JSON.stringify(data));
    assistantMsg.thinking = data?.thinking ?? undefined;
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || error?.response?.data || error?.message || String(error);
    assistantMsg.content = `Error: ${typeof errorMessage === "string" ? errorMessage : JSON.stringify(errorMessage)}`;
  } finally {
    assistantMsg.loading = false;
    loading.value = false;
    scrollToBottom();
  }
}

function handleClear() {
  messages.value = [];
}

function handleClose() {
  visible.value = false;
  messages.value = [];
  inputText.value = "";
  loading.value = false;
}
</script>

<style lang="scss" scoped>
.textTestMask {
  position: fixed;
  z-index: 5000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}

.textTestDialog {
  display: flex;
  flex-direction: column;
  width: min(860px, calc(100vw - 32px));
  height: min(65vh, 680px);
  max-height: calc(100vh - 32px);
  padding: 20px;
  background: var(--td-bg-color-container, #fff);
  border-radius: 8px;
  box-shadow: 0 14px 48px rgba(0, 0, 0, 0.2);

  .dialogHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--td-component-border, #e7e7e7);
    font-size: 16px;
    font-weight: 600;
  }

  .closeButton {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--td-text-color-secondary, #666);
    cursor: pointer;
    font-size: 20px;
    line-height: 1;

    &:hover {
      background: var(--td-bg-color-container-hover, #f5f5f5);
    }
  }

  .messageList {
    flex: 1;
    overflow-y: auto;
    padding: 12px 4px;
    display: flex;
    flex-direction: column;
    gap: 12px;

    .emptyHint {
      margin-top: 80px;
      color: var(--td-text-color-placeholder, #999);
      text-align: center;
      font-size: 14px;
    }

    .messageItem {
      display: flex;

      &.user {
        justify-content: flex-end;

        .bubble {
          background: var(--td-brand-color, #0052d9);
          color: #fff;
          border-radius: 12px 12px 2px 12px;

          .role {
            color: rgba(255, 255, 255, 0.75);
          }
        }
      }

      &.assistant {
        justify-content: flex-start;

        .bubble {
          background: var(--td-bg-color-container-hover, #f5f5f5);
          border-radius: 12px 12px 12px 2px;
        }
      }

      .bubble {
        max-width: 78%;
        padding: 10px 14px;
        font-size: 14px;
        line-height: 1.6;

        .role {
          margin-bottom: 4px;
          font-size: 11px;
          font-weight: 600;
          opacity: 0.6;
        }

        .content {
          white-space: pre-wrap;
          word-break: break-word;
        }

        .thinkContent {
          display: block;
          padding: 4px 8px;
          margin-bottom: 6px;
          color: var(--td-text-color-secondary, #666);
          background: var(--td-bg-color-secondarycontainer, #f5f5f5);
          border-left: 3px solid var(--td-brand-color-light, #b3d4ff);
          border-radius: 0 4px 4px 0;
          font-size: 12px;
        }

        .cursor {
          animation: blink 1s step-end infinite;
        }
      }
    }
  }

  .inputArea {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--td-component-border, #e7e7e7);

    textarea {
      width: 100%;
      min-height: 68px;
      max-height: 150px;
      box-sizing: border-box;
      padding: 8px 12px;
      resize: vertical;
      outline: none;
      border: 1px solid var(--td-component-border, #dcdcdc);
      border-radius: 6px;
      color: var(--td-text-color-primary, #222);
      background: var(--td-bg-color-container, #fff);
      font: inherit;

      &:focus {
        border-color: var(--td-brand-color, #0052d9);
        box-shadow: 0 0 0 2px rgba(0, 82, 217, 0.14);
      }
    }

    .inputActions {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .hint {
        color: var(--td-text-color-placeholder, #999);
        font-size: 12px;
      }

      .btns {
        display: flex;
        gap: 8px;

        button {
          min-height: 28px;
          padding: 0 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;

          &:disabled {
            cursor: not-allowed;
            opacity: 0.55;
          }
        }

        .secondaryButton {
          border: 1px solid var(--td-component-border, #dcdcdc);
          color: var(--td-text-color-primary, #333);
          background: transparent;
        }

        .primaryButton {
          border: 1px solid var(--td-brand-color, #0052d9);
          color: #fff;
          background: var(--td-brand-color, #0052d9);
        }
      }
    }
  }
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}
</style>
