<template>
  <t-dialog
    v-model:visible="visible"
    attach="body"
    placement="center"
    :z-index="4000"
    :destroy-on-close="true"
    :header="$t('workbench.production.editImage.history')"
    width="min(760px, 92vw)"
    :footer="false">
    <div class="historyDialogBody" @mousedown.stop @wheel.stop @click.stop>
      <t-loading :loading="historyLoading" class="historyLoading">
        <div class="historyGrid">
          <button
          v-for="item in historyItems"
          :key="item.id"
          type="button"
          class="historyCard"
          :class="{ active: selectedHistoryId === item.id }"
          @click="emit('selectHistory', item)">
            <img :src="item.previewUrl || item.url" class="historyThumb" alt="" />
            <span class="historyMeta">
              <span class="historyPrompt">{{ item.prompt }}</span>
              <span class="historyTime">{{ item.createTime }}</span>
            </span>
          </button>
          <t-empty v-if="!historyItems.length && !historyLoading" class="historyEmpty" />
        </div>
      </t-loading>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
const visible = defineModel<boolean>("visible", { default: false });

defineProps<{
  historyLoading: boolean;
  historyItems: any[];
  selectedHistoryId: number | null;
}>();

const emit = defineEmits<{
  selectHistory: [item: any];
}>();
</script>

<style scoped lang="scss">
.historyDialogBody {
  width: 100%;
  min-height: 240px;
}

.historyLoading {
  display: block;
  width: 100%;
  min-height: 240px;
}

.historyGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  width: 100%;
  max-height: min(560px, 68vh);
  overflow-y: auto;
}

.historyCard {
  display: block;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  color: inherit;
  text-align: left;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 6px;
  cursor: pointer;
}

.historyCard:hover {
  border-color: var(--td-brand-color-5);
}

.historyCard.active {
  border-color: var(--td-brand-color);
  box-shadow: 0 0 0 1px var(--td-brand-color);
}

.historyThumb {
  display: block;
  width: 100%;
  height: 132px;
  object-fit: cover;
}

.historyMeta {
  display: block;
  padding: 8px;
  font-size: 12px;
}

.historyPrompt,
.historyTime {
  display: block;
}

.historyPrompt {
  min-height: 36px;
  overflow: hidden;
  line-height: 18px;
  text-overflow: ellipsis;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.historyTime {
  margin-top: 4px;
  overflow: hidden;
  color: var(--td-text-color-placeholder);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.historyEmpty {
  grid-column: 1 / -1;
}
</style>
