<template>
  <t-card class="storyboardTable">
    <div class="titleBar dragHandle pr">
      <div class="title c">{{ $t("workbench.production.node.storyboardTable.title") }}</div>
      <div class="titleActions" @mousedown.stop @click.stop>
        <t-button v-if="meta?.textAssetId" size="small" variant="text" :loading="textAssetLoading" @click="openTextAsset">
          查看完整稿
        </t-button>
        <t-button size="small" variant="text" :disabled="!storyboardTable" @click="copyMarkdown">复制</t-button>
        <t-button size="small" variant="text" :disabled="!storyboardTable" @click="exportMarkdown">导出</t-button>
      </div>
      <Handle :id="props.handleIds.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <Handle :id="props.handleIds.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>

    <div class="metaLine">
      <t-tag size="small" :theme="metaTheme" variant="light">{{ metaLabel }}</t-tag>
      <span>{{ rowCountLabel }}</span>
      <span v-if="meta?.hash" class="hashText">{{ meta.hash }}</span>
    </div>

    <t-alert class="readOnlyAlert" theme="info" message="分镜表 Markdown 为后端从结构化事实渲染的只读展示/导出内容。" />
    <t-alert v-if="failureAlertMessage" class="failureAlert" theme="error" :message="failureAlertMessage" />
    <t-alert v-if="showDraftAlert" class="draftAlert" theme="warning" :message="draftAlertMessage" />

    <div class="storyboardList">
      <t-empty v-if="!storyboardTable" style="margin-top: 16px"></t-empty>
      <MdPreview v-else :model-value="storyboardTable" :theme="mdTheme" />
    </div>
  </t-card>

  <t-dialog v-model:visible="textAssetVisible" header="完整分镜表展示稿" width="min(980px, 92vw)" :footer="false" placement="center" attach="body">
    <div class="textAssetViewer">
      <pre>{{ textAssetContent || "暂无内容" }}</pre>
      <div class="textAssetFooter">
        <span>{{ textAssetContent.length }} / {{ textAssetSize || textAssetContent.length }} 字符</span>
        <t-button size="small" :disabled="textAssetEof" :loading="textAssetLoading" @click="loadMoreTextAsset">加载更多</t-button>
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { MdPreview } from "md-editor-v3";
import settingStore from "@/stores/setting";
import projectStore from "@/stores/project";
import { getTextAssetContent } from "@/api/textAsset";
import type { StoryboardGenerationLastFailure, StoryboardTableMeta } from "../utils/flowBuilder";

const { themeSetting } = storeToRefs(settingStore());
const mdTheme = computed(() => (themeSetting.value.mode === "auto" ? undefined : themeSetting.value.mode));
const project = projectStore();

const props = defineProps<{
  id: string;
  meta?: StoryboardTableMeta;
  lastFailure?: StoryboardGenerationLastFailure | null;
  storyboardCount?: number;
  handleIds: {
    target: string;
    source: string;
  };
}>();

const storyboardTable = defineModel<string>({ required: true });
const textAssetVisible = ref(false);
const textAssetLoading = ref(false);
const textAssetContent = ref("");
const textAssetSize = ref(0);
const textAssetEof = ref(true);
const textAssetOffset = ref(0);
const TEXT_ASSET_PAGE_SIZE = 64 * 1024;

function countStoryboardTableRows(text: unknown) {
  if (typeof text !== "string") return 0;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|") && !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line)).length;
}

function getByteLength(text: string) {
  return new TextEncoder().encode(text).length;
}

const projectId = computed(() => Number(project.project?.id));
const visibleRowCount = computed(() => countStoryboardTableRows(storyboardTable.value));

const metaTheme = computed(() => {
  if (props.meta?.source === "structured") return "success";
  if (props.meta?.source === "draft") return "warning";
  return "default";
});

const metaLabel = computed(() => {
  if (props.meta?.source === "structured") return "结构化只读表";
  if (props.meta?.source === "draft") return "历史草稿展示";
  if (props.meta?.source === "empty") return "空分镜表";
  return "只读分镜表";
});

const rowCountLabel = computed(() => {
  const tableRows = props.meta?.rowCount ?? visibleRowCount.value;
  const storyboardRows = props.storyboardCount ?? 0;
  const ready = props.meta?.readyCount ?? 0;
  const draft = props.meta?.draftCount ?? 0;
  const legacy = props.meta?.legacyCount ?? 0;
  const statusText = [
    ready ? `ready ${ready}` : "",
    draft ? `draft ${draft}` : "",
    legacy ? `legacy ${legacy}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  const suffix = statusText ? ` · ${statusText}` : "";
  if (props.meta?.source === "structured") return `${tableRows || storyboardRows} 行 · 结构化分镜 ${storyboardRows} 条${suffix}`;
  if (props.meta?.source === "draft") return `${tableRows} 行 · 结构化分镜 ${storyboardRows} 条${suffix}`;
  return `结构化分镜 ${storyboardRows} 条${suffix}`;
});

const showDraftAlert = computed(() => props.meta?.source === "draft" || (props.meta && props.meta.complete === false));
const draftAlertMessage = computed(() => {
  return "当前分镜表来自历史草稿或不完整展示稿；如需修改事实，请编辑单条结构化分镜。";
});
const failureAlertMessage = computed(() => {
  if (!props.lastFailure) return "";
  const suffix = props.lastFailure.state === "invalid" ? "分镜字段校验失败。" : "提交失败，请重试生成。";
  return `上次分镜表提交失败，正式分镜未被覆盖。${suffix}`;
});

async function readTextAssetPage(id: number, offset: number) {
  return getTextAssetContent({
    projectId: projectId.value,
    id,
    offset,
    limit: TEXT_ASSET_PAGE_SIZE,
  });
}

async function copyMarkdown() {
  if (!storyboardTable.value) return;
  await navigator.clipboard.writeText(storyboardTable.value);
  window.$message?.success?.("已复制分镜表 Markdown");
}

function exportMarkdown() {
  if (!storyboardTable.value) return;
  const blob = new Blob([storyboardTable.value], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "storyboard-table.md";
  link.click();
  URL.revokeObjectURL(url);
}

async function openTextAsset() {
  const textAssetId = props.meta?.textAssetId;
  if (!textAssetId) return;
  textAssetVisible.value = true;
  textAssetContent.value = "";
  textAssetSize.value = 0;
  textAssetOffset.value = 0;
  textAssetEof.value = false;

  await loadMoreTextAsset();
}

async function loadMoreTextAsset() {
  const textAssetId = props.meta?.textAssetId;
  if (!textAssetId || !projectId.value || textAssetLoading.value || textAssetEof.value) return;
  textAssetLoading.value = true;
  try {
    const data = await readTextAssetPage(textAssetId, textAssetOffset.value);
    const chunk = data.content ?? "";
    textAssetContent.value += chunk;
    textAssetSize.value = data.size ?? textAssetContent.value.length;
    textAssetOffset.value += getByteLength(chunk);
    textAssetEof.value = Boolean(data.eof) || chunk.length === 0;
  } finally {
    textAssetLoading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.storyboardTable {
  max-width: 100vw;
  width: fit-content;
  min-width: 100px;
  user-select: text;
  cursor: default;

  .titleBar {
    cursor: grab;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .titleActions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }

  .storyboardList {
    display: flex;
    flex-direction: column;
    margin-top: 8px;

    :deep(.md-editor) {
      border: none;
      box-shadow: none;
    }

    :deep(.md-editor-preview-wrapper) {
      padding: 0;
    }
  }

  .metaLine {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }

  .hashText {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .readOnlyAlert,
  .failureAlert,
  .draftAlert {
    margin-top: 8px;
  }
}

.textAssetViewer {
  display: flex;
  flex-direction: column;
  gap: 10px;

  pre {
    max-height: 68vh;
    margin: 0;
    padding: 12px;
    overflow: auto;
    border-radius: 6px;
    background: var(--td-bg-color-secondarycontainer);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.7;
  }

  .textAssetFooter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}
</style>
