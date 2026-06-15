<template>
  <div v-show="selected" class="parameter" @wheel.stop @mousedown.stop @click.stop>
    <div class="image-refs" :style="imageRefsStyle">
      <div v-for="(item, index) in referenceImages" :key="index" class="ref-thumb" :style="refThumbStyle">
        <img :src="item.previewImage || item.image" class="ref-img" :style="refImgStyle" alt="" />
      </div>
    </div>
    <div class="text w" :class="{ locked: generating }">
      <PromptEditor v-model="data.prompt" :references="references" :placeholder="$t('workbench.production.editImage.promptPlaceholder')" />
    </div>
    <div class="operate ac jb">
      <div class="ac" :class="{ locked: generating }">
        <modelSelect v-model="data.model" type="image" size="small" />
        <t-select v-model="data.ratio" :disabled="generating" class="paramSelect ml-5" size="small" :placeholder="$t('workbench.production.editImage.ratio')">
          <t-option value="16:9" label="16:9" />
          <t-option value="9:16" label="9:16" />
          <t-option value="1:1" label="1:1" />
        </t-select>
        <t-select v-model="data.quality" :disabled="generating" class="paramSelect ml-5" size="small" :placeholder="$t('workbench.production.editImage.quality')">
          <t-option value="1K" label="1K" />
          <t-option value="2K" label="2K" />
          <t-option value="4K" label="4K" />
        </t-select>
      </div>

      <div class="f" style="gap: 5px; margin-left: 5px">
        <t-popup :content="$t('workbench.production.editImage.generateBtn')">
          <t-button theme="primary" size="small" class="generateBtn" :disabled="generating || !targetReady" :loading="generating" @click="emit('generate')">
            <template #icon><i-arrow-up /></template>
          </t-button>
        </t-popup>
        <t-popup :content="$t('workbench.production.editImage.history')">
          <t-button theme="default" size="small" :disabled="generating || !targetReady" @click="emit('openHistory')">
            <template #icon><i-history /></template>
          </t-button>
        </t-popup>
        <t-popup :content="$t('workbench.production.save')">
          <t-button theme="primary" size="small" class="keepBtn" :disabled="generating" :loading="generating" @click="emit('keep')">
            <template #icon><i-save /></template>
          </t-button>
        </t-popup>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import modelSelect from "@/components/modelSelect.vue";
import PromptEditor from "@/components/promptEditor.vue";
import type { GeneratedNodeData } from "../../../utils/editImageType";

defineProps<{
  data: GeneratedNodeData;
  selected: boolean;
  generating: boolean;
  targetReady: boolean;
  referenceImages: any[];
  references: any[];
}>();

const emit = defineEmits<{
  generate: [];
  openHistory: [];
  keep: [];
}>();

const imageRefsStyle = {
  display: "flex",
  alignItems: "center",
  height: "66px",
  maxHeight: "66px",
  overflowX: "auto",
  overflowY: "hidden",
  gap: "8px",
  padding: "10px",
  boxSizing: "border-box",
} as const;

const refThumbStyle = {
  flex: "0 0 45px",
  width: "45px",
  height: "45px",
  minWidth: "45px",
  maxWidth: "45px",
  minHeight: "45px",
  maxHeight: "45px",
  overflow: "hidden",
  borderRadius: "10px",
} as const;

const refImgStyle = {
  display: "block",
  width: "45px",
  height: "45px",
  minWidth: "45px",
  maxWidth: "45px",
  minHeight: "45px",
  maxHeight: "45px",
  objectFit: "cover",
} as const;
</script>

<style lang="scss" scoped>
.parameter {
  position: absolute;
  top: 100%;
  left: 50%;
  z-index: 9999;
  width: 500px;
  margin-top: 10px;
  transform: translateX(-50%);
  border: 1px solid var(--td-border-level-2-color);
  border-radius: 10px;
  background-color: var(--td-bg-color-container);
}

.image-refs,
.imageRefs {
  display: flex !important;
  align-items: center;
  height: 66px;
  max-height: 66px;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 8px;
  padding: 10px;
  box-sizing: border-box;
}

.ref-thumb,
.refThumb {
  flex: 0 0 45px !important;
  width: 45px !important;
  height: 45px !important;
  min-width: 45px !important;
  max-width: 45px !important;
  min-height: 45px !important;
  max-height: 45px !important;
  overflow: hidden;
  border-radius: 10px;
  background: var(--td-bg-color-container-hover);
}

.ref-img,
.refImg,
.ref-img img,
.refImg img {
  display: block;
  width: 45px !important;
  height: 45px !important;
  max-width: 45px !important;
  max-height: 45px !important;
  object-fit: cover !important;
}

.text {
  position: relative;
  display: flex;
  height: 200px;
  min-height: 100px;
  max-height: 500px;
  overflow: auto;
  resize: vertical;
}

.operate {
  height: 50px;
  padding: 10px;
}

.paramSelect {
  width: 100px;
  min-width: 100px;
}

.ml-5 {
  margin-left: 5px;
}

.generateBtn {
  margin-left: auto;
  --td-brand-color: #5bccb3;
  --td-brand-color-hover: #4ab8a0;
}

.locked {
  pointer-events: none;
  opacity: 0.72;
}
</style>
