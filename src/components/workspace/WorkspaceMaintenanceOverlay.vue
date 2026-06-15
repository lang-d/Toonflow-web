<template>
  <teleport to="body">
    <div v-if="visible" class="workspaceOverlay" :class="{ blocking: restartRequired }">
      <div class="panel">
        <div class="title">{{ restartRequired ? $t("workspace.restartTitle") : $t("workspace.maintenanceTitle") }}</div>
        <p class="desc">
          {{ restartRequired ? $t("workspace.restartDesc") : $t("workspace.maintenanceDesc") }}
        </p>
        <div v-if="task" class="progressBox">
          <div class="progressTop">
            <span>{{ workspace.describeTaskPhase(task.phase) }}</span>
            <span>{{ Math.round(task.progress || 0) }}%</span>
          </div>
          <t-progress :percentage="Math.round(task.progress || 0)" />
          <t-alert v-if="task.status === 'failed'" theme="error" :message="task.reason || $t('workspace.operationFailed')" />
        </div>
        <div v-else class="statusGrid">
          <span>{{ $t("workspace.activeTaskCount") }}</span>
          <strong>{{ workspace.status?.activeTaskCount || 0 }}</strong>
        </div>
        <div class="actions">
          <t-button v-if="restartRequired" theme="primary" @click="handleRestart">
            {{ $t("workspace.restartNow") }}
          </t-button>
          <t-button variant="outline" @click="workspace.fetchStatus">
            {{ $t("workspace.refreshStatus") }}
          </t-button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import useWorkspaceStore from "@/stores/workspace";
import settingStore from "@/stores/setting";

const workspace = useWorkspaceStore();
const { isElectron } = storeToRefs(settingStore());
const visible = computed(() => isElectron.value && workspace.maintenanceBlocking);
const restartRequired = computed(() => workspace.restartRequired);
const task = computed(() => workspace.migrationTask);

async function handleRestart() {
  try {
    await workspace.restart();
  } catch (error: any) {
    window.$message.error(error?.message || $t("workspace.restartFailed"));
  }
}
</script>

<style scoped lang="scss">
.workspaceOverlay {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 5000;
  pointer-events: none;

  &.blocking {
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(16, 24, 40, 0.58);
    backdrop-filter: blur(4px);
    pointer-events: auto;
  }

  &:not(.blocking) .panel {
    width: min(420px, calc(100vw - 32px));
    padding: 18px;
  }
}

.panel {
  width: min(520px, calc(100vw - 48px));
  padding: 28px;
  border-radius: 10px;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-4);
  pointer-events: auto;
}

.title {
  font-size: 20px;
  font-weight: 700;
  color: var(--td-text-color-primary);
}

.desc {
  margin: 10px 0 18px;
  color: var(--td-text-color-secondary);
  line-height: 1.7;
}

.progressBox {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progressTop,
.statusGrid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--td-text-color-secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>
