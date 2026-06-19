<template>
  <t-dialog v-model:visible="visible" attach="body" :header="$t('workbench.production.node.storyboard.history')" width="min(760px, 92vw)" :footer="false">
    <t-loading :loading="historyLoading">
      <div class="historyGrid">
        <div
          v-for="item in historyItems"
          :key="item.id"
          class="historyCard"
          :class="{ active: historySelectedId === item.id }"
          @click="emit('selectHistoryItem', item)">
          <img :src="item.previewUrl || item.url" class="historyThumb" />
          <div class="historyMeta">
            <div class="historyPrompt">{{ item.prompt }}</div>
            <div class="historyTime">{{ item.createTime }}</div>
          </div>
        </div>
        <t-empty v-if="!historyItems.length && !historyLoading" />
      </div>
    </t-loading>
  </t-dialog>
</template>

<script setup lang="ts">
const visible = defineModel<boolean>("visible", { default: false });

defineProps<{
  historyLoading: boolean;
  historyItems: any[];
  historySelectedId: number | null;
}>();

const emit = defineEmits<{
  selectHistoryItem: [item: any];
}>();
</script>
