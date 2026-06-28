<template>
  <div class="vec3Input">
    <label v-for="axis in axes" :key="axis">
      <span>{{ axis.toUpperCase() }}</span>
      <t-input-number
        :model-value="modelValue[axis]"
        :step="step"
        size="small"
        :decimal-places="2"
        @change="updateAxis(axis, $event)" />
    </label>
  </div>
</template>

<script setup lang="ts">
import type { DirectorVec3 } from "../../../utils/editImageType";

const props = withDefaults(defineProps<{ modelValue: DirectorVec3; step?: number }>(), { step: 0.1 });
const emit = defineEmits<{
  "update:modelValue": [value: DirectorVec3];
  change: [value: DirectorVec3];
}>();
const axes = ["x", "y", "z"] as const;

function updateAxis(axis: (typeof axes)[number], value: number | string | undefined) {
  const next = { ...props.modelValue, [axis]: Number(value ?? 0) };
  emit("update:modelValue", next);
  emit("change", next);
}
</script>

<style scoped>
.vec3Input {
  display: grid;
  grid-template-columns: repeat(3, minmax(48px, 1fr));
  gap: 5px;
  min-width: 0;
}

.vec3Input label {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  align-items: center;
  min-width: 0;
  overflow: hidden;
  background: #2d2d2d;
  border-radius: 5px;
}

.vec3Input span {
  color: #8590a0;
  font-size: 10px;
  text-align: center;
}

.vec3Input :deep(.t-input-number) {
  width: 100%;
  min-width: 0;
}

.vec3Input :deep(.t-input),
.vec3Input :deep(.t-input-number__input),
.vec3Input :deep(.t-input__wrap) {
  width: 100%;
  min-width: 0;
}

.vec3Input :deep(.t-input__inner) {
  min-width: 0;
  padding: 0 4px;
  text-align: center;
}

.vec3Input :deep(.t-input-number__decrease),
.vec3Input :deep(.t-input-number__increase) {
  display: none;
}
</style>
