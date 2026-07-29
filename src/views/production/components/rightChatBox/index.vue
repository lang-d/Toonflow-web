<template>
  <div class="rightChatBox" :style="{ width: boxWidth + 'px' }">
    <div ref="resizeHandleRef" class="resizeHandle"></div>
    <div class="header f ac jb">
      <span class="text">
        <i-dot theme="outline" :fill="connected ? 'green' : 'red'" />
        {{ props.title }}
      </span>
      <div class="close">
        <i-click-to-fold size="18" @click.stop="emit('close')" />
      </div>
    </div>
    <div class="chatBox" v-loading="loadingHistory">
      <div v-if="showRunStatus" class="runStatusBar" :class="runStatusClass">
        <div class="runStatusMain">
          <t-loading v-if="runStatusLoading && !runStatus" size="small" />
          <span class="runStatusLabel">{{ runStatusLabel }}</span>
          <span v-if="runDetail" class="runStatusDetail">{{ runDetail }}</span>
          <t-button v-if="runStatusError" size="small" variant="text" @click="productionAgentStore().syncRunStatus()">
            {{ $t("workbench.production.chatBox.retryRunStatus") }}
          </t-button>
        </div>
        <div v-if="runStatusMessage" class="runStatusMessage">{{ runStatusMessage }}</div>
      </div>
      <div v-if="runRunning" class="abortControl">
        <span>{{ abortSubmitting ? $t("workbench.production.chatBox.abortingAgent") : $t("workbench.production.chatBox.runningInputPlaceholder") }}</span>
        <t-button theme="danger" variant="outline" size="small" :loading="abortSubmitting" :disabled="!connected || abortSubmitting" @click="handleAbort">
          {{ $t("workbench.production.chatBox.abortAgent") }}
        </t-button>
      </div>
      <div v-if="archivedOutputs.length" class="archivedReports">
        <article v-for="asset in archivedOutputs" :key="asset.id" class="archivedReport">
          <div>
            <strong>过程输出</strong>
            <p>{{ asset.summary || "长文内容可展开查看" }}</p>
          </div>
          <t-button size="small" variant="outline" @click="openFullTextAsset(asset)">查看长文</t-button>
        </article>
      </div>
      <t-collapse v-if="showTimeline" v-model="expandedPanels" class="runTimelinePanel" expand-icon-placement="right">
        <t-collapse-panel value="timeline">
          <template #header>
            <span>执行轨迹 <small>{{ runTimeline.length }} 项</small></span>
          </template>
          <div v-if="runDetailLoading" class="timelineHint">正在同步运行轨迹…</div>
          <div v-else-if="runDetailError" class="timelineHint error">{{ runDetailError }}</div>
          <ol v-else class="timelineList">
            <li v-for="item in runTimeline" :key="`${item.id}-${item.createdAt}`">
              <span class="timelineDot"></span>
              <div>
                <strong>{{ timelineLabel(item.kind) }}</strong>
                <span>{{ timelineDetail(item) }}</span>
                <t-button v-if="item.fullTextAsset" size="small" variant="text" @click="openFullTextAsset(item.fullTextAsset)">查看长文</t-button>
                <small>{{ formatTimelineTime(item.createdAt) }}</small>
              </div>
            </li>
          </ol>
        </t-collapse-panel>
      </t-collapse>
      <t-chat-list :clear-history="false">
        <template v-for="message in messages" :key="message.id">
          <t-chat-message
            :message="message"
            :name="(message as any).name"
            :placement="message.role === 'user' ? 'right' : 'left'"
            :variant="message.role === 'user' ? 'base' : 'outline'"
            :handleActions="message.role === 'user' ? {} : handleActions"
            :status="message.status"
            allowContentSegmentCustom />
          <div v-if="messageReports(message).length" class="fullTextAssets">
            <article v-for="asset in messageReports(message)" :key="asset.id" class="fullTextAsset">
              <div><strong>过程输出</strong><p>{{ asset.summary || "长文内容可展开查看" }}</p></div>
              <t-button size="small" variant="outline" @click="openFullTextAsset(asset)">查看长文</t-button>
            </article>
          </div>
        </template>
        <t-chat-message
          v-if="awaitingDecisionChatMessage"
          :message="awaitingDecisionChatMessage"
          :name="awaitingDecisionChatMessage.name"
          placement="left"
          variant="outline"
          :handleActions="{}"
          status="complete"
          allowContentSegmentCustom />
      </t-chat-list>
      <t-chat-sender
        class="inputBox"
        :disabled="senderDisabled"
        v-model="inputValue"
        :loading="senderLoading"
        :placeholder="inputPlaceholder"
        @send="handleSend">
        <template #footer-prefix>
          <div class="ac" style="gap: 5px">
            <t-popup trigger="click" placement="top-left">
              <t-button shape="square" variant="outline" size="small">
                <template #icon>
                  <i-setting-config size="16" />
                </template>
              </t-button>
              <template #content>
                <div class="settingMenu">
                  <div class="settingMenuItem" @click="handleReconnect()">
                    <i-api size="14" />
                    <span>{{ $t("workbench.scriptAgent.reconnect") }}</span>
                  </div>
                  <div class="settingMenuItem" @click="handleClearMemory('message')">
                    <i-delete size="14" />
                    <span>{{ $t("workbench.production.chatBox.clearMessageMemory") }}</span>
                  </div>
                  <div class="settingMenuItem" @click="handleClearMemory('summary')">
                    <i-close size="14" />
                    <span>{{ $t("workbench.production.chatBox.clearSummaryMemory") }}</span>
                  </div>
                  <div class="settingMenuItem danger" @click="handleClearMemory('all')">
                    <i-delete-one size="14" />
                    <span>{{ $t("workbench.production.chatBox.clearAllMemory") }}</span>
                  </div>
                </div>
              </template>
            </t-popup>
            <t-popup trigger="click" placement="top" v-if="showThink">
              <t-button size="small" variant="outline" :theme="thinkLevelThemes[thinkLevel] || 'default'">
                <template #icon>
                  <i-tips size="16" />
                </template>
                {{ thinkLevelOptions[thinkLevel]?.label }}
              </t-button>
              <template #content>
                <div class="settingMenu">
                  <div
                    v-for="opt in thinkLevelOptions"
                    :key="opt.value"
                    class="settingMenuItem"
                    :class="{ active: thinkLevel === opt.value }"
                    @click="productionAgentStore().updateThinkConfig(opt.value)">
                    <span>{{ opt.label }}</span>
                  </div>
                </div>
              </template>
            </t-popup>
          </div>
        </template>
      </t-chat-sender>
    </div>
    <t-dialog v-model:visible="fullTextVisible" :header="fullTextTitle" width="min(900px, 92vw)" :footer="false" placement="center" attach="body">
      <div class="fullTextViewer">
        <MdPreview v-if="fullTextContent" :model-value="fullTextContent" :theme="mdTheme" />
        <pre>{{ fullTextContent || "暂无可读取内容" }}</pre>
        <div class="fullTextFooter">
          <span>{{ fullTextFooterLabel }}</span>
          <t-button v-if="!fullTextEof" size="small" :loading="fullTextLoading" @click="loadMoreFullText">加载更多</t-button>
          <span v-else class="fullTextComplete">已加载完整内容</span>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { useMousePressed, useMouse } from "@vueuse/core";
import axios from "@/utils/axios";
import productionAgentStore from "@/stores/productionAgent";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import { getTextAssetContent } from "@/api/textAsset";
import { MdPreview } from "md-editor-v3";
import type { AgentRunTimelineItem, FullTextAssetMeta } from "@/stores/productionAgent";
const { project } = storeToRefs(projectStore());
const { themeSetting } = storeToRefs(settingStore());
const { connected, messages, episodesId, loadingHistory, thinkLevel, runStatus, runReason, runCurrentStage, runCurrentSubAgent, runRunning, runStatusLoading, runStatusError, runTimeline, businessProgress, archivedOutputs, runDetailLoading, runDetailError, submitting, abortSubmitting } =
  storeToRefs(productionAgentStore());
const mdTheme = computed(() => (themeSetting.value.mode === "auto" ? undefined : themeSetting.value.mode));
const thinkLevelOptions = [
  { label: $t("workbench.scriptAgent.thinkLevel.off"), value: 0 },
  { label: $t("workbench.scriptAgent.thinkLevel.light"), value: 1 },
  { label: $t("workbench.scriptAgent.thinkLevel.deep"), value: 2 },
  { label: $t("workbench.scriptAgent.thinkLevel.extreme"), value: 3 },
];
const thinkLevelThemes = ["default", "success", "warning", "danger"] as const;

const props = defineProps({ title: String });

const emit = defineEmits(["close"]);

const inputValue = ref("");
const senderDisabled = computed(() => !connected.value || runRunning.value || submitting.value);
const senderLoading = computed(() => submitting.value);
const inputPlaceholder = computed(() => {
  if (runRunning.value) return $t("workbench.production.chatBox.runningInputPlaceholder");
  if (runStatus.value === "awaiting_user") return $t("workbench.production.chatBox.awaitingDecisionPlaceholder");
  return $t("workbench.production.chatBox.inputPlaceholder");
});
const showRunStatus = computed(() => Boolean(runStatus.value || runStatusLoading.value || runStatusError.value || businessProgress.value));
const runStatusLabel = computed(() => {
  if (runStatus.value === "awaiting_user" && ["supervisionStoryboardTable", "supervisionStoryboardPanel"].includes(runCurrentStage.value || "")) {
    return $t("workbench.production.chatBox.awaitingStoryboardDecision");
  }
  if (runStatus.value === "awaiting_user") return $t(`workbench.production.chatBox.runStatuses.${runStatus.value}`);
  if (businessProgress.value?.title) return businessProgress.value.title;
  if (runStatusLoading.value && !runStatus.value) return $t("workbench.production.chatBox.runStatusSyncing");
  if (!runStatus.value) return $t("workbench.production.chatBox.runStatusUnknown");
  return $t(`workbench.production.chatBox.runStatuses.${runStatus.value}`);
});
const runStatusClass = computed(() => (runStatusError.value ? "is-error" : runStatus.value ? `is-${runStatus.value}` : "is-syncing"));
const runDetail = computed(() => [runCurrentStage.value, runCurrentSubAgent.value].filter(Boolean).join(" / "));
const businessProgressDetail = computed(() => [businessProgress.value?.phase, businessProgress.value?.detail].filter(Boolean).join(" / "));
const runStatusMessage = computed(() => {
  if (runStatusError.value) return runStatusError.value;
  if (runStatus.value === "awaiting_user") return "";
  return businessProgressDetail.value || runReason.value || "";
});
const AWAITING_DECISION_FALLBACK_MAX_LENGTH = 600;
const awaitingDecisionText = computed(() => (runStatus.value === "awaiting_user" ? runReason.value?.trim() || "" : ""));
const awaitingDecisionChatMessage = computed(() => {
  const text = awaitingDecisionText.value;
  if (!text || messageListContainsText(text) || isReportLikeAwaitingText(text)) return null;
  return {
    id: `awaiting-decision-${runCurrentStage.value || "stage"}-${runCurrentSubAgent.value || "agent"}`,
    role: "assistant",
    name: "监制",
    status: "complete",
    content: [{ type: "markdown", status: "complete", data: text }],
  } as any;
});
const showTimeline = computed(() => Boolean(runTimeline.value.length || runDetailLoading.value || runDetailError.value));
const expandedPanels = ref<string[]>([]);
const fullTextVisible = ref(false);
const fullTextAsset = ref<FullTextAssetMeta | null>(null);
const fullTextContent = ref("");
const fullTextSize = ref(0);
const fullTextOffset = ref(0);
const fullTextEof = ref(true);
const fullTextLoading = ref(false);
const FULL_TEXT_PAGE_SIZE = 64 * 1024;
const fullTextTitle = computed(() => fullTextAsset.value?.summary || "长文转录");
const fullTextFooterLabel = computed(() => {
  const parts = [`已加载 ${fullTextContent.value.length} 字符`];
  if (fullTextSize.value > 0) parts.push(`文件 ${fullTextSize.value} bytes`);
  return parts.join(" · ");
});

function messageReports(message: any): FullTextAssetMeta[] {
  const extensions = [message?.ext, ...(Array.isArray(message?.content) ? message.content.map((item: any) => item?.ext) : [])];
  const assets = extensions.flatMap((extension: any) => [extension?.fullTextAsset, ...(Array.isArray(extension?.fullTextAssets) ? extension.fullTextAssets : [])]);
  return Array.from(
    new Map(
      assets
        .filter((asset: any) => Number.isFinite(Number(asset?.id)) && Number(asset.id) > 0)
        .map((asset: any) => [Number(asset.id), { id: Number(asset.id), size: Number(asset.size) || 0, summary: asset.summary == null ? null : String(asset.summary), targetType: String(asset.targetType || "text") }]),
    ).values(),
  );
}

function extractContentText(content: any) {
  const data = content?.data;
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  return [data.text, data.content, data.markdown, data.title, data.message].filter((value) => typeof value === "string").join("\n");
}

function messageListContainsText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return messages.value.some((message: any) => {
    const content = Array.isArray(message?.content) ? message.content.map(extractContentText).join("\n") : "";
    return content.replace(/\s+/g, " ").includes(normalized);
  });
}

function isReportLikeAwaitingText(text: string) {
  if (text.length > AWAITING_DECISION_FALLBACK_MAX_LENGTH) return true;
  return /(?:^|\n)\s*(?:#{1,6}\s*)?Index\s+\d+\b|cameraAngle|cameraMove|associateAssetsIds|visibleEmotion|soundEffects|^\s*\|.*\|\s*$/m.test(text);
}

function timelineLabel(kind?: string) {
  const labels: Record<string, string> = {
    agent_progress: "业务进度 / Progress",
    agent_output_archived: "过程输出 / Transcript",
    stage: "阶段更新",
    storyboard_table_decision: "分镜决策完成",
    storyboard_table_preflight_started: "开始生成前检查",
    storyboard_table_preflight_completed: "生成前检查完成",
    storyboard_table_preflight_failed: "生成前检查失败",
    storyboard_table_generation_started: "开始写入分镜",
    storyboard_table_batch_appended: "分镜批次已写入",
    storyboard_table_committed: "分镜已提交",
    storyboard_table_review_started: "开始独立审核",
    storyboard_table_review_recorded: "审核已保存",
    storyboard_table_review_failed: "审核失败",
    runtime_restarted: "运行时已重启",
    active_scope_deduplicated: "历史运行已收口",
    client_detached: "客户端暂离",
    client_resumed: "客户端恢复",
    interrupted: "运行已中断",
    finished: "运行结束",
  };
  return labels[kind || ""] || "运行事件";
}

function timelineDetail(item: AgentRunTimelineItem) {
  if (item.kind === "agent_progress") {
    return [item.phase, item.detail, [item.stage, item.subAgent].filter(Boolean).join(" / ")].filter(Boolean).join(" / ") || item.title || item.eventType || "";
  }
  if (item.kind === "agent_output_archived") {
    return item.fullTextAsset?.summary || [item.stage, item.subAgent].filter(Boolean).join(" / ") || item.eventType || "";
  }
  return [item.stage, item.subAgent, item.status].filter(Boolean).join(" / ") || item.eventType || "";
}

function formatTimelineTime(value?: number) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function openFullTextAsset(asset: FullTextAssetMeta) {
  fullTextAsset.value = asset;
  fullTextVisible.value = true;
  fullTextContent.value = "";
  fullTextSize.value = asset.size;
  fullTextOffset.value = 0;
  fullTextEof.value = false;
  await loadFullTextAsset();
}

async function loadMoreFullText() {
  const asset = fullTextAsset.value;
  const projectId = Number(project.value?.id || 0);
  if (!asset || !projectId || fullTextLoading.value || fullTextEof.value) return;
  fullTextLoading.value = true;
  try {
    const data = await getTextAssetContent({ projectId, id: asset.id, offset: fullTextOffset.value, limit: FULL_TEXT_PAGE_SIZE });
    const chunk = data.content || "";
    fullTextContent.value += chunk;
    fullTextSize.value = data.size || fullTextContent.value.length;
    fullTextOffset.value += chunk.length;
    fullTextEof.value = Boolean(data.eof) || !chunk.length;
  } catch (error: any) {
    window.$message?.error?.(error?.message || "长文读取失败");
  } finally {
    fullTextLoading.value = false;
  }
}

async function loadFullTextAsset() {
  const asset = fullTextAsset.value;
  const projectId = Number(project.value?.id || 0);
  if (!asset || !projectId || fullTextLoading.value) return;
  fullTextLoading.value = true;
  try {
    while (!fullTextEof.value) {
      const data = await getTextAssetContent({ projectId, id: asset.id, offset: fullTextOffset.value, limit: FULL_TEXT_PAGE_SIZE });
      const chunk = data.content || "";
      fullTextContent.value += chunk;
      fullTextSize.value = data.size || fullTextContent.value.length;
      fullTextOffset.value += chunk.length;
      fullTextEof.value = Boolean(data.eof) || !chunk.length;
    }
  } catch (error: any) {
    window.$message?.error?.(error?.message || "瀹屾暣鎶ュ憡璇诲彇澶辫触");
  } finally {
    fullTextLoading.value = false;
  }
}

async function handleSend(text: string) {
  if (await productionAgentStore().chat(text)) inputValue.value = "";
}
async function handleAbort() {
  await productionAgentStore().abortCurrentRun();
}
function handleReconnect() {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.scriptAgent.msg.reconnect"),
    body: $t("workbench.scriptAgent.msg.notReconnect"),
    confirmBtn: $t("workbench.scriptAgent.msg.keepReconnect"),
    cancelBtn: $t("workbench.scriptAgent.msg.cancel"),
    theme: "warning",
    onConfirm: async () => {
      productionAgentStore().reconnect();
      dialog.destroy();
    },
  });
}

//快捷发送
const handleActions = {
  suggestion: async (data?: any) => {
    const prompt = data?.content?.prompt;
    if (prompt) await productionAgentStore().chat(prompt);
  },
};

let runGuardSyncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRunGuardSync() {
  if (runGuardSyncTimer) clearTimeout(runGuardSyncTimer);
  runGuardSyncTimer = setTimeout(() => {
    runGuardSyncTimer = null;
    if (runRunning.value || submitting.value || abortSubmitting.value) void productionAgentStore().syncRunStatus();
  }, 300);
}
watch(
  [runRunning, submitting, abortSubmitting],
  ([isRunning, isSubmitting, isAborting]) => {
    if (isRunning || isSubmitting || isAborting) scheduleRunGuardSync();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (runGuardSyncTimer) clearTimeout(runGuardSyncTimer);
});

const memoryTypeLabel: Record<string, string> = {
  message: $t("workbench.production.chatBox.messageMemory"),
  summary: $t("workbench.production.chatBox.summaryMemory"),
  all: $t("workbench.production.chatBox.allMemory"),
};
function handleClearMemory(type: "message" | "summary" | "all") {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.production.chatBox.confirmClear"),
    body: $t("workbench.production.chatBox.confirmClearBody", { type: memoryTypeLabel[type] }),
    confirmBtn: $t("workbench.production.chatBox.confirmClearBtn"),
    cancelBtn: $t("workbench.production.cancel"),
    theme: "warning",
    onConfirm: async () => {
      await axios.post(`/agents/clearMemory`, { projectId: project.value?.id, agentType: "productionAgent", episodesId: episodesId.value, type });
      window.$message.success($t("workbench.production.chatBox.memoryCleared", { type: memoryTypeLabel[type] }));
      dialog.destroy();
      productionAgentStore().getHistory();
    },
  });
}

const resizeHandleRef = ref<HTMLElement | null>(null);
const boxWidth = ref(400);
const MIN_WIDTH = 400;
const { pressed } = useMousePressed({ target: resizeHandleRef });
const { x } = useMouse();
const dragStartX = ref(0);
const dragStartWidth = ref(400);
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

const showThink = ref(false);
onMounted(async () => {
  const { data } = await axios.post(`/project/getModelDetails`, { key: "productionAgent" });
  if (data && data.think) {
    showThink.value = true;
  }
});
</script>

<style lang="scss" scoped>
.rightChatBox {
  position: absolute;
  top: 10px;
  right: 0;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  z-index: 9999;
  min-width: 400px;
  height: calc(100% - 20px);
  margin-right: 5px;
  border-radius: 10px;
  border: 1px solid var(--td-border-level-1-color);
  background-color: var(--td-bg-color-container);
  overflow: hidden;

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
  box-shadow: -4px 2px 10px var(--td-shadow-1);
  .chatBox {
    width: 100%;
    min-height: 0;
    height: auto;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    padding-left: 8px;
    .runStatusBar {
      flex-shrink: 0;
      margin: 0 8px 4px 0;
      padding: 7px 10px;
      border-left: 3px solid var(--td-brand-color);
      background: var(--td-brand-color-1);
      font-size: 12px;

      &.is-awaiting_user,
      &.is-cancelled,
      &.is-interrupted {
        border-left-color: var(--td-warning-color);
        background: var(--td-warning-color-1);
      }

      &.is-failed,
      &.is-error {
        border-left-color: var(--td-error-color);
        background: var(--td-error-color-1);
      }

      &.is-completed {
        border-left-color: var(--td-success-color);
        background: var(--td-success-color-1);
      }
    }
    .runStatusMain {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 8px;
    }
    .runStatusLabel {
      flex-shrink: 0;
      font-weight: 600;
    }
    .runStatusDetail {
      min-width: 0;
      overflow: hidden;
      color: var(--td-text-color-secondary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .runStatusMessage {
      margin-top: 3px;
      color: var(--td-text-color-secondary);
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .abortControl {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0 8px 6px 0;
      padding: 7px 10px;
      border: 1px solid var(--td-warning-color-5);
      border-radius: var(--td-radius-small);
      background: var(--td-warning-color-1);
      color: var(--td-text-color-secondary);
      font-size: 12px;
    }
    .inputBox {
      flex: 0 0 auto;
      margin-top: auto;
      padding-right: 8px;
    }
  }
  :deep(.t-chat__list) {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-right: 8px;
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

.runTimelinePanel {
  flex: 0 0 auto;
  margin: 0 8px 6px 0;

  :deep(.t-collapse-panel__header) {
    min-height: 32px;
    padding: 0 10px;
    font-size: 12px;
  }

  :deep(.t-collapse-panel__body) {
    padding: 0 10px 10px;
  }

  small {
    margin-left: 4px;
    color: var(--td-text-color-secondary);
    font-weight: 400;
  }
}

.timelineHint {
  color: var(--td-text-color-secondary);
  font-size: 12px;

  &.error {
    color: var(--td-error-color);
  }
}

.timelineList {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 2px 0 0 12px;
  list-style: none;

  li {
    position: relative;
    min-width: 0;
    padding-left: 10px;

    &:not(:last-child)::before {
      position: absolute;
      top: 12px;
      bottom: -12px;
      left: 0;
      width: 1px;
      background: var(--td-border-level-1-color);
      content: "";
    }
  }

  .timelineDot {
    position: absolute;
    top: 5px;
    left: -3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--td-brand-color);
  }

  strong,
  span,
  small {
    display: block;
  }

  strong {
    font-size: 12px;
  }

  span,
  small {
    margin-top: 2px;
    color: var(--td-text-color-secondary);
    font-size: 11px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
}

.archivedReports {
  flex: 0 0 auto;
  display: grid;
  gap: 6px;
  margin: 0 8px 6px 0;
}

.archivedReport {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 8px;
  padding: 7px 10px;
  border-left: 3px solid var(--td-brand-color);
  background: var(--td-bg-color-secondarycontainer);

  div {
    min-width: 0;
  }

  strong,
  p {
    font-size: 12px;
  }

  p {
    display: -webkit-box;
    margin: 3px 0 0;
    overflow: hidden;
    color: var(--td-text-color-secondary);
    line-height: 1.45;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}

.fullTextAssets {
  display: grid;
  gap: 6px;
  margin: -2px 8px 8px 12px;
}

.fullTextAsset {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-left: 3px solid var(--td-brand-color);
  background: var(--td-bg-color-secondarycontainer);

  div {
    min-width: 0;
  }

  strong,
  p {
    font-size: 12px;
  }

  p {
    display: -webkit-box;
    margin: 3px 0 0;
    overflow: hidden;
    color: var(--td-text-color-secondary);
    line-height: 1.45;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
}

.fullTextViewer {
  display: flex;
  flex-direction: column;
  min-height: 320px;
  max-height: 70vh;

  :deep(.md-editor) {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    border: none;
    box-shadow: none;
  }

  :deep(.md-editor-preview-wrapper) {
    padding: 12px;
  }

  :deep(.md-editor) + pre {
    display: none;
  }

  pre {
    flex: 1 1 auto;
    min-height: 0;
    margin: 0;
    overflow: auto;
    padding: 12px;
    background: var(--td-bg-color-secondarycontainer);
    font: 13px/1.65 var(--td-font-family);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}

.fullTextFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.fullTextComplete {
  color: var(--td-success-color);
}

.settingMenu {
  padding: 4px 0;
  .settingMenuItem {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    &:hover {
      background-color: var(--td-bg-color-container-hover);
    }
    &.danger {
      color: var(--td-error-color);
    }
  }
}
.modelSelCls {
  gap: 5px;
  .paramSelect {
    max-width: 80px;
  }
}
</style>
