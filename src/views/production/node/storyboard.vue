<template>
  <StoryboardNode :id="id" v-model="model" :handle-ids="handleIds" :assets-data="assetsData" />
</template>

<script setup lang="ts">
import StoryboardNode from "./storyboard/index.vue";
import type { AssetItem, Storyboard } from "../utils/flowBuilder";

defineProps<{
  id: string;
  handleIds: {
    target: string;
    source: string;
  };
  assetsData: AssetItem[];
}>();

const model = defineModel<Storyboard[]>({ required: true });
</script>
