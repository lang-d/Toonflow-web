<template>
  <div class="workspaceConfig">
    <t-alert v-if="workspace.legacyMode" theme="warning" :message="$t('workspace.legacyModeTip')" />
    <t-alert v-if="workspace.restartRequired" theme="success" :message="$t('workspace.restartDesc')" />
    <t-alert v-if="workspace.statusError" theme="error" :message="workspace.statusError" />

    <t-card :title="$t('workspace.currentWorkspace')" bordered>
      <div class="statusGrid">
        <div>
          <span>{{ $t("workspace.mode") }}</span>
          <strong>{{ workspace.status?.mode || "-" }}</strong>
        </div>
        <div>
          <span>{{ $t("workspace.projectTotal") }}</span>
          <strong>{{ workspace.status?.projectCount || 0 }}</strong>
        </div>
        <div>
          <span>{{ $t("workspace.fileTotal") }}</span>
          <strong>{{ workspace.status?.totalFiles || 0 }}</strong>
        </div>
        <div>
          <span>{{ $t("workspace.usedSpace") }}</span>
          <strong>{{ workspace.formatBytes(workspace.status?.totalBytes) }}</strong>
        </div>
      </div>
      <div class="pathLine">{{ workspace.status?.workspacePath || "-" }}</div>
      <div class="actions">
        <t-button variant="outline" :disabled="!isElectron || !workspace.status?.workspacePath" @click="openWorkspace">
          {{ $t("workspace.openWorkspace") }}
        </t-button>
        <t-button variant="outline" :loading="workspace.loading" @click="workspace.initialize(true)">
          {{ $t("workspace.refreshStatus") }}
        </t-button>
      </div>
    </t-card>

    <t-card :title="$t('workspace.migration')" bordered>
      <p class="desc">{{ $t("workspace.migrationDesc") }}</p>
      <div v-if="workspace.currentOperationTask" class="taskBox">
        <div class="progressTop">
          <span>{{ workspace.describeTaskPhase(workspace.currentOperationTask.phase) }}</span>
          <span>{{ Math.round(workspace.currentOperationTask.progress || 0) }}%</span>
        </div>
        <t-progress :percentage="Math.round(workspace.currentOperationTask.progress || 0)" />
        <t-alert
          v-if="workspace.currentOperationTask.status === 'failed'"
          theme="error"
          :message="workspace.currentOperationTask.reason || $t('workspace.operationFailed')" />
      </div>
      <div v-if="validation" class="validationBox">
        <span>{{ validation.targetPath }}</span>
        <span>{{ $t("workspace.requiredSpace") }} {{ workspace.formatBytes(validation.requiredBytes) }}</span>
        <span>{{ $t("workspace.freeSpace") }} {{ workspace.formatBytes(validation.freeBytes) }}</span>
      </div>
      <div class="actions">
        <t-button :disabled="!isElectron || workspace.maintenanceBlocking" :loading="workspace.validating" @click="chooseTarget">
          {{ $t("workspace.selectTarget") }}
        </t-button>
        <t-button theme="primary" :disabled="!validation || workspace.maintenanceBlocking" :loading="startingMigration" @click="startMigration">
          {{ $t("workspace.startMigration") }}
        </t-button>
        <t-button v-if="workspace.restartRequired" theme="success" @click="workspace.restart">
          {{ $t("workspace.restartNow") }}
        </t-button>
      </div>
    </t-card>

    <t-card :title="$t('workspace.importProject')" bordered>
      <p class="desc">{{ $t("workspace.importProjectDesc") }}</p>
      <t-alert v-if="importWarnings.length" theme="warning">
        <template #message>
          <div v-for="warning in importWarnings" :key="warning">{{ warning }}</div>
        </template>
      </t-alert>
      <div class="actions">
        <t-button :disabled="!isElectron || workspace.maintenanceBlocking" :loading="importing" @click="importProject">
          {{ $t("workspace.importProject") }}
        </t-button>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import useWorkspaceStore from "@/stores/workspace";
import settingStore from "@/stores/setting";

const workspace = useWorkspaceStore();
const { isElectron } = storeToRefs(settingStore());
const validation = computed(() => workspace.validation);
const startingMigration = ref(false);
const importing = ref(false);
const importWarnings = computed(() => {
  const result = workspace.currentOperationTask?.result as any;
  return Array.isArray(result?.warnings) ? result.warnings : [];
});

onMounted(() => {
  void workspace.initialize(true).catch(() => {});
});

async function openWorkspace() {
  try {
    await workspace.openWorkspaceDirectory();
  } catch (error: any) {
    window.$message.error(error?.message || $t("workspace.openDirectoryFailed"));
  }
}

async function chooseTarget() {
  try {
    await workspace.chooseWorkspaceTarget();
  } catch (error: any) {
    window.$message.error(error?.message || $t("workspace.validateFailed"));
  }
}

async function startMigration() {
  if (!workspace.validation?.targetPath) return;
  startingMigration.value = true;
  try {
    await workspace.startMigration({ targetPath: workspace.validation.targetPath });
  } catch (error: any) {
    const blockers = error?.data || error?.response?.data?.data;
    window.$message.error(blockers?.count ? $t("workspace.activeTaskBlocker", { count: blockers.count }) : error?.message || $t("workspace.startFailed"));
  } finally {
    startingMigration.value = false;
  }
}

async function importProject() {
  importing.value = true;
  try {
    const operation = await workspace.chooseAndImportProject();
    if (operation) window.$message.success($t("workspace.importStarted"));
  } catch (error: any) {
    window.$message.error(error?.message || $t("workspace.importFailed"));
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped lang="scss">
.workspaceConfig {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 0;
}

.statusGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  div {
    padding: 12px;
    border-radius: 6px;
    background: var(--td-bg-color-page);
  }

  span {
    display: block;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }

  strong {
    display: block;
    margin-top: 6px;
    color: var(--td-text-color-primary);
  }
}

.pathLine,
.validationBox {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--td-bg-color-page);
  color: var(--td-text-color-secondary);
  word-break: break-all;
}

.validationBox {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.desc {
  margin: 0 0 12px;
  color: var(--td-text-color-secondary);
}

.taskBox {
  margin-bottom: 12px;
}

.progressTop {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}
</style>
