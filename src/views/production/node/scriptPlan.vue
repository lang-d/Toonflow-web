<template>
  <t-card class="scriptPlan">
    <div class="titleBar dragHandle pr">
      <div class="title c">{{ $t("workbench.production.node.scriptPlan.title") }}</div>
      <t-button size="small" variant="text" @click="openEdit">{{ $t("workbench.production.edit") }}</t-button>
      <Handle :id="props.handleIds.target" type="target" :position="Position.Left" style="left: calc(-1 * var(--td-comp-paddingLR-xl))" />
      <Handle :id="props.handleIds.source" type="source" :position="Position.Right" style="right: calc(-1 * var(--td-comp-paddingLR-xl))" />
    </div>
    <t-alert v-if="generationMessage" class="generationAlert" :theme="generationTheme" :message="generationMessage" />
    <div class="content">
      <t-empty v-if="!scriptPlan" style="margin-top: 16px"></t-empty>
      <DirectorPlanPreview v-else :content="scriptPlan" :theme="mdTheme" />
    </div>
  </t-card>

  <t-dialog
    v-model:visible="dialogVisible"
    :header="$t('workbench.production.node.scriptPlan.editDialog')"
    :width="'90vw'"
    :confirm-btn="$t('workbench.production.save')"
    :cancel-btn="$t('workbench.production.cancel')"
    @confirm="onConfirm"
    @cancel="onCancel"
    @close="onCancel"
    :close-on-overlay-click="false"
    placement="center"
    attach="body">
    <MdEditor
      v-model="editContent"
      :theme="mdTheme"
      :toolbars="toolbars"
      :footers="[]"
      style="height: 72vh"
      @onUploadImg="() => {}"
      @drop.prevent
      @paste="onPaste" />
  </t-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { MdEditor } from "md-editor-v3";
import type { ToolbarNames } from "md-editor-v3";
import DirectorPlanPreview from "../components/DirectorPlanPreview.vue";
import productionAgentStore from "@/stores/productionAgent";
import settingStore from "@/stores/setting";
import type { DirectorPlanGenerationState } from "../utils/flowBuilder";
const { themeSetting } = storeToRefs(settingStore());
const mdTheme = computed(() => (themeSetting.value.mode === "auto" ? undefined : themeSetting.value.mode));

const props = defineProps<{
  id: string;
  generation?: DirectorPlanGenerationState;
  handleIds: {
    target: string;
    source: string;
  };
}>();

const scriptPlan = defineModel<string>({ required: true });
const editContent = ref("");
const dialogVisible = ref(false);

const generationTheme = computed<"info" | "success" | "warning" | "error">(() => {
  const state = props.generation?.current?.state;
  if (state === "writing" || state === "committing") return "info";
  if (state === "committed") return "success";
  if (props.generation?.lastFailure) return "error";
  return "info";
});

const generationMessage = computed(() => {
  const current = props.generation?.current;
  if (current?.state === "writing") return "导演规划正在生成中，当前展示的仍是已提交的正式版本。";
  if (current?.state === "committing") return "导演规划正在提交正式版本，完成后会自动刷新。";
  if (current?.state === "committed") {
    const parts = [
      current.textAssetId ? `文本资产 #${current.textAssetId}` : "",
      current.version ? `版本 ${current.version}` : "",
    ].filter(Boolean);
    return parts.length ? `导演规划已提交：${parts.join(" / ")}` : "导演规划已提交。";
  }
  const failure = props.generation?.lastFailure;
  if (!failure) return "";
  return `上次导演规划提交失败：${formatFailureReason(failure.errorJson)}`;
});

function formatFailureReason(errorJson?: string | null) {
  if (!errorJson) return "请重新生成或检查输入。";
  try {
    const parsed = JSON.parse(errorJson);
    if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message;
    if (Array.isArray(parsed?.issues) && parsed.issues.length) {
      return parsed.issues
        .map((issue: any) => issue?.message || issue?.field || "")
        .filter(Boolean)
        .slice(0, 3)
        .join("；");
    }
  } catch {}
  return errorJson;
}

const toolbars: ToolbarNames[] = [
  "bold",
  "underline",
  "italic",
  "strikeThrough",
  "-",
  "title",
  "sub",
  "sup",
  "quote",
  "unorderedList",
  "orderedList",
  "task",
  "-",
  "codeRow",
  "code",
  "table",
  "-",
  "revoke",
  "next",
  "=",
  "preview",
];

function openEdit() {
  editContent.value = scriptPlan.value ?? "";
  dialogVisible.value = true;
}

function onConfirm() {
  scriptPlan.value = editContent.value;
  productionAgentStore().setFlowData();

  dialogVisible.value = false;
}

function onCancel() {
  dialogVisible.value = false;
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/") || item.type.startsWith("video/")) {
      e.preventDefault();
      return;
    }
  }
}
</script>

<style lang="scss" scoped>
.scriptPlan {
  max-width: 100vw;
  width: fit-content;
  min-width: 200px;
  user-select: text;
  cursor: default;

  .titleBar {
    cursor: grab;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .generationAlert {
    margin-top: 8px;
  }

  .title {
    background-color: #000;
    width: fit-content;
    padding: 5px 10px;
    color: #fff;
    border-radius: 8px 0;
    font-size: 16px;
  }

  .content {
    margin-top: 8px;

    :deep(.md-editor) {
      border: none;
    }
  }
}
</style>
