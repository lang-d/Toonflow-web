<template>
  <div class="storyAgent">
    <Splitpanes class="default-theme storyLayout">
      <Pane :size="24" :min-size="18" class="artifactPane">
        <div class="paneHeader">
          <div>
            <h3>故事创作台</h3>
            <span>{{ project?.name }}</span>
          </div>
          <t-button theme="primary" size="small" @click="openCreateDialog">
            <template #icon><i-plus /></template>
          </t-button>
        </div>
        <div class="artifactFilters">
          <t-checkbox v-model="showArchived">显示归档</t-checkbox>
          <t-button variant="text" size="small" :loading="artifactLoading" @click="loadArtifacts()">
            <template #icon><i-refresh /></template>
          </t-button>
        </div>
        <div class="artifactGroups">
          <section v-for="group in artifactGroups" :key="group.type" class="artifactGroup">
            <div class="groupTitle">
              <span>{{ STORY_ARTIFACT_TYPE_LABELS[group.type] }}</span>
              <t-tag size="small" variant="light">{{ group.items.length }}</t-tag>
            </div>
            <button
              v-for="item in group.items"
              :key="item.id"
              class="artifactItem"
              :class="{ active: item.id === selectedArtifactId, archived: item.status === 'archived' }"
              @click="selectArtifact(item.id)">
              <span class="artifactTitle">{{ item.title || "未命名文档" }}</span>
              <span class="artifactMeta">
                v{{ item.version || 1 }}
                <em>{{ STORY_ARTIFACT_STATUS_LABELS[item.status] }}</em>
              </span>
            </button>
          </section>
          <t-empty v-if="!artifactLoading && !visibleArtifacts.length" title="暂无故事文档" />
        </div>
      </Pane>

      <Pane :size="46" :min-size="32" class="documentPane">
        <div v-if="selectedDetail" class="documentShell">
          <div class="documentHeader">
            <div class="titleEditor">
              <t-input v-model="draftTitle" size="large" placeholder="文档标题" />
              <div class="documentMeta">
                <t-tag variant="light">{{ STORY_ARTIFACT_TYPE_LABELS[selectedDetail.type] }}</t-tag>
                <t-tag :theme="getArtifactStatusTheme(selectedDetail.status)" variant="light">
                  {{ STORY_ARTIFACT_STATUS_LABELS[selectedDetail.status] }}
                </t-tag>
                <span>版本 v{{ selectedDetail.version || 1 }}</span>
                <span v-if="selectedDetail.parentId">来源 #{{ selectedDetail.parentId }}</span>
                <span>{{ formatTime(selectedDetail.updateTime || selectedDetail.createTime) }}</span>
              </div>
            </div>
            <div class="documentActions">
              <t-button variant="outline" :loading="detailLoading" @click="refreshCurrent">
                <template #icon><i-refresh /></template>
              </t-button>
              <t-button theme="primary" :loading="saving" @click="saveArtifact">
                <template #icon><i-save /></template>
                保存
              </t-button>
              <t-button v-if="selectedDetail.type === 'script'" variant="outline" :loading="publishing" @click="openPublishDialog">
                <template #icon><i-upload /></template>
                发布剧本
              </t-button>
              <t-button theme="danger" variant="outline" :disabled="selectedDetail.status === 'archived'" @click="archiveArtifact">
                <template #icon><i-folder-minus /></template>
              </t-button>
            </div>
          </div>

          <div class="editorWrap" @mouseup="captureSelection" @keyup="captureSelection">
            <MdEditor
              v-model="draftContent"
              :theme="themeSetting.mode === 'auto' ? undefined : themeSetting.mode"
              :footers="[]"
              preview-theme="github"
              code-theme="atom"
              style="height: 100%"
              @onUploadImg="() => {}"
              @drop.prevent />
          </div>

          <div v-if="selectionDraft.selectedText" class="selectionBar">
            <div class="selectionText">已选中：{{ selectionDraft.selectedText }}</div>
            <div class="selectionForm">
              <t-textarea v-model="annotationComment" placeholder="写下批注意见" :autosize="{ minRows: 1, maxRows: 3 }" />
              <t-button theme="primary" :loading="creatingAnnotation" @click="createAnnotationFromSelection">创建批注</t-button>
            </div>
          </div>
        </div>
        <div v-else class="emptyDocument c">
          <t-empty title="选择或创建一个故事文档" />
        </div>
      </Pane>

      <Pane :size="30" :min-size="24" class="assistantPane">
        <div class="chatBox">
          <div class="chatHeader">
            <div class="connection">
              <i-dot :fill="connected ? 'green' : 'red'" />
              <span>{{ connected ? "已连接" : "未连接" }}</span>
            </div>
            <div class="chatActions">
              <t-button variant="text" size="small" @click="storyAgent.reconnect()">
                <template #icon><i-api /></template>
              </t-button>
              <t-button variant="text" size="small" @click="storyAgent.resetLocalMessages()">
                <template #icon><i-delete /></template>
              </t-button>
            </div>
          </div>
          <t-chat-list :clear-history="false" class="messageList">
            <t-chat-message
              v-for="message in messages"
              :key="message.id"
              :message="message"
              :name="(message as any).name"
              :placement="message.role === 'user' ? 'right' : 'left'"
              :variant="message.role === 'user' ? 'base' : 'outline'"
              :status="message.status"
              allowContentSegmentCustom />
          </t-chat-list>
          <div class="chatOptions">
            <t-checkbox v-model="chatWithCurrentArtifact" :disabled="!selectedDetail">围绕当前文档</t-checkbox>
            <t-button size="small" variant="outline" :disabled="!selectedDetail || !openAnnotations.length" @click="reviseWithOpenAnnotations">
              按批注修订
            </t-button>
          </div>
          <t-chat-sender
            v-model="inputValue"
            :disabled="chatStatus === 'pending' || chatStatus === 'streaming'"
            :loading="chatStatus === 'pending' || chatStatus === 'streaming'"
            placeholder="输入想法、剧本方向或修改要求"
            @send="handleSend"
            @stop="storyAgent.stop()" />
        </div>

        <div class="annotationPanel">
          <div class="annotationHeader">
            <strong>批注</strong>
            <t-select v-model="annotationStatusFilter" size="small" autoWidth>
              <t-option value="open" label="待处理" />
              <t-option value="all" label="全部" />
              <t-option value="applied" label="已应用" />
              <t-option value="dismissed" label="已忽略" />
              <t-option value="resolved" label="已解决" />
            </t-select>
          </div>
          <div class="annotationList">
            <article v-for="item in filteredAnnotations" :key="item.id" class="annotationItem">
              <div class="annotationTop">
                <t-tag size="small" :theme="getAnnotationStatusTheme(item.status)" variant="light">
                  {{ STORY_ANNOTATION_STATUS_LABELS[item.status] }}
                </t-tag>
                <span>{{ item.startOffset }}-{{ item.endOffset }}</span>
              </div>
              <blockquote>{{ item.selectedText }}</blockquote>
              <p>{{ item.comment }}</p>
              <div class="annotationActions">
                <t-button v-if="item.status !== 'applied'" size="small" variant="text" @click="setAnnotationStatus(item, 'applied')">应用</t-button>
                <t-button v-if="item.status !== 'resolved'" size="small" variant="text" @click="setAnnotationStatus(item, 'resolved')">解决</t-button>
                <t-button v-if="item.status !== 'dismissed'" size="small" variant="text" theme="danger" @click="setAnnotationStatus(item, 'dismissed')">
                  忽略
                </t-button>
              </div>
            </article>
            <t-empty v-if="!annotationLoading && !filteredAnnotations.length" title="暂无批注" />
          </div>
        </div>
      </Pane>
    </Splitpanes>

    <t-dialog v-model:visible="createVisible" header="创建故事文档" width="560px" :confirm-btn="{ content: '创建', loading: creating }" @confirm="createArtifact">
      <t-form label-align="top">
        <t-form-item label="类型">
          <t-select v-model="createForm.type">
            <t-option v-for="type in STORY_ARTIFACT_TYPES" :key="type" :value="type" :label="STORY_ARTIFACT_TYPE_LABELS[type]" />
          </t-select>
        </t-form-item>
        <t-form-item label="标题">
          <t-input v-model="createForm.title" placeholder="输入文档标题" />
        </t-form-item>
        <t-form-item label="初始内容">
          <t-textarea v-model="createForm.content" :autosize="{ minRows: 5, maxRows: 10 }" placeholder="可以先留空，之后由 AI 或手动补充" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <t-dialog
      v-model:visible="publishVisible"
      header="发布到正式剧本"
      width="520px"
      :confirm-btn="{ content: '确认发布', theme: 'primary', loading: publishing }"
      @confirm="publishToScript">
      <t-form label-align="top">
        <t-form-item label="发布标题">
          <t-input v-model="publishForm.title" placeholder="默认使用当前文档标题" />
        </t-form-item>
        <t-form-item label="已有剧本 ID（可选）">
          <t-input-number v-model="publishForm.scriptId" theme="normal" placeholder="不填则创建新剧本" style="width: 100%" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import dayjs from "dayjs";
import { MdEditor } from "md-editor-v3";
import "md-editor-v3/lib/style.css";
import { Pane, Splitpanes } from "splitpanes";
import "splitpanes/dist/splitpanes.css";
import {
  archiveStoryArtifact,
  createStoryAnnotation,
  createStoryArtifact,
  getStoryArtifactDetail,
  listStoryAnnotations,
  listStoryArtifacts,
  publishStoryArtifactToScript,
  updateStoryAnnotationStatus,
  updateStoryArtifact,
} from "@/api/story";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import useStoryAgentStore from "@/stores/storyAgent";
import type { StoryAnnotation, StoryAnnotationStatus, StoryArtifact, StoryArtifactStatus, StoryArtifactType } from "@/types/story";
import {
  STORY_ANNOTATION_STATUS_LABELS,
  STORY_ARTIFACT_STATUS_LABELS,
  STORY_ARTIFACT_TYPE_LABELS,
  STORY_ARTIFACT_TYPES,
} from "@/types/story";

const router = useRouter();
const storyAgent = useStoryAgentStore();
const { connected, messages, status: chatStatus } = storeToRefs(storyAgent);
const { project } = storeToRefs(projectStore());
const { themeSetting } = storeToRefs(settingStore());

const artifactLoading = ref(false);
const detailLoading = ref(false);
const annotationLoading = ref(false);
const saving = ref(false);
const creating = ref(false);
const publishing = ref(false);
const creatingAnnotation = ref(false);

const artifacts = ref<StoryArtifact[]>([]);
const selectedArtifactId = ref<number | null>(null);
const selectedDetail = ref<StoryArtifact | null>(null);
const annotations = ref<StoryAnnotation[]>([]);
const showArchived = ref(false);
const draftTitle = ref("");
const draftContent = ref("");
const inputValue = ref("");
const chatWithCurrentArtifact = ref(true);
const annotationStatusFilter = ref<StoryAnnotationStatus | "all">("open");
const annotationComment = ref("");
const selectionDraft = ref({
  startOffset: -1,
  endOffset: -1,
  selectedText: "",
});

const createVisible = ref(false);
const createForm = ref<{
  type: StoryArtifactType;
  title: string;
  content: string;
}>({
  type: "idea",
  title: "",
  content: "",
});

const publishVisible = ref(false);
const publishForm = ref<{
  title: string;
  scriptId?: number;
}>({
  title: "",
  scriptId: undefined,
});

const projectId = computed(() => Number(project.value?.id || 0));
const visibleArtifacts = computed(() => artifacts.value.filter((item) => showArchived.value || item.status !== "archived"));
const artifactGroups = computed(() =>
  STORY_ARTIFACT_TYPES.map((type) => ({
    type,
    items: visibleArtifacts.value
      .filter((item) => item.type === type)
      .sort((a, b) => (b.updateTime || b.createTime || 0) - (a.updateTime || a.createTime || 0)),
  })).filter((group) => group.items.length > 0),
);
const filteredAnnotations = computed(() =>
  annotationStatusFilter.value === "all"
    ? annotations.value
    : annotations.value.filter((item) => item.status === annotationStatusFilter.value),
);
const openAnnotations = computed(() => annotations.value.filter((item) => item.status === "open"));

onMounted(async () => {
  storyAgent.connect();
  await loadArtifacts();
});

onBeforeUnmount(() => {
  storyAgent.disconnect();
});

watch(
  () => selectedArtifactId.value,
  async (id) => {
    if (!id) {
      selectedDetail.value = null;
      annotations.value = [];
      return;
    }
    await Promise.all([loadArtifactDetail(id), loadAnnotations(id)]);
  },
);

watch(
  () => chatStatus.value,
  (status, prevStatus) => {
    if (status === "idle" && prevStatus && prevStatus !== "idle") {
      void loadArtifacts({ preserveSelection: true });
    }
  },
);

async function loadArtifacts(options: { preserveSelection?: boolean } = {}) {
  if (!projectId.value) return;
  artifactLoading.value = true;
  try {
    const data = await listStoryArtifacts({ projectId: projectId.value });
    artifacts.value = data ?? [];
    if (!options.preserveSelection || !selectedArtifactId.value) {
      selectedArtifactId.value = visibleArtifacts.value[0]?.id ?? null;
    } else if (!artifacts.value.some((item) => item.id === selectedArtifactId.value)) {
      selectedArtifactId.value = visibleArtifacts.value[0]?.id ?? null;
    }
  } catch (error) {
    window.$message.error((error as any)?.message || "故事文档列表加载失败");
  } finally {
    artifactLoading.value = false;
  }
}

async function loadArtifactDetail(id: number) {
  if (!projectId.value) return;
  detailLoading.value = true;
  try {
    selectedDetail.value = await getStoryArtifactDetail({ id, projectId: projectId.value });
    draftTitle.value = selectedDetail.value?.title ?? "";
    draftContent.value = selectedDetail.value?.content ?? "";
    clearSelectionDraft();
  } catch (error) {
    window.$message.error((error as any)?.message || "故事文档详情加载失败");
  } finally {
    detailLoading.value = false;
  }
}

async function loadAnnotations(artifactId: number) {
  if (!projectId.value) return;
  annotationLoading.value = true;
  try {
    annotations.value = await listStoryAnnotations({ projectId: projectId.value, artifactId });
  } catch (error) {
    window.$message.error((error as any)?.message || "批注列表加载失败");
  } finally {
    annotationLoading.value = false;
  }
}

function selectArtifact(id: number) {
  selectedArtifactId.value = id;
}

function openCreateDialog() {
  createForm.value = {
    type: "idea",
    title: "",
    content: "",
  };
  createVisible.value = true;
}

async function createArtifact() {
  if (!projectId.value) return;
  if (!createForm.value.title.trim()) {
    window.$message.warning("请输入文档标题");
    return;
  }
  creating.value = true;
  try {
    const artifact = await createStoryArtifact({
      projectId: projectId.value,
      type: createForm.value.type,
      title: createForm.value.title.trim(),
      content: createForm.value.content,
      contentJson: null,
      status: "draft",
    });
    createVisible.value = false;
    await loadArtifacts({ preserveSelection: true });
    selectedArtifactId.value = artifact.id;
    window.$message.success("故事文档已创建");
  } catch (error) {
    window.$message.error((error as any)?.message || "创建失败");
  } finally {
    creating.value = false;
  }
}

async function saveArtifact() {
  if (!selectedDetail.value || !projectId.value) return;
  saving.value = true;
  try {
    selectedDetail.value = await updateStoryArtifact({
      id: selectedDetail.value.id,
      projectId: projectId.value,
      title: draftTitle.value.trim() || selectedDetail.value.title,
      content: draftContent.value,
      contentJson: selectedDetail.value.contentJson ?? null,
    });
    draftTitle.value = selectedDetail.value.title;
    draftContent.value = selectedDetail.value.content;
    await loadArtifacts({ preserveSelection: true });
    window.$message.success("已保存");
  } catch (error) {
    window.$message.error((error as any)?.message || "保存失败");
  } finally {
    saving.value = false;
  }
}

function archiveArtifact() {
  if (!selectedDetail.value || !projectId.value) return;
  const dialog = DialogPlugin.confirm({
    header: "归档故事文档",
    body: `确认归档「${selectedDetail.value.title}」吗？`,
    confirmBtn: "归档",
    cancelBtn: "取消",
    theme: "warning",
    onConfirm: async () => {
      dialog.destroy();
      try {
        await archiveStoryArtifact({ id: selectedDetail.value!.id, projectId: projectId.value });
        await loadArtifacts();
        window.$message.success("已归档");
      } catch (error) {
        window.$message.error((error as any)?.message || "归档失败");
      }
    },
  });
}

function openPublishDialog() {
  if (!selectedDetail.value) return;
  publishForm.value = {
    title: selectedDetail.value.title,
    scriptId: undefined,
  };
  publishVisible.value = true;
}

async function publishToScript() {
  if (!selectedDetail.value || !projectId.value) return;
  publishing.value = true;
  try {
    const result = await publishStoryArtifactToScript({
      id: selectedDetail.value.id,
      projectId: projectId.value,
      title: publishForm.value.title || selectedDetail.value.title,
      scriptId: publishForm.value.scriptId,
    });
    publishVisible.value = false;
    await loadArtifacts({ preserveSelection: true });
    window.$message.success(`已发布到剧本 #${result.scriptId}`);
    void router.push("/script");
  } catch (error) {
    window.$message.error((error as any)?.message || "发布失败");
  } finally {
    publishing.value = false;
  }
}

async function refreshCurrent() {
  if (!selectedArtifactId.value) {
    await loadArtifacts();
    return;
  }
  await Promise.all([loadArtifacts({ preserveSelection: true }), loadArtifactDetail(selectedArtifactId.value), loadAnnotations(selectedArtifactId.value)]);
}

function captureSelection() {
  if (!selectedDetail.value) return;
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";
  if (!selectedText || selectedText.length < 2) {
    clearSelectionDraft();
    return;
  }
  const startOffset = draftContent.value.indexOf(selectedText);
  if (startOffset < 0) {
    clearSelectionDraft();
    return;
  }
  selectionDraft.value = {
    startOffset,
    endOffset: startOffset + selectedText.length,
    selectedText,
  };
}

function clearSelectionDraft() {
  selectionDraft.value = {
    startOffset: -1,
    endOffset: -1,
    selectedText: "",
  };
  annotationComment.value = "";
}

async function createAnnotationFromSelection() {
  if (!selectedDetail.value || !projectId.value) return;
  if (!selectionDraft.value.selectedText) {
    window.$message.warning("请先选中文档中的文本");
    return;
  }
  if (!annotationComment.value.trim()) {
    window.$message.warning("请输入批注意见");
    return;
  }
  creatingAnnotation.value = true;
  try {
    await createStoryAnnotation({
      projectId: projectId.value,
      artifactId: selectedDetail.value.id,
      artifactVersion: selectedDetail.value.version,
      startOffset: selectionDraft.value.startOffset,
      endOffset: selectionDraft.value.endOffset,
      selectedText: selectionDraft.value.selectedText,
      comment: annotationComment.value.trim(),
    });
    await loadAnnotations(selectedDetail.value.id);
    clearSelectionDraft();
    window.$message.success("批注已创建");
  } catch (error) {
    window.$message.error((error as any)?.message || "创建批注失败");
  } finally {
    creatingAnnotation.value = false;
  }
}

async function setAnnotationStatus(annotation: StoryAnnotation, status: StoryAnnotationStatus) {
  if (!projectId.value) return;
  try {
    const updated = await updateStoryAnnotationStatus({ projectId: projectId.value, id: annotation.id, status });
    const index = annotations.value.findIndex((item) => item.id === annotation.id);
    if (index >= 0) annotations.value[index] = updated;
  } catch (error) {
    window.$message.error((error as any)?.message || "更新批注状态失败");
  }
}

function handleSend(text: string) {
  const artifactId = chatWithCurrentArtifact.value ? selectedDetail.value?.id : undefined;
  storyAgent.send(text, { artifactId });
  inputValue.value = "";
}

function reviseWithOpenAnnotations() {
  if (!selectedDetail.value) return;
  storyAgent.send("请根据当前文档中的待处理批注，生成一个修订后的新版本。", {
    artifactId: selectedDetail.value.id,
    includeOpenAnnotations: true,
  });
}

function getArtifactStatusTheme(status: StoryArtifactStatus) {
  if (status === "published") return "success";
  if (status === "archived") return "default";
  if (status === "active") return "primary";
  return "warning";
}

function getAnnotationStatusTheme(status: StoryAnnotationStatus) {
  if (status === "open") return "warning";
  if (status === "applied") return "success";
  if (status === "resolved") return "primary";
  return "default";
}

function formatTime(value?: number) {
  if (!value) return "";
  return dayjs(value).format("YYYY-MM-DD HH:mm");
}
</script>

<style lang="scss" scoped>
.storyAgent {
  height: calc(100% - 16px);
  min-height: 0;
  overflow: hidden;

  :deep(.splitpanes__pane) {
    background: transparent;
  }

  :deep(.splitpanes__splitter) {
    border-left: none;
    background: var(--td-border-level-1-color);
  }
}

.storyLayout {
  height: 100%;
}

.artifactPane,
.documentPane,
.assistantPane {
  min-height: 0;
  padding: 0 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.paneHeader,
.documentHeader,
.chatHeader,
.annotationHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.paneHeader {
  padding: 4px 0 12px;

  h3 {
    margin: 0;
    font-size: 18px;
  }

  span {
    display: block;
    margin-top: 2px;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.artifactFilters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  flex-shrink: 0;
}

.artifactGroups,
.annotationList {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.artifactGroup {
  margin-bottom: 14px;
}

.groupTitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.artifactItem {
  width: 100%;
  min-height: 58px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--td-bg-color-container-hover);
  }

  &.active {
    border-color: var(--td-brand-color);
    box-shadow: inset 3px 0 0 var(--td-brand-color);
  }

  &.archived {
    opacity: 0.68;
  }
}

.artifactTitle,
.artifactMeta {
  display: block;
}

.artifactTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.artifactMeta {
  margin-top: 7px;
  color: var(--td-text-color-secondary);
  font-size: 12px;

  em {
    margin-left: 8px;
    font-style: normal;
  }
}

.documentShell,
.chatBox,
.annotationPanel {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.documentShell {
  height: 100%;
}

.documentHeader {
  padding-bottom: 10px;
}

.titleEditor {
  flex: 1;
  min-width: 0;
}

.documentMeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 7px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.documentActions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.editorWrap {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 8px;
  overflow: hidden;
}

.selectionBar {
  flex-shrink: 0;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--td-brand-color-light);
  border-radius: 8px;
  background: var(--td-brand-color-light);
}

.selectionText {
  margin-bottom: 6px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selectionForm {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.emptyDocument {
  width: 100%;
  height: 100%;
}

.assistantPane {
  gap: 12px;
}

.chatBox {
  flex: 1;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  overflow: hidden;
}

.chatHeader {
  padding: 8px 10px;
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.connection,
.chatActions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.messageList {
  flex: 1;
  min-height: 0;
  padding: 8px;
}

.chatOptions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-top: 1px solid var(--td-border-level-1-color);
}

.annotationPanel {
  height: 38%;
  min-height: 220px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  overflow: hidden;
}

.annotationHeader {
  padding: 8px 10px;
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.annotationList {
  padding: 8px;
}

.annotationItem {
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 8px;

  blockquote {
    margin: 8px 0;
    padding-left: 8px;
    border-left: 3px solid var(--td-brand-color);
    color: var(--td-text-color-secondary);
    font-size: 12px;
    line-height: 1.5;
    word-break: break-word;
  }

  p {
    margin: 0;
    line-height: 1.6;
    word-break: break-word;
  }
}

.annotationTop,
.annotationActions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.annotationTop {
  justify-content: space-between;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.annotationActions {
  justify-content: flex-end;
  margin-top: 6px;
}
</style>
