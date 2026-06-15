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
          <img :src="ref.src" />
          <div class="referenceInfo">
            <strong>{{ ref.label }}</strong>
            <span>{{ ref.group }}</span>
          </div>
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
}>();
</script>
