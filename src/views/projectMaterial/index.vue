<template>
  <div class="projectMaterial">
    <div class="materialHeader">
      <div>
        <h2>{{ $t("workbench.projectMaterial.title") }}</h2>
        <p>{{ $t("workbench.projectMaterial.subtitle") }}</p>
      </div>
      <t-space>
        <t-button variant="outline" @click="openPasteDialog">
          <template #icon><i-edit /></template>
          {{ $t("workbench.projectMaterial.pasteText") }}
        </t-button>
        <t-button theme="primary" :loading="uploading" @click="triggerFileInput">
          <template #icon><i-upload /></template>
          {{ $t("workbench.projectMaterial.uploadFile") }}
        </t-button>
      </t-space>
      <input ref="fileInput" class="hiddenFileInput" type="file" :accept="fileAccept" @change="handleFileChange" />
    </div>

    <div class="materialLayout">
      <aside class="categoryPanel">
        <t-loading :loading="loading" show-overlay>
          <div v-for="item in categoryOptions" :key="item.value" class="categoryGroup">
            <button
              type="button"
              class="categoryItem"
              :class="{ active: activeCategory === item.value }"
              @click="toggleCategory(item.value)">
              <span>{{ item.label }}</span>
              <t-tag size="small" variant="light">{{ categoryCounts[item.value] || 0 }}</t-tag>
            </button>
            <div v-if="isCategoryExpanded(item.value)" class="materialNavList">
              <div v-if="!materialsByCategory[item.value]?.length" class="materialNavEmpty">
                {{ $t("workbench.projectMaterial.empty") }}
              </div>
              <div
                v-for="material in materialsByCategory[item.value]"
                :key="material.id"
                class="materialNavItem"
                :class="{ disabled: !canReadMaterial(material) }"
                @click="openReadDialog(material)">
                <div class="materialNavMain">
                  <strong>{{ material.name }}</strong>
                  <span>{{ formatMaterialMeta(material) }}</span>
                </div>
                <div class="materialNavMeta">
                  <t-tag size="small" :theme="stateTheme(material.state)" variant="light">{{ stateLabel(material.state) }}</t-tag>
                  <t-button size="small" variant="text" theme="danger" @click.stop="confirmDelete(material)">
                    {{ $t("workbench.projectMaterial.delete") }}
                  </t-button>
                </div>
              </div>
            </div>
          </div>
        </t-loading>
      </aside>

      <section class="contextPanel">
        <div class="contextTop">
          <div class="contextHead">
            <h3>{{ $t("workbench.projectMaterial.contextPackTitle") }}</h3>
            <p>{{ $t("workbench.projectMaterial.contextPackHint") }}</p>
          </div>
          <t-space class="contextActions">
            <t-button theme="primary" :loading="contextGenerating" @click="openContextPackDialog">
              <template #icon><i-magic /></template>
              {{ contextContent ? $t("workbench.projectMaterial.adjustContextPack") : $t("workbench.projectMaterial.generateContextPack") }}
            </t-button>
          </t-space>
        </div>
        <t-loading :loading="contextLoading" show-overlay>
          <t-empty v-if="!contextContent" class="emptyState" :description="$t('workbench.projectMaterial.contextPackEmpty')" />
          <div v-else class="contextContent markdownViewer">
            <MdPreview :model-value="contextContent" :theme="mdTheme" />
          </div>
        </t-loading>
      </section>
    </div>

    <t-dialog
      v-model:visible="pasteDialogVisible"
      :header="$t('workbench.projectMaterial.pasteText')"
      width="620px"
      :confirm-btn="$t('workbench.projectMaterial.save')"
      :cancel-btn="$t('workbench.projectMaterial.cancel')"
      :confirm-loading="uploading"
      @confirm="submitPastedText">
      <t-form label-align="top">
        <t-form-item :label="$t('workbench.projectMaterial.category')">
          <t-select v-model="pasteForm.category">
            <t-option v-for="item in categoryOptions" :key="item.value" :value="item.value" :label="item.label" />
          </t-select>
        </t-form-item>
        <t-form-item :label="$t('workbench.projectMaterial.materialName')">
          <t-input v-model="pasteForm.name" :placeholder="$t('workbench.projectMaterial.materialNamePlaceholder')" />
        </t-form-item>
        <t-form-item :label="$t('workbench.projectMaterial.textContent')">
          <t-textarea v-model="pasteForm.textContent" :autosize="{ minRows: 8, maxRows: 14 }" :placeholder="$t('workbench.projectMaterial.textPlaceholder')" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <t-dialog
      v-model:visible="readDialogVisible"
      :header="readingMaterial?.name || $t('workbench.projectMaterial.viewText')"
      width="min(1320px, 96vw)"
      :footer="false"
      placement="center"
      @closed="resetReadDialog">
      <t-loading :loading="readLoading" show-overlay>
        <div class="readViewer">
          <div class="readToolbar">
            <div class="readMeta">
              <strong>{{ readingMaterial?.name || "" }}</strong>
              <span v-if="readingMaterial">{{ formatMaterialMeta(readingMaterial) }}</span>
              <span>{{ readProgressText }}</span>
            </div>
            <t-radio-group v-if="canToggleReadMode" v-model="readViewMode" size="small" variant="default-filled">
              <t-radio-button value="preview">{{ $t("workbench.projectMaterial.previewMode") }}</t-radio-button>
              <t-radio-button value="source">{{ $t("workbench.projectMaterial.sourceMode") }}</t-radio-button>
            </t-radio-group>
          </div>
          <div v-if="showMarkdownPreview" class="readContent markdownViewer">
            <MdPreview :model-value="readContent" :theme="mdTheme" />
          </div>
          <pre v-else class="readContent sourceViewer">{{ readContent }}</pre>
          <div v-if="readResult && !readResult.eof" class="readActions">
            <t-button :loading="readLoading" @click="loadMoreReadContent">
              {{ $t("workbench.projectMaterial.loadMore") }}
            </t-button>
          </div>
        </div>
      </t-loading>
    </t-dialog>

    <AgentChatPanel
      v-if="contextDialogVisible"
      :title="contextDialogTitle"
      :placeholder="$t('workbench.projectMaterial.contextPackInstructionPlaceholder')"
      :messages="contextAgentMessages"
      :loading="contextGenerating"
      :connected="Boolean(projectId)"
      @send="submitContextPackGeneration"
      @close="contextDialogVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { MdPreview } from "md-editor-v3";
import { DialogPlugin } from "tdesign-vue-next";
import AgentChatPanel from "@/components/AgentChatPanel.vue";
import {
  PROJECT_MATERIAL_CATEGORIES,
  deleteProjectMaterial,
  generateProjectContextPack,
  getProjectContextPack,
  listProjectMaterials,
  readProjectMaterial,
  uploadProjectMaterial,
  type ProjectContextPack,
  type ProjectContextPackReviewIssue,
  type ProjectMaterial,
  type ProjectMaterialCategory,
  type ProjectMaterialReadResult,
  type ProjectMaterialState,
} from "@/api/projectMaterial";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";

interface ContextAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "complete" | "loading" | "error";
}

const { project } = storeToRefs(projectStore());
const { themeSetting } = storeToRefs(settingStore());
const { t } = useI18n();

const READ_LIMIT = 64 * 1024;
const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "csv"]);
const fileAccept = ".txt,.md,.markdown,.json,.csv,.pdf,.doc,.docx";

const categoryOptions = computed(() =>
  PROJECT_MATERIAL_CATEGORIES.map((value) => ({
    value,
    label: t(`workbench.projectMaterial.categories.${value}`),
  })),
);

const activeCategory = ref<ProjectMaterialCategory>("outline");
const expandedCategories = ref<ProjectMaterialCategory[]>(["outline"]);
const materials = ref<ProjectMaterial[]>([]);
const loading = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

const pasteDialogVisible = ref(false);
const pasteForm = reactive({
  category: "outline" as ProjectMaterialCategory,
  name: "",
  textContent: "",
});

const readDialogVisible = ref(false);
const readingMaterial = ref<ProjectMaterial | null>(null);
const readResult = ref<ProjectMaterialReadResult | null>(null);
const readContent = ref("");
const readLoading = ref(false);
const readViewMode = ref<"preview" | "source">("source");

const contextPack = ref<ProjectContextPack | null>(null);
const contextLoading = ref(false);
const contextGenerating = ref(false);
const contextDialogVisible = ref(false);
const contextReviewIssues = ref<ProjectContextPackReviewIssue[]>([]);
const contextAgentMessages = ref<ContextAgentMessage[]>([]);

const projectId = computed(() => Number(project.value?.id || 0));
const categoryCounts = computed<Record<ProjectMaterialCategory, number>>(() => {
  const counts = {} as Record<ProjectMaterialCategory, number>;
  for (const category of PROJECT_MATERIAL_CATEGORIES) counts[category] = 0;
  for (const item of materials.value) counts[item.category] = (counts[item.category] || 0) + 1;
  return counts;
});
const materialsByCategory = computed<Record<ProjectMaterialCategory, ProjectMaterial[]>>(() => {
  const grouped = {} as Record<ProjectMaterialCategory, ProjectMaterial[]>;
  for (const category of PROJECT_MATERIAL_CATEGORIES) grouped[category] = [];
  for (const item of materials.value) grouped[item.category]?.push(item);
  return grouped;
});
const contextContent = computed(() => String(contextPack.value?.content || ""));
const mdTheme = computed(() => (themeSetting.value.mode === "auto" ? undefined : themeSetting.value.mode));
const canToggleReadMode = computed(() => Boolean(readingMaterial.value && isMarkdownMaterial(readingMaterial.value)));
const showMarkdownPreview = computed(() => canToggleReadMode.value && readViewMode.value === "preview");
const contextDialogTitle = computed(() =>
  contextContent.value ? t("workbench.projectMaterial.adjustContextPackTitle") : t("workbench.projectMaterial.generateContextPackTitle"),
);
const readProgressText = computed(() => {
  if (!readResult.value) return "";
  const loaded = Math.min(readContent.value.length, readResult.value.size);
  return t("workbench.projectMaterial.readProgress", { loaded: formatBytes(loaded), total: formatBytes(readResult.value.size) });
});

onMounted(() => {
  void loadAll();
});

async function loadAll() {
  await Promise.all([loadMaterials(), loadContextPack()]);
}

async function loadMaterials() {
  if (!projectId.value) return;
  loading.value = true;
  try {
    const { materials: list } = await listProjectMaterials({ projectId: projectId.value });
    materials.value = list;
  } catch (error) {
    window.$message.error(getErrorMessage(error, t("workbench.projectMaterial.loadFailed")));
  } finally {
    loading.value = false;
  }
}

async function loadContextPack() {
  if (!projectId.value) return;
  contextLoading.value = true;
  try {
    const { contextPack: pack } = await getProjectContextPack({ projectId: projectId.value });
    contextPack.value = pack;
  } catch (error) {
    window.$message.error(getErrorMessage(error, t("workbench.projectMaterial.contextPackLoadFailed")));
  } finally {
    contextLoading.value = false;
  }
}

function setActiveCategory(category: ProjectMaterialCategory) {
  activeCategory.value = category;
}

function isCategoryExpanded(category: ProjectMaterialCategory) {
  return expandedCategories.value.includes(category);
}

function toggleCategory(category: ProjectMaterialCategory) {
  setActiveCategory(category);
  if (isCategoryExpanded(category)) {
    expandedCategories.value = expandedCategories.value.filter((item) => item !== category);
  } else {
    expandedCategories.value = [...expandedCategories.value, category];
  }
}

function triggerFileInput() {
  fileInput.value?.click();
}

function openPasteDialog() {
  pasteForm.category = activeCategory.value;
  pasteForm.name = "";
  pasteForm.textContent = "";
  pasteDialogVisible.value = true;
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !projectId.value) return;
  uploading.value = true;
  try {
    const [base64Data, textContent] = await Promise.all([readFileAsDataUrl(file), readTextContentIfSupported(file)]);
    await uploadProjectMaterial({
      projectId: projectId.value,
      category: activeCategory.value,
      name: file.name,
      base64Data,
      textContent,
      mime: file.type || guessMime(file.name),
    });
    window.$message.success(t("workbench.projectMaterial.uploadSuccess"));
    await loadMaterials();
  } catch (error) {
    window.$message.error(getErrorMessage(error, t("workbench.projectMaterial.uploadFailed")));
  } finally {
    uploading.value = false;
  }
}

async function submitPastedText() {
  const textContent = pasteForm.textContent.trim();
  if (!projectId.value) return;
  if (!pasteForm.name.trim()) {
    window.$message.warning(t("workbench.projectMaterial.nameRequired"));
    return;
  }
  if (!textContent) {
    window.$message.warning(t("workbench.projectMaterial.textRequired"));
    return;
  }
  uploading.value = true;
  try {
    await uploadProjectMaterial({
      projectId: projectId.value,
      category: pasteForm.category,
      name: pasteForm.name.trim(),
      textContent,
      mime: "text/plain",
    });
    pasteDialogVisible.value = false;
    activeCategory.value = pasteForm.category;
    window.$message.success(t("workbench.projectMaterial.uploadSuccess"));
    await loadMaterials();
  } catch (error) {
    window.$message.error(getErrorMessage(error, t("workbench.projectMaterial.uploadFailed")));
  } finally {
    uploading.value = false;
  }
}

function canReadMaterial(item: ProjectMaterial) {
  return item.state === "ready";
}

async function openReadDialog(item: ProjectMaterial) {
  if (!canReadMaterial(item)) return;
  readingMaterial.value = item;
  readViewMode.value = isMarkdownMaterial(item) ? "preview" : "source";
  readDialogVisible.value = true;
  readContent.value = "";
  readResult.value = null;
  await loadReadContent(0);
}

async function loadMoreReadContent() {
  if (!readResult.value) return;
  await loadReadContent(readResult.value.offset + readResult.value.content.length);
}

async function loadReadContent(offset: number) {
  if (!projectId.value || !readingMaterial.value) return;
  readLoading.value = true;
  try {
    const result = await readProjectMaterial({
      projectId: projectId.value,
      id: readingMaterial.value.id,
      offset,
      limit: READ_LIMIT,
    });
    readResult.value = result;
    readContent.value += result.content;
  } catch (error) {
    window.$message.error(getErrorMessage(error, t("workbench.projectMaterial.readFailed")));
  } finally {
    readLoading.value = false;
  }
}

function resetReadDialog() {
  readingMaterial.value = null;
  readResult.value = null;
  readContent.value = "";
  readViewMode.value = "source";
}

function confirmDelete(item: ProjectMaterial) {
  const dialog = DialogPlugin.confirm({
    header: t("workbench.projectMaterial.deleteTitle"),
    body: t("workbench.projectMaterial.deleteBody", { name: item.name }),
    confirmBtn: t("workbench.projectMaterial.delete"),
    cancelBtn: t("workbench.projectMaterial.cancel"),
    theme: "danger",
    async onConfirm() {
      dialog.setConfirmLoading(true);
      try {
        await deleteProjectMaterial({ projectId: projectId.value, id: item.id });
        window.$message.success(t("workbench.projectMaterial.deleteSuccess"));
        await loadMaterials();
        dialog.hide();
      } catch (error) {
        window.$message.error(getErrorMessage(error, t("workbench.projectMaterial.deleteFailed")));
      } finally {
        dialog.setConfirmLoading(false);
      }
    },
  });
}

function openContextPackDialog() {
  contextReviewIssues.value = [];
  ensureContextAgentWelcome();
  contextDialogVisible.value = true;
}

async function submitContextPackGeneration(instruction: string) {
  if (!projectId.value) return;
  const userMessage: ContextAgentMessage = {
    id: `user-${Date.now()}`,
    role: "user",
    content: instruction,
    status: "complete",
  };
  const assistantMessage: ContextAgentMessage = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: "",
    status: "loading",
  };
  contextAgentMessages.value = [...contextAgentMessages.value, userMessage, assistantMessage];
  contextGenerating.value = true;
  contextReviewIssues.value = [];
  try {
    const previousContent = contextContent.value.trim();
    const result = await generateProjectContextPack({
      projectId: projectId.value,
      instruction: instruction || undefined,
      previousContent: previousContent || undefined,
    });
    contextPack.value = { ...result.contextPack, content: result.content || result.contextPack.content };
    contextReviewIssues.value = result.review?.issues || [];
    updateContextAgentMessage(assistantMessage.id, {
      content: result.content || result.contextPack.content || "",
      status: "complete",
    });
    window.$message.success(t("workbench.projectMaterial.contextPackGenerated"));
  } catch (error) {
    const message = getErrorMessage(error, t("workbench.projectMaterial.contextPackGenerateFailed"));
    updateContextAgentMessage(assistantMessage.id, {
      content: message,
      status: "error",
    });
    window.$message.error(message);
  } finally {
    contextGenerating.value = false;
  }
}

function updateContextAgentMessage(id: string, patch: Partial<ContextAgentMessage>) {
  contextAgentMessages.value = contextAgentMessages.value.map((message) => (message.id === id ? { ...message, ...patch } : message));
}

function ensureContextAgentWelcome() {
  if (contextAgentMessages.value.length) return;
  contextAgentMessages.value = [
    {
      id: "welcome",
      role: "assistant",
      content: t("workbench.projectMaterial.contextPackAgentWelcome"),
      status: "complete",
    },
  ];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function readTextContentIfSupported(file: File) {
  const ext = getFileExt(file.name);
  const isText = file.type.startsWith("text/") || TEXT_EXTENSIONS.has(ext);
  if (!isText) return Promise.resolve(undefined);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file text"));
    reader.readAsText(file);
  });
}

function getFileExt(name: string) {
  const match = String(name || "").match(/\.([^.]+)$/);
  return match?.[1]?.toLowerCase() || "";
}

function guessMime(name: string) {
  const ext = getFileExt(name);
  if (TEXT_EXTENSIONS.has(ext)) return ext === "json" ? "application/json" : "text/plain";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  return "application/octet-stream";
}

function formatMaterialMeta(item: ProjectMaterial) {
  const ext = item.ext ? `.${item.ext}` : item.mime || "";
  return [ext, formatBytes(item.size)].filter(Boolean).join(" / ");
}

function isMarkdownMaterial(item: ProjectMaterial) {
  const ext = String(item.ext || getFileExt(item.name)).toLowerCase();
  return ext === "md" || ext === "markdown";
}

function formatBytes(value?: number | null) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: number | null) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function stateLabel(state: ProjectMaterialState) {
  return t(`workbench.projectMaterial.states.${state}`);
}

function stateTheme(state: ProjectMaterialState) {
  if (state === "ready") return "success";
  if (state === "unsupported") return "warning";
  if (state === "failed") return "danger";
  return "default";
}

function getErrorMessage(error: unknown, fallback: string) {
  return (error as any)?.response?.data?.message || (error as any)?.message || fallback;
}
</script>

<style lang="scss" scoped>
.projectMaterial {
  position: relative;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.materialHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: var(--td-text-color-primary);
  }

  p {
    margin: 6px 0 0;
    color: var(--td-text-color-secondary);
    font-size: 13px;
  }
}

.hiddenFileInput {
  display: none;
}

.materialLayout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 290px) minmax(0, 1fr);
  gap: 12px;
}

.categoryPanel,
.contextPanel {
  min-height: 0;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
}

.categoryPanel {
  padding: 8px;
  overflow: auto;
}

.categoryPanel :deep(.t-loading) {
  min-height: 100%;
}

.categoryGroup + .categoryGroup {
  margin-top: 4px;
}

.categoryItem {
  width: 100%;
  height: 36px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--td-text-color-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--td-bg-color-container-hover);
  }

  &.active {
    background: var(--td-brand-color-light);
    color: var(--td-brand-color);
    font-weight: 600;
  }
}

.materialNavList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0 6px 10px;
  margin-left: 10px;
  border-left: 1px solid var(--td-component-border);
}

.materialNavEmpty {
  padding: 8px 10px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.materialNavItem {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px 9px;
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    background: var(--td-bg-color-container-hover);
    box-shadow: var(--td-shadow-1);
  }

  &.disabled {
    cursor: default;
    opacity: 0.72;

    &:hover {
      box-shadow: none;
    }
  }
}

.materialNavMain {
  min-width: 0;
}

.materialNavMain strong {
  display: block;
  color: var(--td-text-color-primary);
  font-size: 13px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.materialNavMain span {
  display: block;
  margin-top: 3px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.materialNavMeta {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.contextPanel {
  display: flex;
  flex-direction: column;
  padding: 18px 20px 20px;
  overflow: hidden;
}

.contextTop {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.contextHead {
  min-width: 0;

  h3 {
    margin: 0;
    font-size: 17px;
  }

  p {
    margin: 6px 0 0;
    color: var(--td-text-color-secondary);
    font-size: 13px;
    line-height: 1.5;
  }
}

.contextActions {
  flex: 0 0 auto;
  margin: 0;
}

.contextPanel :deep(.t-loading) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.contextPanel :deep(.t-loading__parent),
.contextPanel :deep(.t-loading__content) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.contextContent {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  margin: 0;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  overflow: auto;
}

.readViewer {
  height: min(76vh, calc(100vh - 170px));
  min-height: 560px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.readViewer :deep(.t-loading),
.readViewer :deep(.t-loading__parent),
.readViewer :deep(.t-loading__content) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.readToolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--td-component-border);
}

.readMeta {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--td-text-color-secondary);
  font-size: 12px;

  strong {
    max-width: 520px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--td-text-color-primary);
    font-size: 14px;
  }
}

.readContent {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  overflow: auto;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
}

.sourceViewer {
  padding: 22px 26px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 14px;
  line-height: 1.8;
}

.readActions {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.emptyState {
  min-height: 260px;
}

.markdownViewer {
  :deep(.md-editor) {
    border: none;
    box-shadow: none;
    background: transparent;
  }

  :deep(.md-editor-preview-wrapper) {
    padding: 32px clamp(28px, 5vw, 72px);
    background: transparent;
  }

  :deep(.md-editor-preview) {
    max-width: 1120px;
    margin: 0 auto;
    color: var(--td-text-color-primary);
    font-size: 15px;
    line-height: 1.85;
  }

  :deep(.md-editor-preview > :first-child) {
    margin-top: 0;
  }

  :deep(.md-editor-preview > :last-child) {
    margin-bottom: 0;
  }

  :deep(.md-editor-preview h1) {
    margin: 0 0 22px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--td-component-border);
    font-size: 30px;
    line-height: 1.25;
    letter-spacing: 0;
  }

  :deep(.md-editor-preview h1),
  :deep(.md-editor-preview h2),
  :deep(.md-editor-preview h3) {
    color: var(--td-text-color-primary);
    font-weight: 700;
    line-height: 1.35;
  }

  :deep(.md-editor-preview h2) {
    margin: 30px 0 14px;
    font-size: 23px;
  }

  :deep(.md-editor-preview h3) {
    margin: 22px 0 10px;
    font-size: 18px;
  }

  :deep(.md-editor-preview p),
  :deep(.md-editor-preview ul),
  :deep(.md-editor-preview ol) {
    margin: 0.75em 0;
  }

  :deep(.md-editor-preview ul),
  :deep(.md-editor-preview ol) {
    padding-left: 1.45em;
  }

  :deep(.md-editor-preview li) {
    margin: 0.38em 0;
  }

  :deep(.md-editor-preview blockquote) {
    margin: 18px 0;
    padding: 10px 16px;
    border-left: 3px solid var(--td-brand-color);
    background: var(--td-bg-color-container-hover);
    color: var(--td-text-color-secondary);
  }

  :deep(.md-editor-preview table) {
    display: block;
    width: max-content;
    max-width: 100%;
    overflow-x: auto;
    white-space: nowrap;
    margin: 16px 0 22px;
    border-radius: 6px;
  }

  :deep(.md-editor-preview th),
  :deep(.md-editor-preview td) {
    padding: 10px 13px;
    vertical-align: top;
  }

  :deep(.md-editor-preview pre) {
    white-space: pre-wrap;
    word-break: break-word;
    border-radius: 6px;
  }

  :deep(.md-editor-preview code) {
    font-size: 0.92em;
  }

  :deep(.md-editor-preview hr) {
    margin: 28px 0;
    border: 0;
    border-top: 1px solid var(--td-component-border);
  }
}

@media (max-width: 1280px) {
  .materialLayout {
    grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  }

  .readViewer {
    height: min(72vh, calc(100vh - 150px));
    min-height: 460px;
  }

  .readMeta strong {
    max-width: 320px;
  }
}

@media (max-width: 900px) {
  .materialLayout {
    grid-template-columns: 1fr;
  }

  .categoryPanel {
    max-height: 260px;
  }

  .markdownViewer :deep(.md-editor-preview-wrapper) {
    padding: 24px 22px;
  }
}
</style>
