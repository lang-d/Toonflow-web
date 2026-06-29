<template>
  <t-dialog v-model:visible="visible" attach="body" :header="$t('workbench.production.node.storyboard.referenceManage')" width="min(760px, 92vw)" :footer="false">
    <div class="referenceDialog">
      <div class="referenceDialogActions">
        <t-button theme="primary" variant="outline" @click="emit('pickAssets')">
          <template #icon><i-folder-open /></template>
          {{ $t("workbench.production.node.storyboard.pickFromAssets") }}
        </t-button>
        <t-button theme="primary" variant="outline" @click="emit('uploadLocal')">
          <template #icon><i-upload /></template>
          {{ $t("workbench.production.node.storyboard.localUpload") }}
        </t-button>
      </div>
      <div class="referenceDialogList">
        <div v-for="ref in currentReferenceRows" :key="ref.key" class="referenceRow">
          <img v-if="ref.type === 'image'" :src="ref.src" />
          <div v-else-if="ref.type === 'audio'" class="referenceAudioIcon">
            <i-volume-notice size="20" />
            <span>音频</span>
          </div>
          <div class="referenceInfo">
            <strong>{{ ref.label }}</strong>
            <span>{{ ref.group }}</span>
          </div>
          <t-button v-if="ref.type === 'audio'" size="small" variant="text" @click="emit('previewReference', ref)">试听</t-button>
          <t-tooltip v-if="ref.type === 'audio'" content="等待后端私有音频上传接口支持">
            <t-button size="small" variant="text" disabled>截取</t-button>
          </t-tooltip>
          <t-button shape="circle" variant="text" theme="danger" @click="emit('removeReference', ref)">
            <template #icon><i-delete /></template>
          </t-button>
        </div>
        <t-empty v-if="!currentReferenceRows.length" />
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
const visible = defineModel<boolean>("visible", { default: false });

defineProps<{
  currentReferenceRows: any[];
}>();

const emit = defineEmits<{
  pickAssets: [];
  uploadLocal: [];
  removeReference: [ref: any];
  previewReference: [ref: any];
}>();
</script>

<style scoped>
.referenceAudioIcon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  color: var(--td-brand-color);
  border-radius: 6px;
  background: var(--td-bg-color-container-hover);
}

.referenceAudioIcon span {
  font-size: 11px;
}
</style>
