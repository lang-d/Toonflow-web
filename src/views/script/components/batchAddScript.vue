<template>
  <div class="purgeNovel">
    <t-dialog :footer="false" v-model:visible="purgeNovelShow" :header="$t('workbench.script.import.batchTitle')" width="50%" placement="center">
      <div class="data">
        <t-tabs :value="activeKey" disabled>
          <t-tab-panel value="To1" :label="$t('workbench.novel.import.step1')" style="height: 680px; overflow-y: auto">
            <div v-if="!uploadedScripts.length" class="regexRow f ac" style="margin-top: 10px; gap: 8px">
              <span class="regexLabel">{{ $t('workbench.script.import.episodeRegex') }}</span>
              <t-input v-model="customRegStr" :placeholder="$t('workbench.script.import.episodeRegexPh')" clearable :disabled="aiRegexLoading" style="flex: 1" :status="regexError ? 'error' : undefined" :tips="regexError || undefined" />
              <t-button :loading="aiRegexLoading" @click="getAiRegex">{{ $t('workbench.script.import.getAiRegex') }}</t-button>
            </div>
            <div class="uploadArea" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
              <t-upload ref="uploadRef" v-model="fileList" theme="file" :multiple="true" :before-upload="handleBeforeUpload" style="display: none" />
              <div class="dragIcon"><i-upload-one theme="outline" size="32" fill="var(--td-brand-color)" /></div>
              <p class="uploadText">拖拽一个或多个剧本文件到此处，或点击上传</p>
              <p class="uploadHint">支持 .txt、.md、.markdown、.docx；所有已解析正文合计不超过 100MB</p>
            </div>
            <div v-if="uploadedScripts.length" class="fileSummary">
              <span>已加载 {{ uploadedScripts.length }} 个文件，共 {{ formatBytes(uploadedTextBytes) }}</span>
              <t-button size="small" variant="text" theme="danger" @click="clearUploadedFiles">清除文件</t-button>
            </div>
            <t-divider>{{ $t('workbench.novel.import.or') }}</t-divider>
            <div class="formItem">
              <div class="label">{{ $t('workbench.script.import.pasteLabel') }}</div>
              <div class="uploadWrap"><t-textarea v-model="content" :disabled="uploadedScripts.length > 0" :placeholder="uploadedScripts.length ? '已使用文件导入；清除文件后可粘贴全文拆章' : $t('workbench.script.add.scriptContentPh')" :autosize="{ minRows: 10, maxRows: 10 }" /></div>
              <div class="footerInfo f ac jb" style="margin-top: 8px">
                <div><span class="charCount">{{ content.length }} {{ $t('workbench.novel.import.chars') }}</span><span v-if="content.length > 0 && content.length < 100" class="tips warn">{{ $t('workbench.novel.import.tooShort') }}</span></div>
                <span>{{ uploadedScripts.length ? `已解析 ${tableData.length} 个文件剧本` : $t('workbench.script.import.parsedChapters', { count: tableData.length }) }}</span>
              </div>
            </div>
            <div style="margin-top: 16px; text-align: right"><t-button theme="primary" style="margin-left: 10px" :disabled="!tableData.length" @click="activeKey = 'To2'">{{ $t('workbench.novel.import.nextStep') }}</t-button></div>
          </t-tab-panel>
          <t-tab-panel value="To2" :label="$t('workbench.novel.import.step2')" style="height: 680px; overflow-y: auto">
            <div class="fc to2Box">
              <t-table ref="tableRef" row-key="index" :data="tableData" :columns="columns" :selected-row-keys="selectedRowKeys" hover style="flex: 1; overflow-y: auto" @select-change="onSelectChange">
                <template #scriptData="{ row }"><t-tooltip :content="row.scriptData" placement="top"><span class="ellipsisText">{{ row.scriptData }}</span></t-tooltip></template>
              </t-table>
              <div class="selectedInfo">{{ $t('workbench.novel.import.selectedInfo', { count: selectedTextLength }) }}</div>
              <div style="margin-top: 16px; text-align: right"><t-button variant="outline" @click="activeKey = 'To1'">{{ $t('workbench.novel.import.prevStep') }}</t-button><t-button theme="primary" style="margin-left: 10px" :loading="nextLoading" @click="keep">保存</t-button></div>
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { LoadingPlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";
import parseScript from "@/utils/parseScript";
import mammoth from "mammoth";
import type { UploadFile, PrimaryTableCol, TableRowData } from "tdesign-vue-next";
import projectStore from "@/stores/project";

const MAX_BATCH_TEXT_BYTES = 100 * 1024 * 1024;
const { project } = storeToRefs(projectStore());
interface ChapterItem { index: number; scriptName: string; scriptData: string; }
const purgeNovelShow = defineModel<boolean>();
const activeKey = ref("To1");
const uploadRef = ref();
const content = ref("");
const fileList = ref<any[]>([]);
const uploadedScripts = ref<Array<Omit<ChapterItem, "index">>>([]);
const selectedRowKeys = ref<number[]>([]);
const nextLoading = ref(false);
const customRegStr = ref("");
const regexError = ref("");
const aiRegexLoading = ref(false);

watch(customRegStr, (value) => {
  if (!value.trim()) return void (regexError.value = "");
  try { const match = value.match(/^\/(.*)\/([ igmuy]*)$/); new RegExp(match ? match[1] : value); regexError.value = ""; }
  catch { regexError.value = $t("workbench.script.import.regexInvalid"); }
});

const columns: PrimaryTableCol<TableRowData>[] = [
  { colKey: "row-select", type: "multiple", width: 60 },
  { colKey: "index", title: $t("workbench.script.import.col.chapter"), width: 100 },
  { colKey: "scriptName", title: $t("workbench.script.import.col.scriptName"), width: 200, ellipsis: true },
  { colKey: "scriptData", title: $t("workbench.script.import.col.scriptData"), ellipsis: true },
];
const tableData = computed<ChapterItem[]>(() => {
  if (uploadedScripts.value.length) return uploadedScripts.value.map((item, index) => ({ ...item, index: index + 1 }));
  if (!content.value) return [];
  try { return parseScript(content.value, customRegStr.value || undefined).map((episode) => ({ index: episode.index, scriptName: episode.chapter, scriptData: episode.text })); }
  catch { return []; }
});
const selectedRows = computed(() => tableData.value.filter((item) => selectedRowKeys.value.includes(item.index)));
const selectedTextLength = computed(() => selectedRows.value.reduce((sum, item) => sum + item.scriptData.length, 0));
const uploadedTextBytes = computed(() => new Blob(uploadedScripts.value.map((item) => item.scriptData)).size);

function triggerUpload() { uploadRef.value?.triggerUpload(); }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
function stripExtension(name: string) { return name.replace(/\.(txt|md|markdown|docx)$/i, "") || name; }
function uniqueName(name: string, additionalNames: string[] = []) {
  const names = new Set([...uploadedScripts.value.map((item) => item.scriptName), ...additionalNames]);
  if (!names.has(name)) return name;
  let suffix = 2;
  while (names.has(`${name} (${suffix})`)) suffix += 1;
  return `${name} (${suffix})`;
}
function isSupportedFile(file: File) { return /\.(txt|md|markdown|docx)$/i.test(file.name); }
async function readFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (/\.(txt|md|markdown)$/i.test(file.name) || file.type === "text/plain" || file.type === "text/markdown") return new TextDecoder().decode(buffer);
  return (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
}
async function ingestFiles(files: Iterable<File>) {
  const loader = LoadingPlugin({ fullscreen: true, attach: "body", text: "正在解析剧本文件..." });
  const additions: Array<Omit<ChapterItem, "index">> = [];
  try {
    for (const file of files) {
      if (file.type === "application/msword") { window.$message.warning(`${file.name} 为 .doc 格式，请转换为 .docx`); continue; }
      if (!isSupportedFile(file)) { window.$message.warning(`${file.name} 不是支持的剧本文件`); continue; }
      try {
        const scriptData = await readFile(file);
        if (!scriptData.trim()) { window.$message.warning(`${file.name} 为空，已跳过`); continue; }
        const nextBytes = new Blob([...uploadedScripts.value, ...additions].map((item) => item.scriptData).concat(scriptData)).size;
        if (nextBytes > MAX_BATCH_TEXT_BYTES) { window.$message.warning(`${file.name} 会使本次导入超过 100MB，已跳过`); continue; }
        additions.push({ scriptName: uniqueName(stripExtension(file.name), additions.map((item) => item.scriptName)), scriptData });
      } catch { window.$message.error(`${file.name} 解析失败，已跳过`); }
    }
    if (additions.length) {
      content.value = "";
      uploadedScripts.value.push(...additions);
      selectedRowKeys.value = tableData.value.map((item) => item.index);
    }
  } finally { loader.hide(); }
}
async function handleBeforeUpload(file: UploadFile) { if (file.raw) await ingestFiles([file.raw]); return false; }
async function handleDrop(event: DragEvent) { const files = event.dataTransfer?.files; if (files?.length) await ingestFiles(Array.from(files)); }
function clearUploadedFiles() { uploadedScripts.value = []; fileList.value = []; selectedRowKeys.value = []; }
function onSelectChange(keys: Array<string | number>) { selectedRowKeys.value = keys as number[]; }
const emit = defineEmits(["select"]);
async function keep() {
  if (!selectedRows.value.length) return window.$message.warning($t("workbench.script.import.msg.selectChapters"));
  nextLoading.value = true;
  try {
    await axios.post("/script/batchAddScript", { projectId: project.value?.id, data: selectedRows.value });
    emit("select"); window.$message.success($t("workbench.script.import.msg.saveSuccess")); purgeNovelShow.value = false;
  } catch (error) { window.$message.error((error as Error).message); }
  finally { nextLoading.value = false; }
}
watch(content, (value) => { if (value && uploadedScripts.value.length) clearUploadedFiles(); });
watch(purgeNovelShow, (visible) => {
  if (visible) return;
  content.value = ""; fileList.value = []; uploadedScripts.value = []; selectedRowKeys.value = []; activeKey.value = "To1"; customRegStr.value = ""; regexError.value = "";
});
async function getAiRegex() {
  if (!content.value.trim()) return window.$message.warning($t("workbench.script.import.msg.selectChapters"));
  aiRegexLoading.value = true;
  try { const response = await axios.post("/script/getAiRegex", { content: content.value.slice(0, 2000) }); const data = response?.data ?? response; if (data) customRegStr.value = data; }
  catch (error) { window.$message.error((error as Error).message); }
  finally { aiRegexLoading.value = false; }
}
</script>

<style lang="scss" scoped>
.purgeNovel .data .uploadArea { margin-top:20px; padding:38px 16px; border:2px dashed #969494; border-radius:8px; text-align:center; cursor:pointer; transition:all .2s; }.purgeNovel .data .uploadArea:hover { border-color:#000; }.dragIcon { margin-bottom:12px; }.uploadText { font-size:14px; margin:0 0 8px; }.uploadHint,.fileSummary { font-size:12px; color:var(--td-text-color-placeholder); }.fileSummary { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }.to2Box { height:100%; }.formItem .label { font-weight:500; margin-bottom:8px; }.footerInfo { font-size:12px; }.tips.warn { margin-left:8px; }.ellipsisText { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block; max-width:100%; }.selectedInfo { margin-top:12px; font-size:14px; }
</style>
