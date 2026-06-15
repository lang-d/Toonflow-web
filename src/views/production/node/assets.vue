<template>
  <AssetsNode :id="id" v-model="model" :handle-ids="handleIds" />
</template>

<script setup lang="ts">
import AssetsNode from "./assets/index.vue";
import type { AssetItem } from "../utils/flowBuilder";

defineProps<{
  id: string;
  handleIds: {
    target: string;
  };
}>();

const model = defineModel<AssetItem[]>({ required: true });
</script>
