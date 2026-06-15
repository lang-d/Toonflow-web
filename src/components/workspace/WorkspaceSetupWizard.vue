<template>
  <t-dialog
    v-model:visible="visible"
    :header="$t('workspace.setupTitle')"
    width="760px"
    placement="center"
    :footer="false"
    :close-btn="false"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false">
    <div class="wizard">
      <t-alert theme="info" :message="$t('workspace.setupIntro')" />

      <div v-if="migrationTask" class="migrationState">
        <div class="progressTop">
          <strong>{{ workspace.describeTaskPhase(migrationTask.phase) }}</strong>
          <span>{{ Math.round(migrationTask.progress || 0) }}%</span>
        </div>
        <t-progress :percentage="Math.round(migrationTask.progress || 0)" />
        <t-alert v-if="migrationTask.status === 'failed'" theme="error" :message="migrationTask.reason || $t('workspace.operationFailed')" />
        <div class="actions">
          <t-button v-if="workspace.restartRequired" theme="primary" @click="handleRestart">{{ $t("workspace.restartNow") }}</t-button>
        </div>
      </div>

      <template v-else>
        <t-radio-group v-model="mode" variant="default-filled">
          <t-radio-button value="migrate" :disabled="healthyCandidates.length === 0">
            {{ $t("workspace.migrateLegacy") }}
          </t-radio-button>
          <t-radio-button value="empty">{{ $t("workspace.createEmpty") }}</t-radio-button>
        </t-radio-group>

        <div v-if="mode === 'migrate'" class="legacyList">
          <div
            v-for="candidate in workspace.legacyCandidates"
            :key="candidate.path"
            class="candidate"
            :class="{ active: selectedSourcePath === candidate.path, disabled: !candidate.healthy }"
            @click="candidate.healthy && (selectedSourcePath = candidate.path)">
            <div>
              <div class="candidatePath">{{ candidate.path }}</div>
              <div class="candidateMeta">
                {{ $t("workspace.projectCount", { count: candidate.projectCount }) }}
                ·
                {{ $t("workspace.mediaFiles", { count: candidate.mediaFiles }) }}
                ·
                {{ workspace.formatBytes(candidate.totalBytes) }}
              </div>
              <div v-if="!candidate.healthy" class="candidateError">{{ candidate.message }}</div>
            </div>
            <t-tag :theme="candidate.healthy ? 'success' : 'danger'" variant="light">
              {{ candidate.healthy ? $t("workspace.healthy") : $t("workspace.unhealthy") }}
            </t-tag>
          </div>
          <t-empty v-if="!workspace.legacyCandidates.length && !workspace.scanning" :description="$t('workspace.noLegacy')" />
          <t-button variant="outline" :loading="workspace.scanning" @click="workspace.scanLegacy">
            {{ $t("workspace.rescanLegacy") }}
          </t-button>
        </div>

        <div class="targetBox">
          <div class="targetInfo">
            <div class="label">{{ $t("workspace.targetPath") }}</div>
            <div class="path">{{ workspace.validation?.targetPath || $t("workspace.notSelected") }}</div>
            <div v-if="workspace.validation" class="space">
              {{ $t("workspace.requiredSpace") }} {{ workspace.formatBytes(workspace.validation.requiredBytes) }}
              ·
              {{ $t("workspace.freeSpace") }} {{ workspace.formatBytes(workspace.validation.freeBytes) }}
            </div>
          </div>
          <t-button :loading="workspace.validating" @click="chooseTarget">
            {{ $t("workspace.selectTarget") }}
          </t-button>
        </div>

        <t-alert v-if="errorMessage" theme="error" :message="errorMessage" />

        <div class="actions">
          <t-button theme="primary" :loading="starting" :disabled="!canStart" @click="startMigration">
            {{ $t("workspace.startMigration") }}
          </t-button>
        </div>
      </template>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import useWorkspaceStore from "@/stores/workspace";
import settingStore from "@/stores/setting";

const workspace = useWorkspaceStore();
const { isElectron } = storeToRefs(settingStore());
const visible = computed(() => isElectron.value && workspace.selectionRequired);
const mode = ref<"migrate" | "empty">("migrate");
const selectedSourcePath = ref("");
const starting = ref(false);
const errorMessage = ref("");
const migrationTask = computed(() => workspace.migrationTask);
const healthyCandidates = computed(() => workspace.legacyCandidates.filter((item) => item.healthy));
const canStart = computed(() => Boolean(workspace.validation?.targetPath && (mode.value === "empty" || selectedSourcePath.value)));

watch(
  healthyCandidates,
  (list) => {
    if (!list.length) {
      mode.value = "empty";
      selectedSourcePath.value = "";
      return;
    }
    if (!selectedSourcePath.value) selectedSourcePath.value = list[0].path;
  },
  { immediate: true },
);

async function chooseTarget() {
  errorMessage.value = "";
  try {
    await workspace.chooseWorkspaceTarget();
  } catch (error: any) {
    errorMessage.value = error?.message || $t("workspace.validateFailed");
  }
}

async function startMigration() {
  if (!workspace.validation?.targetPath) return;
  starting.value = true;
  errorMessage.value = "";
  try {
    await workspace.startMigration({
      targetPath: workspace.validation.targetPath,
      sourcePath: mode.value === "migrate" ? selectedSourcePath.value : undefined,
    });
  } catch (error: any) {
    const blockers = error?.data || error?.response?.data?.data;
    const blockerCount = blockers?.count;
    errorMessage.value =
      blockerCount > 0 ? $t("workspace.activeTaskBlocker", { count: blockerCount }) : error?.message || $t("workspace.startFailed");
  } finally {
    starting.value = false;
  }
}

async function handleRestart() {
  try {
    await workspace.restart();
  } catch (error: any) {
    window.$message.error(error?.message || $t("workspace.restartFailed"));
  }
}
</script>

<style scoped lang="scss">
.wizard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.legacyList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
}

.candidate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  cursor: pointer;

  &.active {
    border-color: var(--td-brand-color);
    background: var(--td-brand-color-light);
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
}

.candidatePath,
.path {
  word-break: break-all;
  color: var(--td-text-color-primary);
}

.candidateMeta,
.candidateError,
.space,
.label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.candidateError {
  color: var(--td-error-color);
}

.targetBox {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
}

.targetInfo {
  min-width: 0;
}

.migrationState {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progressTop {
  display: flex;
  justify-content: space-between;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
