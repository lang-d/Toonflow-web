<template>
  <div class="data" @click="emit('toggleSelected')">
    <div class="title ac">
      <i-pic theme="outline" size="16" fill="#000000" />
      <span class="titleText">{{ $t("workbench.production.editImage.imageGeneration") }}</span>
    </div>
    <div class="image">
      <div v-if="generating" class="imageLoading">
        <div class="loadingSpinner"></div>
        <span class="loadingText">{{ $t("workbench.production.editImage.generating") }}</span>
      </div>
      <div v-else class="imageWrapper">
        <t-image class="image" :src="data.generatedImage" fit="contain" :class="['nodeImage', { selected }]">
          <template #overlayContent>
            <div class="imageToolsWrap">
              <ImageTools :src="data.generatedImage ?? ''" position="br" />
            </div>
          </template>
        </t-image>
      </div>
      <t-dropdown :options="options" :disabled="generating" @click="emit('uploadOption', $event)">
        <div class="upload ac" :class="{ disabled: generating }" @click.stop>
          <i-upload theme="outline" size="18" fill="#fff" />
          <span style="margin-left: 5px; color: #fff">{{ $t("workbench.production.editImage.upload") }}</span>
        </div>
      </t-dropdown>
      <t-tooltip theme="primary" :content="$t('workbench.production.editImage.deleteNode')">
        <div class="remove ac" :class="{ disabled: generating }" @click.stop="!generating && emit('remove')">
          <i-delete theme="outline" size="18" fill="#fff" />
        </div>
      </t-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GeneratedNodeData } from "../../../utils/editImageType";
import type { DropdownOption } from "tdesign-vue-next/es/dropdown";

defineProps<{
  data: GeneratedNodeData;
  generating: boolean;
  selected: boolean;
  options: DropdownOption[];
}>();

const emit = defineEmits<{
  toggleSelected: [];
  uploadOption: [option: DropdownOption];
  remove: [];
}>();
</script>

<style scoped lang="scss">
.data {
  width: 100%;
  cursor: pointer;
}

.title {
  height: 30px;
  padding: 5px;
}

.titleText {
  margin-left: 5px;
  color: var(--td-text-color-secondary);
}

.image {
  position: relative;
  width: 100%;
  height: 320px;
}

.remove,
.upload {
  position: absolute;
  top: 10px;
  z-index: 3;
  cursor: pointer;
}

.remove {
  right: 10px;
  padding: 5px;
  border-radius: 8px;
  background-color: rgba(220, 50, 50, 0.78);
}

.remove:hover {
  background-color: rgb(220, 50, 50);
}

.upload {
  left: 10px;
  padding: 5px 10px;
  border-radius: 8px;
  background-color: rgba(0, 0, 0, 0.55);
}

.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.imageLoading {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-radius: 8px;
  background-color: var(--td-bg-color-component);
}

.loadingSpinner {
  width: 36px;
  height: 36px;
  border: 3px solid #d0d0d0;
  border-top-color: #5bccb3;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loadingText {
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

.imageWrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

:deep(.nodeImage) {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 3px solid transparent;
  border-radius: 8px;
}

:deep(.nodeImage.selected) {
  border-color: var(--td-text-color-primary);
}

.imageToolsWrap {
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.image:hover .imageToolsWrap {
  pointer-events: auto;
  opacity: 1;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
