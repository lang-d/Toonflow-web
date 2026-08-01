<template>
  <div class="directorPlanPreview">
    <template v-for="(segment, index) in segments" :key="index">
      <MdPreview v-if="segment.kind === 'markdown'" :model-value="segment.content" :theme="theme" />
      <AxisMapDiagram v-else :map="segment.map" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { MdPreview } from "md-editor-v3";
import AxisMapDiagram from "./AxisMapDiagram.vue";
import { splitDirectorPlanMarkdown } from "../utils/axisMap";

const props = defineProps<{
  content: string;
  theme?: "light" | "dark";
}>();

const segments = computed(() => splitDirectorPlanMarkdown(props.content));
</script>

<style lang="scss" scoped>
.directorPlanPreview {
  :deep(.md-editor-preview-wrapper),
  :deep(.md-editor-preview) {
    padding: 0;
    background: transparent;
  }
}
</style>
