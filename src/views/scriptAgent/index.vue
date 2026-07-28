<template>
  <div class="scriptAgent" :class="{ agentHidden: !agentVisible }">
    <section class="workspace" v-loading="loadingWorkspace">
      <t-alert v-if="workspaceError" theme="error" :message="workspaceError" close @close="store.loadWorkspace()" />
      <t-tabs v-model="activeTab">
        <template #action>
          <t-space size="small">
            <t-button size="small" variant="outline" @click="agentVisible = !agentVisible"><template #icon><i-message /></template>{{ agentVisible ? "收起 Agent" : "打开 Agent" }}</t-button>
            <t-button v-if="activeTab !== 'scripts'" size="small" :disabled="runRunning" @click="openStageEditor(activeTab)"><template #icon><i-edit /></template>编辑</t-button>
            <t-button v-else size="small" theme="primary" :disabled="runRunning" @click="openCreateScript"><template #icon><i-add /></template>新建剧本</t-button>
          </t-space>
        </template>
        <t-tab-panel value="storySkeleton" label="故事骨架"><div class="reading" v-loading="stageLoading"><t-alert v-if="stageLoadError && activeTab === 'storySkeleton'" theme="error" :message="stageLoadError" close @close="loadActiveStage" /><MdPreview v-else-if="activeTab === 'storySkeleton' && stageContent" :model-value="stageContent" :theme="mdTheme" /><t-empty v-else-if="!workspace.storySkeletonAsset" title="暂无故事骨架" /><p v-else>正在读取故事骨架…</p></div></t-tab-panel>
        <t-tab-panel value="adaptationStrategy" label="改编策略"><div class="reading" v-loading="stageLoading"><t-alert v-if="stageLoadError && activeTab === 'adaptationStrategy'" theme="error" :message="stageLoadError" close @close="loadActiveStage" /><MdPreview v-else-if="activeTab === 'adaptationStrategy' && stageContent" :model-value="stageContent" :theme="mdTheme" /><t-empty v-else-if="!workspace.adaptationStrategyAsset" title="暂无改编策略" /><p v-else>正在读取改编策略…</p></div></t-tab-panel>
        <t-tab-panel value="scripts" label="剧本"><div class="scriptList"><t-empty v-if="!workspace.scripts.length" title="暂无剧本" /><article v-for="script in workspace.scripts" :key="script.id" :ref="(element) => registerScriptCard(script, element as HTMLElement | null)" class="scriptCard"><header><strong>{{ script.name }}</strong><div><t-tooltip content="全屏查看"><t-button size="small" variant="text" :loading="scriptContentLoadingId === script.id" @click="openScriptFullscreen(script)"><template #icon><i-full-screen-one /></template></t-button></t-tooltip><t-button size="small" variant="text" :disabled="runRunning" :loading="scriptContentLoadingId === script.id" @click="openScriptEditor(script)"><template #icon><i-edit /></template></t-button><t-button size="small" variant="text" theme="danger" :disabled="runRunning" @click="removeScript(script.id)"><template #icon><i-delete /></template></t-button></div></header><div class="scriptCardContent" v-loading="scriptCardLoading[script.id]"><MdPreview v-if="scriptCardLoaded[script.id] && scriptCardContent[script.id]" class="scriptMarkdown" :model-value="scriptCardContent[script.id]" :theme="mdTheme" preview-only /><p v-else-if="scriptCardLoaded[script.id]" class="scriptMeta">剧本正文为空</p><div v-else-if="scriptCardError[script.id]" class="scriptCardError"><span>{{ scriptCardError[script.id] }}</span><t-button size="small" variant="outline" @click="loadScriptCard(script)">重试</t-button></div><p v-else class="scriptMeta">{{ script.contentAsset ? `正文 ${formatTextSize(script.contentAsset.size)}` : "暂无正文" }}</p></div></article></div></t-tab-panel>
      </t-tabs>
    </section>
    <aside v-if="agentVisible" class="agentSlot">
    <AgentChatPanel title="剧本 Agent" placeholder="描述你希望剧本 Agent 推进的工作" :connected="connected" :loading="runRunning || submitting" :history-loading="loadingHistory" :messages="agentMessages" @send="handleSend" @stop="handleStop" @close="agentVisible = false">
      <template #status>
        <section v-if="runStatusText || businessProgress || runStatusError" class="runStatus" :class="{ running: runRunning, error: runStatusError }">
          <strong>{{ runStatusText }}</strong>
          <span v-if="businessProgress?.title">{{ businessProgress.title }}</span>
          <small v-if="businessProgress?.detail || businessProgress?.phase">{{ businessProgress?.detail || businessProgress?.phase }}</small>
          <small v-else-if="runStatusError">{{ runStatusError }}</small>
          <small v-else-if="latestRun?.reason && latestRun?.status !== 'awaiting_user'">{{ latestRun.reason }}</small>
        </section>
        <section v-if="archivedOutputs.length" class="archivedOutputs">
          <article v-for="asset in archivedOutputs" :key="asset.id"><div><strong>过程输出</strong><p>{{ asset.summary || '可展开查看归档长文' }}</p></div><t-button size="small" variant="outline" @click="openFullText(asset)">查看长文</t-button></article>
        </section>
      </template>
      <template #before-messages>
        <t-collapse v-if="timeline.length" class="timeline" expand-icon-placement="right"><t-collapse-panel value="timeline"><template #header>执行轨迹 <small>{{ timeline.length }} 项</small></template><ol><li v-for="item in timeline" :key="`${item.id}-${item.createdAt}`"><div><strong>{{ timelineLabel(item.kind) }}</strong><span>{{ timelineDetail(item) }}</span><small>{{ formatTime(item.createdAt) }}</small></div><t-button v-if="item.archivedOutput" size="small" variant="text" @click="openFullText(item.archivedOutput)">查看长文</t-button></li></ol></t-collapse-panel></t-collapse>
      </template>
      <template #footer-prefix><t-popup trigger="click" placement="top-left"><t-button shape="square" variant="outline" size="small"><template #icon><i-setting-config size="16" /></template></t-button><template #content><div class="settingMenu"><button type="button" @click="store.reconnect()"><i-api size="14" />重连 Agent</button><button type="button" @click="clearMemory('message')"><i-delete size="14" />清除消息记忆</button><button type="button" @click="clearMemory('summary')"><i-close size="14" />清除摘要记忆</button><button type="button" class="danger" @click="clearMemory('all')"><i-delete-one size="14" />清除全部记忆</button></div></template></t-popup></template>
    </AgentChatPanel>
    </aside>
    <t-dialog v-model:visible="editorVisible" :header="editorTitle" width="min(1000px, 90vw)" :confirm-btn="{ content: '保存', theme: 'primary', loading: savingEditor }" @confirm="saveEditor" @close="editorVisible = false"><div class="editorForm"><t-input v-if="editor.kind === 'script'" v-model="editor.name" placeholder="剧本名称" /><MdEditor v-model="editor.content" :theme="mdTheme" :toolbars="toolbars" :footers="[]" style="height: 58vh" @onUploadImg="() => {}" @drop.prevent /></div></t-dialog>
    <t-dialog v-model:visible="scriptFullscreenVisible" :header="fullscreenScript?.name || '剧本阅读'" :footer="false" fullscreen attach="body" class="scriptFullscreenDialog"><article class="scriptFullscreenReader"><MdPreview v-if="fullscreenScript" class="scriptMarkdown fullscreenMarkdown" :model-value="fullscreenScript.content" :theme="mdTheme" preview-only /></article></t-dialog>
    <t-dialog v-model:visible="fullTextVisible" :header="fullTextAsset?.summary || '长文转录'" width="min(900px, 92vw)" :footer="false" attach="body"><div class="fullText"><MdPreview v-if="fullTextContent" :model-value="fullTextContent" :theme="mdTheme" /><p v-else>暂无可读取内容</p><footer><span>已加载 {{ fullTextContent.length }} 字符 · 文件 {{ fullTextAsset?.size || 0 }} bytes</span><t-button v-if="!fullTextEof" size="small" :loading="fullTextLoading" @click="loadMoreText">加载更多</t-button><span v-else>已加载完整内容</span></footer></div></t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { MdEditor, MdPreview, type ToolbarNames } from "md-editor-v3";
import axios from "@/utils/axios";
import { getFullTextAssetContent, getTextAssetContent } from "@/api/textAsset";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import scriptAgentStore, { type ScriptAgentArchivedOutput, type ScriptAgentTextAsset, type ScriptAgentTimelineItem } from "@/stores/scriptAgent";
import AgentChatPanel, { type AgentPanelMessage } from "@/components/AgentChatPanel.vue";

const store = scriptAgentStore();
const { project } = storeToRefs(projectStore());
const { themeSetting } = storeToRefs(settingStore());
const { connected, messages, latestRun, workspace, timeline, businessProgress, archivedOutputs, runRunning, submitting, loadingHistory, loadingWorkspace, runStatusError, workspaceError } = storeToRefs(store);
const mdTheme = computed(() => (themeSetting.value.mode === "auto" ? undefined : themeSetting.value.mode));
const activeTab = ref<"storySkeleton" | "adaptationStrategy" | "scripts">("storySkeleton");
const agentVisible = ref(true);
const toolbars: ToolbarNames[] = ["bold", "underline", "italic", "strikeThrough", "-", "title", "quote", "unorderedList", "orderedList", "task", "-", "codeRow", "table", "-", "revoke", "next", "=", "preview"];
const lifecycleLabels: Record<string, string> = { running: "Agent 运行中", awaiting_user: "等待用户决定", completed: "本轮已完成", failed: "任务失败", cancelled: "已取消", interrupted: "运行已中断" };
const runStatusText = computed(() => businessProgress.value?.title || lifecycleLabels[latestRun.value?.status || ""] || (connected.value ? "已连接" : "连接中"));
const agentMessages = computed<AgentPanelMessage[]>(() => {
  const history = messages.value as unknown as AgentPanelMessage[];
  return awaitingDecisionMessage.value ? [...history, awaitingDecisionMessage.value as AgentPanelMessage] : history;
});

const editorVisible = ref(false);
const savingEditor = ref(false);
const editor = ref<{ kind: "stage" | "script"; stage?: "storySkeleton" | "adaptationStrategy"; id?: number; name: string; content: string }>({ kind: "stage", name: "", content: "" });
const editorTitle = computed(() => editor.value.kind === "script" ? (editor.value.id ? "编辑剧本" : "新建剧本") : editor.value.stage === "storySkeleton" ? "编辑故事骨架" : "编辑改编策略");
const scriptFullscreenVisible = ref(false);
const fullscreenScript = ref<{ id: number; name: string; content: string } | null>(null);
const textAssetCache = new Map<number, string>();
const stageContent = ref("");
const stageLoading = ref(false);
const stageLoadError = ref("");
const scriptContentLoadingId = ref<number>();
const scriptCardContent = reactive<Record<number, string>>({});
const scriptCardLoading = reactive<Record<number, boolean>>({});
const scriptCardLoaded = reactive<Record<number, boolean>>({});
const scriptCardError = reactive<Record<number, string>>({});
const scriptCardElements = new Map<number, HTMLElement>();
let scriptCardObserver: IntersectionObserver | null = null;
let stageRequestId = 0;

const fullTextVisible = ref(false);
const fullTextAsset = ref<ScriptAgentArchivedOutput | null>(null);
const fullTextContent = ref("");
const fullTextOffset = ref(0);
const fullTextLoading = ref(false);
const fullTextEof = ref(false);
const FULL_TEXT_PAGE_SIZE = 12_000;

const awaitingDecisionMessage = computed(() => {
  if (latestRun.value?.status !== "awaiting_user") return null;
  const raw = latestRun.value.resultJson;
  let result: Record<string, unknown> = {};
  try { result = typeof raw === "string" ? JSON.parse(raw) : raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; } catch { result = {}; }
  const lines = [latestRun.value.reason, result.question, Array.isArray(result.options) && result.options.length ? `可选项：${result.options.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("；")}` : "", result.context].filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  if (!lines.length) return null;
  return { id: `awaiting-${latestRun.value.runId}`, role: "assistant", status: "complete", content: [{ type: "markdown", status: "complete", data: lines.join("\n\n") }] } as any;
});

onMounted(() => { void store.recover(); });
watch([activeTab, () => workspace.value.workspaceId, () => workspace.value.storySkeletonAsset?.id, () => workspace.value.adaptationStrategyAsset?.id], () => { void loadActiveStage(); }, { immediate: true });
watch(() => workspace.value.scripts.map((script) => `${script.id}:${script.contentAsset?.id || 0}`).join("|"), () => {
  scriptCardObserver?.disconnect();
  scriptCardElements.clear();
  textAssetCache.clear();
  [scriptCardContent, scriptCardLoading, scriptCardLoaded, scriptCardError].forEach((state) => Object.keys(state).forEach((key) => delete state[Number(key)]));
});
onBeforeUnmount(() => scriptCardObserver?.disconnect());
watch(() => project.value?.id, (id, previous) => {
  if (!id || id === previous) return;
  store.activate(Number(id));
  void store.recover(Number(id));
});

async function handleSend(text: string) {
  await store.chat(text);
}

function handleStop() { void store.stop(); }

function activeStageAsset() { return activeTab.value === "storySkeleton" ? workspace.value.storySkeletonAsset : workspace.value.adaptationStrategyAsset; }
function formatTextSize(size?: number) { if (!size) return "0 B"; return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
async function readTextAsset(asset: ScriptAgentTextAsset | null) {
  if (!asset || !project.value?.id) return "";
  const cached = textAssetCache.get(asset.id);
  if (cached != null) return cached;
  const content = await getFullTextAssetContent({ projectId: Number(project.value.id), id: asset.id });
  textAssetCache.set(asset.id, content);
  return content;
}
function ensureScriptCardObserver() {
  if (scriptCardObserver || typeof IntersectionObserver === "undefined") return;
  scriptCardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const script = workspace.value.scripts.find((item) => item.id === Number((entry.target as HTMLElement).dataset.scriptId));
      if (script) void loadScriptCard(script);
      scriptCardObserver?.unobserve(entry.target);
    });
  }, { rootMargin: "160px 0px" });
}
function registerScriptCard(script: { id: number; name: string; contentAsset: ScriptAgentTextAsset | null }, element: HTMLElement | null) {
  if (!element) return;
  scriptCardElements.set(script.id, element);
  element.dataset.scriptId = String(script.id);
  ensureScriptCardObserver();
  if (scriptCardObserver) scriptCardObserver.observe(element);
  else void loadScriptCard(script);
}
async function loadScriptCard(script: { id: number; name: string; contentAsset: ScriptAgentTextAsset | null }) {
  if (scriptCardLoaded[script.id] || scriptCardLoading[script.id]) return;
  scriptCardLoading[script.id] = true;
  scriptCardError[script.id] = "";
  try {
    scriptCardContent[script.id] = await readTextAsset(script.contentAsset);
    scriptCardLoaded[script.id] = true;
  } catch (error: any) {
    scriptCardError[script.id] = error?.message || "剧本正文读取失败";
  } finally {
    scriptCardLoading[script.id] = false;
  }
}
async function loadActiveStage() {
  if (activeTab.value === "scripts") return;
  const requestId = ++stageRequestId;
  const asset = activeStageAsset();
  stageContent.value = "";
  stageLoadError.value = "";
  if (!asset) return;
  stageLoading.value = true;
  try { const content = await readTextAsset(asset); if (requestId === stageRequestId) stageContent.value = content; }
  catch (error: any) { if (requestId === stageRequestId) stageLoadError.value = error?.message || "正文读取失败，请重试"; }
  finally { if (requestId === stageRequestId) stageLoading.value = false; }
}
async function openStageEditor(stage: "storySkeleton" | "adaptationStrategy") {
  if (activeTab.value !== stage) activeTab.value = stage;
  await loadActiveStage();
  if (stageLoadError.value) return;
  editor.value = { kind: "stage", stage, name: "", content: stageContent.value };
  editorVisible.value = true;
}

function openCreateScript() {
  editor.value = { kind: "script", name: "", content: "" };
  editorVisible.value = true;
}

async function openScriptEditor(script: { id: number; name: string; contentAsset: ScriptAgentTextAsset | null }) {
  scriptContentLoadingId.value = script.id;
  try { editor.value = { kind: "script", id: script.id, name: script.name, content: await readTextAsset(script.contentAsset) }; editorVisible.value = true; }
  catch (error: any) { window.$message.error(error?.message || "剧本正文读取失败，请重试"); }
  finally { scriptContentLoadingId.value = undefined; }
}

async function openScriptFullscreen(script: { id: number; name: string; contentAsset: ScriptAgentTextAsset | null }) {
  scriptContentLoadingId.value = script.id;
  try { fullscreenScript.value = { id: script.id, name: script.name, content: await readTextAsset(script.contentAsset) }; scriptFullscreenVisible.value = true; }
  catch (error: any) { window.$message.error(error?.message || "剧本正文读取失败，请重试"); }
  finally { scriptContentLoadingId.value = undefined; }
}

async function saveEditor() {
  if (runRunning.value) return;
  savingEditor.value = true;
  try {
    if (editor.value.kind === "stage" && editor.value.stage) {
      await store.saveStage(editor.value.stage, editor.value.content);
    } else {
      const name = editor.value.name.trim();
      if (!name) { window.$message.warning("请输入剧本名称"); return; }
      await store.upsertScript({ id: editor.value.id, name, content: editor.value.content });
    }
    editorVisible.value = false;
    textAssetCache.clear();
    void loadActiveStage();
    window.$message.success("已保存到剧本工作区");
  } catch (error: any) {
    if (Number(error?.response?.status ?? error?.status) === 409) window.$message.error("Agent 正在保存工作区，已刷新后端内容；请在完成后再提交当前草稿。");
    else window.$message.error(error?.response?.data?.message || error?.message || "保存失败");
  } finally {
    savingEditor.value = false;
  }
}

function removeScript(id: number) {
  const dialog = DialogPlugin.confirm({
    header: "删除剧本",
    body: "删除后不可恢复，确认继续吗？",
    theme: "danger",
    onConfirm: async () => {
      try { await store.deleteScript(id); window.$message.success("剧本已删除"); dialog.destroy(); }
      catch (error: any) { window.$message.error(Number(error?.response?.status ?? error?.status) === 409 ? "Agent 正在运行，已刷新工作区。" : error?.message || "删除失败"); }
    },
  });
}

function clearMemory(type: "message" | "summary" | "all") {
  const names = { message: "消息记忆", summary: "摘要记忆", all: "全部记忆" };
  const dialog = DialogPlugin.confirm({
    header: "清除记忆",
    body: `确认清除${names[type]}吗？`,
    theme: type === "all" ? "warning" : "default",
    onConfirm: async () => {
      try {
        await axios.post("/agents/clearMemory", { projectId: project.value?.id, agentType: "scriptAgent", type });
        await store.getHistory();
        window.$message.success("记忆已清除");
        dialog.destroy();
      } catch (error: any) { window.$message.error(error?.message || "清除失败"); }
    },
  });
}

function timelineLabel(kind: string) {
  return ({ agent_progress: "业务进度", agent_output_archived: "过程输出", runtime_restarted: "运行时已重启", active_scope_deduplicated: "历史运行已收口", client_detached: "客户端暂离", client_resumed: "客户端恢复", interrupted: "运行已中断", finished: "运行结束", stage: "阶段更新" } as Record<string, string>)[kind] || "运行事件";
}

function timelineDetail(item: ScriptAgentTimelineItem) {
  if (item.kind === "agent_progress") return [item.title, item.phase, item.detail].filter(Boolean).join(" / ");
  if (item.kind === "agent_output_archived") return item.archivedOutput?.summary || item.archivedOutput?.target || "已归档长文";
  return [item.stage, item.subAgent, item.status, typeof item.payload.reason === "string" ? item.payload.reason : ""].filter(Boolean).join(" / ");
}

function formatTime(value: number) { return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""; }

async function openFullText(asset: ScriptAgentArchivedOutput) {
  fullTextAsset.value = asset;
  fullTextContent.value = "";
  fullTextOffset.value = 0;
  fullTextEof.value = false;
  fullTextVisible.value = true;
  await loadMoreText();
}

async function loadMoreText() {
  if (!fullTextAsset.value || fullTextLoading.value || fullTextEof.value || !project.value?.id) return;
  fullTextLoading.value = true;
  try {
    const data: any = await getTextAssetContent({ projectId: Number(project.value.id), id: fullTextAsset.value.id, offset: fullTextOffset.value, limit: FULL_TEXT_PAGE_SIZE });
    const chunk = String(data?.content ?? data?.text ?? "");
    fullTextContent.value += chunk;
    fullTextOffset.value += chunk.length;
    fullTextEof.value = Boolean(data?.eof) || !chunk.length;
  } catch (error: any) { window.$message.error(error?.message || "长文读取失败"); }
  finally { fullTextLoading.value = false; }
}
</script>

<style lang="scss" scoped>
.scriptAgent { display: grid; grid-template-columns: minmax(0, 1fr) 408px; gap: 16px; height: 100%; min-height: 0; overflow: hidden; }
.scriptAgent.agentHidden { display: block; }
.workspace { min-width: 0; height: 100%; min-height: 0; display: flex; flex-direction: column; padding: 0 12px; background: var(--td-bg-color-container); }
.agentSlot { width: 408px; height: 100%; min-height: 320px; overflow: hidden; }
.agentSlot :deep(.rightChatBox) { position: relative; top: auto; right: auto; bottom: auto; width: 100% !important; min-width: 0; height: 100%; min-height: 0; margin: 0; overflow: hidden; }
.agentSlot :deep(.rightChatBox .chatBox) { height: auto; min-height: 0; flex: 1 1 auto; padding-bottom: 8px; }
.agentSlot :deep(.rightChatBox .t-chat__list) { flex: 1 1 0; min-height: 0; height: 0; overflow-y: auto; }
.agentSlot :deep(.rightChatBox .inputBox) { flex: 0 0 auto; margin-top: auto; }
.runStatus, .archivedOutputs, .timeline { margin: 8px; flex: 0 0 auto; }
.runStatus { display: grid; gap: 3px; padding: 8px 10px; border-left: 3px solid var(--td-border-level-2-color); background: var(--td-bg-color-secondarycontainer); font-size: 13px; }
.runStatus.running { border-color: var(--td-brand-color); }
.runStatus.error { border-color: var(--td-error-color); }
.runStatus small, .timeline span, .timeline small { color: var(--td-text-color-secondary); line-height: 1.45; }
.archivedOutputs { display: grid; gap: 6px; }
.archivedOutputs article { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-left: 3px solid var(--td-brand-color); background: var(--td-bg-color-secondarycontainer); }
.archivedOutputs p { margin: 3px 0 0; font-size: 12px; color: var(--td-text-color-secondary); }
.timeline ol { margin: 0; padding: 0; list-style: none; }
.timeline li { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 7px 0; border-top: 1px solid var(--td-border-level-1-color); }
.timeline li div { display: grid; gap: 2px; min-width: 0; }
.timeline strong { font-size: 12px; }
.settingMenu { padding: 4px 0; }
.settingMenu button { width: 100%; display: flex; align-items: center; gap: 7px; padding: 7px 14px; border: 0; background: transparent; text-align: left; cursor: pointer; color: var(--td-text-color-primary); }
.settingMenu button:hover { background: var(--td-bg-color-container-hover); }
.settingMenu button.danger { color: var(--td-error-color); }
.workspace :deep(.t-tabs) { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.workspace :deep(.t-tabs__operations--right) { top: 0; bottom: 0; display: flex; align-items: center; }
.workspace :deep(.t-tabs__operations--right > *) { display: flex; align-items: center; }
.workspace :deep(.t-tabs__content) { flex: 1 1 0; min-height: 0; overflow: hidden; }
.workspace :deep(.t-tab-panel) { height: 100%; min-height: 0; overflow: hidden; }
.reading, .scriptList { height: 100%; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 12px 4px; }
.reading :deep(.md-editor-preview-wrapper) { padding: 0; }
.scriptList { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 14px; }
.scriptCard { display: flex; flex-direction: column; height: 480px; min-height: 0; overflow: hidden; border: 1px solid var(--td-border-level-2-color); background: var(--td-bg-color-container); }
.scriptCard header { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; background: var(--td-bg-color-secondarycontainer); border-bottom: 1px solid var(--td-border-level-2-color); }
.scriptCard header > div { display: flex; align-items: center; }
.scriptCardContent { display: flex; flex: 1 1 0; min-height: 0; }.scriptCardContent > .scriptMeta,.scriptCardError { display: grid; place-content: center; flex: 1 1 auto; padding: 16px; color: var(--td-text-color-secondary); }.scriptCardError { gap: 10px; text-align: center; }.scriptMarkdown { flex: 1 1 auto; min-height: 0; padding: 14px 16px 18px; overflow: auto; overscroll-behavior: contain; background: transparent; }
.scriptMarkdown :deep(.md-editor-preview-wrapper), .scriptMarkdown :deep(.md-editor-preview) { padding: 0; background: transparent; color: var(--td-text-color-primary); font-size: 13px; line-height: 1.72; word-break: break-word; }
.scriptMarkdown :deep(.md-editor-preview > :first-child) { margin-top: 0; }
.scriptMarkdown :deep(.md-editor-preview > :last-child) { margin-bottom: 0; }
.scriptMarkdown :deep(h1), .scriptMarkdown :deep(h2), .scriptMarkdown :deep(h3), .scriptMarkdown :deep(h4) { color: var(--td-text-color-primary); line-height: 1.35; }
.scriptMarkdown :deep(h1) { margin: 0 0 16px; padding-bottom: 10px; border-bottom: 1px solid var(--td-border-level-2-color); font-size: 20px; }
.scriptMarkdown :deep(h2) { margin: 22px 0 10px; font-size: 17px; }
.scriptMarkdown :deep(h3) { margin: 18px 0 8px; font-size: 15px; }
.scriptMarkdown :deep(h4) { margin: 18px 0 8px; font-size: 14px; }
.scriptMarkdown :deep(p), .scriptMarkdown :deep(ul), .scriptMarkdown :deep(ol) { margin: 10px 0; }
.scriptMarkdown :deep(ul), .scriptMarkdown :deep(ol) { padding-left: 24px; }
.scriptMarkdown :deep(li + li) { margin-top: 5px; }
.scriptMarkdown :deep(hr) { margin: 22px 0; border: 0; border-top: 1px solid var(--td-border-level-2-color); }
.scriptMarkdown :deep(blockquote) { margin: 14px 0; padding: 8px 12px; border-left: 3px solid var(--td-brand-color); background: var(--td-bg-color-secondarycontainer); color: var(--td-text-color-secondary); }
.scriptMarkdown :deep(pre) { margin: 14px 0; padding: 12px; overflow: auto; background: var(--td-bg-color-secondarycontainer); }
.scriptMarkdown :deep(code) { padding: 1px 4px; border-radius: 3px; background: var(--td-bg-color-secondarycontainer); }
.scriptMarkdown :deep(table) { display: block; width: 100%; margin: 14px 0; overflow-x: auto; border-collapse: collapse; }
.scriptMarkdown :deep(th), .scriptMarkdown :deep(td) { padding: 8px 10px; border: 1px solid var(--td-border-level-2-color); text-align: left; vertical-align: top; }
.scriptMarkdown :deep(th) { background: var(--td-bg-color-secondarycontainer); }
.scriptFullscreenReader { height: calc(100vh - 124px); overflow: auto; overscroll-behavior: contain; padding: 32px clamp(24px, 8vw, 160px); background: var(--td-bg-color-container); }
.fullscreenMarkdown { height: auto; overflow: visible; padding: 0; }
.fullscreenMarkdown :deep(.md-editor-preview-wrapper), .fullscreenMarkdown :deep(.md-editor-preview) { font-size: 15px; line-height: 1.9; }
.fullscreenMarkdown :deep(h1) { margin-bottom: 24px; padding-bottom: 16px; font-size: 28px; }
.fullscreenMarkdown :deep(h2) { margin-top: 34px; font-size: 22px; }
.fullscreenMarkdown :deep(h3) { margin-top: 26px; font-size: 18px; }
.editorForm { display: grid; gap: 12px; }
.fullText { max-height: 70vh; overflow: auto; }
.fullText :deep(.md-editor-preview-wrapper) { padding: 0; }
.fullText footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; position: sticky; bottom: 0; padding: 10px 0; background: var(--td-bg-color-container); color: var(--td-text-color-secondary); font-size: 12px; }
@media (max-width: 1100px) { .scriptAgent { display: block; }.agentSlot { position: fixed; z-index: 30; top: 70px; right: 8px; bottom: 16px; width: 400px; height: auto; min-height: 0; } }
@media (max-width: 900px) { .scriptList { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .agentSlot { left: 8px; width: auto; }.scriptMarkdown { padding: 14px; }.scriptMarkdown :deep(h1) { font-size: 20px; } }
@media (min-width: 1540px) { .scriptAgent.agentHidden .scriptList { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
