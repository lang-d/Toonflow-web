<template>
  <t-dialog v-model:visible="visible" header="上传本地音频" :confirm-btn="{ content: '保存为候选版本', loading }" :confirm-loading="loading" @confirm="submit">
    <t-form label-align="top">
      <t-form-item label="音频文件">
        <div class="dropZone" @click="inputRef?.click()" @dragover.prevent @drop.prevent="onDrop">
          <strong>{{ file?.name || '点击或拖入音频文件' }}</strong>
          <small v-if="file">{{ formatSize(file.size) }}</small>
        </div>
        <input ref="inputRef" type="file" accept="audio/*,.aac,.aiff,.flac,.m4a,.mp3,.ogg,.wav" hidden @change="onChange" />
      </t-form-item>
      <t-form-item label="版本名称"><t-input v-model="name" placeholder="默认使用文件名" /></t-form-item>
    </t-form>
  </t-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const visible = defineModel<boolean>("visible", { default: false });
const props = defineProps<{ loading?: boolean }>();
const emit = defineEmits<{ submit: [payload: { base64Data: string; name: string }] }>();
const inputRef = ref<HTMLInputElement>();
const file = ref<File | null>(null);
const name = ref("");

watch(visible, (next) => {
  if (!next) return;
  file.value = null;
  name.value = "";
});

function setFile(next?: File | null) {
  if (!next) return;
  if (!next.type.startsWith("audio/") && !/\.(aac|aiff|flac|m4a|mp3|ogg|wav)$/i.test(next.name)) {
    window.$message.warning("请选择音频文件");
    return;
  }
  file.value = next;
  if (!name.value) name.value = next.name.replace(/\.[^.]+$/, "");
}
function onChange(event: Event) {
  const target = event.target as HTMLInputElement;
  setFile(target.files?.[0]);
  target.value = "";
}
function onDrop(event: DragEvent) { setFile(event.dataTransfer?.files?.[0]); }
function formatSize(value: number) { return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(value / 1024))} KB`; }
function readAsDataUrl(target: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取音频失败"));
    reader.readAsDataURL(target);
  });
}
async function submit() {
  if (!file.value) return window.$message.warning("请选择音频文件");
  try {
    emit("submit", { base64Data: await readAsDataUrl(file.value), name: name.value.trim() || file.value.name.replace(/\.[^.]+$/, "") });
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : "读取音频失败");
  }
}
</script>

<style scoped>
.dropZone { display: grid; gap: 4px; min-height: 92px; place-content: center; border: 1px dashed var(--td-border-level-1-color); color: var(--td-text-color-secondary); cursor: pointer; text-align: center; }
.dropZone strong { color: var(--td-text-color-primary); font-weight: 500; }
.dropZone small { font-size: 12px; }
</style>
