<template>
  <t-dialog
    v-model:visible="visible"
    attach="body"
    placement="center"
    width="min(900px, 94vw)"
    class="storyboardPromptDialog"
    :header="`分镜图 Prompt ${shotLabel}`"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: $t('common.save'), loading: saving, disabled: loading || primaryRequired }"
    :cancel-btn="$t('common.cancel')"
    destroy-on-close
    @confirm="emit('confirm')">
    <t-loading :loading="loading" show-overlay>
      <div class="storyboardPromptEditor">
        <div v-if="nodeOptions.length > 1" class="promptSourceRow">
          <div>
            <strong>{{ $t("workbench.production.node.storyboard.promptSourceNode") }}</strong>
            <p v-if="primaryRequired">{{ $t("workbench.production.node.storyboard.selectPrimaryRequired") }}</p>
          </div>
          <t-select v-model="primaryNodeId" :options="nodeOptions" style="width: 320px" />
        </div>

        <section class="promptEditorSection">
          <div class="sectionHeader">
            <strong>{{ $t("workbench.production.node.storyboard.referenceManage") }}</strong>
            <div class="referenceActions">
              <t-button size="small" variant="outline" @click="emit('pickAssets')">
                <template #icon><i-folder-open /></template>
                {{ $t("workbench.production.node.storyboard.pickFromAssets") }}
              </t-button>
              <t-button size="small" variant="outline" @click="emit('pickStoryboardImages')">
                <template #icon><i-image /></template>
                {{ $t("components.storyboardImageCheck.dialogTitle") }}
              </t-button>
              <t-button size="small" variant="outline" @click="emit('uploadLocal')">
                <template #icon><i-upload /></template>
                {{ $t("workbench.production.node.storyboard.localUpload") }}
              </t-button>
            </div>
          </div>

          <div v-if="references.length" class="promptReferenceList">
            <div v-for="ref in references" :key="ref.key" class="promptReferenceItem">
              <button class="promptReferencePreview" type="button" @click="emit('previewReference', ref)">
                <img v-if="ref.type === 'image'" :src="ref.src" :alt="ref.label" />
                <span v-else-if="ref.type === 'audio'" class="audioReferenceIcon">
                  <i-volume-notice size="22" />
                  <small>音频</small>
                </span>
                <span v-else class="audioReferenceIcon"><i-volume-notice size="22" /></span>
              </button>
              <div class="promptReferenceInfo">
                <strong>{{ ref.label }}</strong>
                <span>{{ ref.group }}</span>
              </div>
              <t-tooltip v-if="ref.type === 'audio'" content="等待后端私有音频上传接口支持">
                <t-button size="small" variant="text" disabled>截取</t-button>
              </t-tooltip>
              <t-button shape="circle" variant="text" theme="danger" @click="emit('removeReference', ref)">
                <template #icon><i-delete /></template>
              </t-button>
            </div>
          </div>
          <t-empty v-else />
        </section>

        <section class="promptEditorSection promptTextSection">
          <strong>分镜图提示词</strong>
          <PromptEditor
            v-model="prompt"
            :references="promptReferences"
            :placeholder="$t('workbench.production.node.storyboard.promptPlaceholder')" />
        </section>
      </div>
    </t-loading>
  </t-dialog>
</template>

<script setup lang="ts">
import PromptEditor from "@/components/promptEditor.vue";
import type { ReferenceView } from "../types";

const visible = defineModel<boolean>("visible", { default: false });
const prompt = defineModel<string>("prompt", { default: "" });
const primaryNodeId = defineModel<string>("primaryNodeId", { default: "" });

const props = defineProps<{
  loading: boolean;
  saving: boolean;
  shotLabel: string;
  references: ReferenceView[];
  nodeOptions: { label: string; value: string }[];
}>();

const primaryRequired = computed(() => props.nodeOptions.length > 1 && !primaryNodeId.value);
const promptReferences = computed(() =>
  props.references.map((item) => ({
    type: item.type,
    src: item.src,
    label: item.label,
    token: item.token,
    group: item.group,
  })),
);

const emit = defineEmits<{
  confirm: [];
  pickAssets: [];
  pickStoryboardImages: [];
  uploadLocal: [];
  removeReference: [ref: ReferenceView];
  previewReference: [ref: ReferenceView];
}>();
</script>

<style lang="scss">
.storyboardPromptDialog .t-dialog__body {
  min-height: 0;
  max-height: min(760px, calc(92vh - 130px));
  overflow: auto;
}

.storyboardPromptEditor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.promptSourceRow,
.sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.promptSourceRow {
  padding: 12px;
  border: 1px solid var(--td-warning-color-3);
  border-radius: 6px;
  background: var(--td-warning-color-1);
}

.promptSourceRow p {
  margin: 4px 0 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.promptEditorSection {
  padding: 14px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
  background: var(--td-bg-color-container);
}

.referenceActions {
  display: flex;
  gap: 8px;
}

.promptReferenceList {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.promptReferenceItem {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
}

.promptReferencePreview {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  overflow: hidden;
  cursor: zoom-in;
  background: var(--td-bg-color-container-hover);
}

.promptReferencePreview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.audioReferenceIcon {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  gap: 2px;
  color: var(--td-brand-color);
}

.audioReferenceIcon small {
  font-size: 11px;
}

.promptReferenceInfo {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.promptReferenceInfo strong,
.promptReferenceInfo span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.promptReferenceInfo span {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.promptTextSection .textareaWrapper {
  min-height: 250px;
  margin-top: 10px;
}

.promptTextSection .promptEditor {
  min-height: 250px;
  max-height: 420px;
  overflow: auto;
}
</style>
