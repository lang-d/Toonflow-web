<template>
  <section class="workflowSettingsPanel">
    <div class="workflowSettingsHeader">
      <div>
        <div class="workflowSettingsTitle">H3 工作流质量参数</div>
        <div class="workflowSettingsSubtitle">按工作流全局保存</div>
      </div>
      <div class="workflowSettingsActions">
        <t-tooltip v-if="recommendationText" :content="recommendationText" placement="top-right">
          <t-button variant="text" size="small" aria-label="查看推荐配置">
            <template #icon><t-icon name="help-circle" /></template>
          </t-button>
        </t-tooltip>
        <t-button variant="text" size="small" @click="toggleExpanded">
          {{ expanded ? "收起" : "配置" }}
        </t-button>
      </div>
    </div>

    <template v-if="expanded">
      <div v-if="loading" class="workflowSettingsLoading">
        <t-loading size="small" />
        <span>正在读取工作流参数…</span>
      </div>

      <div v-else-if="loadError" class="workflowSettingsError">
        <t-alert theme="error" :message="loadError" />
        <t-button variant="text" theme="primary" size="small" @click="loadConfig(true)">重试</t-button>
      </div>

      <template v-else-if="config">
        <t-alert
          v-if="config.staleKeys.length"
          theme="warning"
          message="云端工作流结构已变化，请重新保存或清空覆盖。"
          class="workflowStaleAlert" />

        <div v-if="config.instanceUrl" class="workflowInstance">
          <span>本次模板实例</span>
          <code>{{ config.instanceUrl }}</code>
        </div>

        <div v-if="config.parameters.length" class="workflowParameterList">
          <div v-for="parameter in config.parameters" :key="parameter.key" class="workflowParameter">
            <div class="workflowParameterLabel">{{ parameter.label || parameter.key }}</div>
            <t-switch
              v-if="controlType(parameter) === 'toggle'"
              v-model="draftValues[parameter.key] as boolean"
              :label="['开', '关']" />
            <t-input-number
              v-else-if="controlType(parameter) === 'number'"
              v-model="draftValues[parameter.key] as number"
              :min="parameter.min"
              :max="parameter.max"
              :step="parameter.step" />
            <t-select v-else-if="controlType(parameter) === 'select'" v-model="draftValues[parameter.key] as string">
              <t-option v-for="option in parameter.options" :key="String(option)" :value="option">{{ option }}</t-option>
            </t-select>
            <t-input v-else v-model="draftValues[parameter.key] as string" />
            <div v-if="parameter.help" class="workflowParameterHelp">{{ parameter.help }}</div>
          </div>
        </div>
        <t-empty v-else title="当前工作流没有可配置的执行参数" size="small" class="workflowEmpty" />

        <div class="workflowSaveActions">
          <t-button variant="outline" size="small" :disabled="saving" @click="loadConfig(true)">重新读取</t-button>
          <t-button theme="primary" size="small" :loading="saving" @click="saveConfig">保存参数</t-button>
          <t-button theme="default" size="small" :disabled="saving" @click="confirmClear">清空覆盖</t-button>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { DialogPlugin } from "tdesign-vue-next";
import axios from "@/utils/axios";

type ExecutionValue = string | number | boolean;
type ControlType = "input" | "number" | "toggle" | "select";

interface WorkflowParameter {
  key: string;
  label: string;
  currentValue: ExecutionValue;
  /** The backend defines the control; no node-level parameters are exposed to the UI. */
  ui: Exclude<ControlType, "input">;
  options?: Array<string | number>;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}

interface WorkflowConfig {
  modelName: string;
  workflowId: string;
  instanceUrl: string;
  parameters: WorkflowParameter[];
  savedValues: Record<string, ExecutionValue>;
  staleKeys: string[];
  recommendations: Array<{ hardware: string; unet: string; textEncoder: string }>;
}

const props = defineProps<{ modelName: string }>();

const expanded = ref(false);
const loading = ref(false);
const saving = ref(false);
const loadError = ref("");
const config = ref<WorkflowConfig | null>(null);
const draftValues = reactive<Record<string, ExecutionValue>>({});
let requestSequence = 0;

const recommendationText = computed(() =>
  (config.value?.recommendations || [])
    .map((item) => `${item.hardware}：${item.unet} + ${item.textEncoder}`)
    .join("\n"),
);

function controlType(parameter: WorkflowParameter): ControlType {
  if (parameter.ui) return parameter.ui;
  if (typeof parameter.currentValue === "boolean") return "toggle";
  if (typeof parameter.currentValue === "number") return "number";
  return "input";
}

function assignDraft(nextConfig: WorkflowConfig) {
  for (const key of Object.keys(draftValues)) delete draftValues[key];
  for (const parameter of nextConfig.parameters) {
    draftValues[parameter.key] = nextConfig.savedValues[parameter.key] ?? parameter.currentValue;
  }
}

async function loadConfig(force = false) {
  if (loading.value || (!force && config.value)) return;
  const sequence = ++requestSequence;
  loading.value = true;
  loadError.value = "";
  try {
    const response = await axios.post("/setting/zealman/getWorkflowExecutionConfig", { modelName: props.modelName });
    const nextConfig = response.data as WorkflowConfig;
    if (sequence !== requestSequence) return;
    config.value = {
      ...nextConfig,
      parameters: Array.isArray(nextConfig.parameters) ? nextConfig.parameters : [],
      savedValues: nextConfig.savedValues || {},
      staleKeys: Array.isArray(nextConfig.staleKeys) ? nextConfig.staleKeys : [],
      recommendations: Array.isArray(nextConfig.recommendations) ? nextConfig.recommendations : [],
    };
    assignDraft(config.value);
  } catch (error: any) {
    if (sequence !== requestSequence) return;
    loadError.value = error?.message || "读取工作流参数失败，请重试。";
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function toggleExpanded() {
  expanded.value = !expanded.value;
  if (expanded.value) void loadConfig();
}

function collectValues() {
  const values: Record<string, ExecutionValue> = {};
  for (const parameter of config.value?.parameters || []) {
    const value = draftValues[parameter.key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") values[parameter.key] = value;
  }
  return values;
}

async function persist(values: Record<string, ExecutionValue>, successMessage: string) {
  saving.value = true;
  try {
    await axios.post("/setting/zealman/saveWorkflowExecutionConfig", {
      modelName: props.modelName,
      values,
    });
    window.$message.success(successMessage);
    await loadConfig(true);
  } catch (error: any) {
    window.$message.error(error?.message || "保存工作流参数失败，请检查云端模板后重试。");
  } finally {
    saving.value = false;
  }
}

function saveConfig() {
  void persist(collectValues(), "工作流执行参数已保存");
}

function confirmClear() {
  const dialog = DialogPlugin.confirm({
    header: "清空工作流参数覆盖",
    body: "将恢复为当前云端工作流模板的默认参数。",
    confirmBtn: { content: "清空覆盖", theme: "danger" },
    onConfirm: async () => {
      dialog.hide();
      await persist({}, "工作流参数覆盖已清空");
    },
  });
}
</script>

<style scoped>
.workflowSettingsPanel {
  margin-top: 12px;
  border-top: 1px solid var(--td-component-stroke);
  padding-top: 10px;
}

.workflowSettingsHeader,
.workflowSettingsActions,
.workflowSaveActions {
  display: flex;
  align-items: center;
}

.workflowSettingsHeader {
  justify-content: space-between;
  gap: 12px;
}

.workflowSettingsActions,
.workflowSaveActions {
  gap: 6px;
}

.workflowSettingsTitle {
  color: var(--td-text-color-primary);
  font-size: 14px;
  font-weight: 600;
}

.workflowSettingsSubtitle,
.workflowInstance,
.workflowParameterHelp {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.workflowSettingsLoading,
.workflowSettingsError {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.workflowSettingsError :deep(.t-alert) {
  flex: 1;
}

.workflowStaleAlert {
  margin-top: 10px;
}

.workflowInstance {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.workflowInstance code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflowParameterList {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.workflowParameterLabel {
  margin-bottom: 6px;
  color: var(--td-text-color-primary);
  font-size: 13px;
}

.workflowParameterHelp {
  margin-top: 4px;
}

.workflowParameter :deep(.t-input-number),
.workflowParameter :deep(.t-select),
.workflowParameter :deep(.t-textarea) {
  width: 100%;
}

.workflowEmpty {
  margin-top: 10px;
}

.workflowSaveActions {
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
