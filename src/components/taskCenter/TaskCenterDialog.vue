<template>
  <t-dialog
    v-model:visible="visible"
    :header="$t('workbench.globalTaskCenter.title')"
    width="760px"
    :footer="false"
    attach="body">
    <div class="taskDialog">
      <div class="taskToolbar">
        <t-radio-group v-model="scope" variant="default-filled" size="small">
          <t-radio-button value="project">{{ $t("workbench.globalTaskCenter.currentProject") }}</t-radio-button>
          <t-radio-button value="all">{{ $t("workbench.globalTaskCenter.allKnown") }}</t-radio-button>
        </t-radio-group>
        <t-button variant="outline" size="small" :loading="syncing" @click="emit('refresh')">
          <template #icon><i-refresh /></template>
          {{ $t("workbench.globalTaskCenter.refresh") }}
        </t-button>
      </div>

      <div v-if="displayTasks.length" class="taskList">
        <div v-for="task in displayTasks" :key="task.key" class="taskRow">
          <div class="taskIdentity">
            <strong>{{ $t(getTaskDomainKey(task.domain)) }}</strong>
            <span>{{ getTaskTargetLabel(task) }}</span>
            <span v-if="hasSnapshotWarning(task)" class="snapshotWarning">
              <i-error-circle />
              {{ $t("workbench.globalTaskCenter.snapshotMissing") }}
            </span>
          </div>
          <div class="taskMeta">
            <t-tag size="small" variant="light" :theme="getTaskStatusTheme(task.status)">
              {{ $t(getTaskStatusKey(task.status)) }}
            </t-tag>
            <span v-if="task.scriptId">{{ $t("workbench.globalTaskCenter.episode") }} {{ task.scriptId }}</span>
            <span v-if="task.phase">{{ task.phase }}</span>
            <span v-if="task.progress != null">{{ Math.round(task.progress) }}%</span>
          </div>
          <div class="taskTime">{{ formatTime(task.updatedAt) }}</div>
          <div class="taskActions">
            <t-button
              v-if="hasSnapshotWarning(task)"
              size="small"
              variant="outline"
              :loading="resyncingKeys.has(task.key)"
              @click="resync(task)">
              {{ $t("workbench.globalTaskCenter.resync") }}
            </t-button>
            <t-button
              v-if="canCancel(task)"
              size="small"
              theme="danger"
              variant="outline"
              :loading="cancellingKeys.has(task.key)"
              @click="cancel(task)">
              {{ $t("workbench.globalTaskCenter.cancelQueue") }}
            </t-button>
          </div>
        </div>
      </div>
      <div v-else class="emptyTasks">
        <i-inbox size="42" />
        <span>{{ $t("workbench.globalTaskCenter.empty") }}</span>
      </div>

      <div v-if="showDiagnostics" class="diagnostics">
        <span>transport {{ activeTransport }}</span>
        <span>requests {{ inFlightRequests }}</span>
        <span>polls {{ totalPollCount }}</span>
        <span>listeners {{ registeredListenerCount }}</span>
        <span>long task {{ lastLongTask }}ms</span>
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import type { RuntimeTask } from "@/stores/taskCenter";
import useTaskCenterStore from "@/stores/taskCenter";
import projectStore from "@/stores/project";
import { getTaskDomainKey, getTaskStatusKey, getTaskStatusTheme, getTaskTargetLabel } from "./taskDisplay";

const visible = defineModel<boolean>("visible", { default: false });
const props = defineProps<{ syncing?: boolean }>();
const emit = defineEmits<{ refresh: [] }>();
const taskCenter = useTaskCenterStore();
const { project } = storeToRefs(projectStore());
const {
  activeTasks,
  snapshotWarnings,
  activeTransport,
  inFlightRequests,
  pollCount,
  registeredListenerCount,
  lastLongTask,
} = storeToRefs(taskCenter);
const scope = ref<"project" | "all">("project");
const cancellingKeys = reactive(new Set<string>());
const resyncingKeys = reactive(new Set<string>());
const showDiagnostics = import.meta.env.DEV;
const totalPollCount = computed(() => Object.values(pollCount.value).reduce((sum, count) => sum + count, 0));
const displayTasks = computed(() => {
  const projectId = Number(project.value?.id);
  return activeTasks.value
    .filter((task) => scope.value === "all" || (projectId && task.projectId === projectId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
});

function canCancel(task: RuntimeTask) {
  return task.status === "queued" && Boolean(task.unifiedTaskId);
}

function hasSnapshotWarning(task: RuntimeTask) {
  return snapshotWarnings.value.has(task.key);
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function cancel(task: RuntimeTask) {
  if (!canCancel(task) || cancellingKeys.has(task.key)) return;
  cancellingKeys.add(task.key);
  try {
    await taskCenter.cancelTask(task.key);
    window.$message.success($t("workbench.globalTaskCenter.cancelSuccess"));
  } catch (error) {
    window.$message.error((error as any)?.message || $t("workbench.globalTaskCenter.cancelFailed"));
  } finally {
    cancellingKeys.delete(task.key);
  }
}

async function resync(task: RuntimeTask) {
  if (!hasSnapshotWarning(task) || resyncingKeys.has(task.key)) return;
  resyncingKeys.add(task.key);
  try {
    await taskCenter.resyncTask(task.key);
    if (hasSnapshotWarning(task)) {
      window.$message.warning($t("workbench.globalTaskCenter.stillMissing"));
    } else {
      window.$message.success($t("workbench.globalTaskCenter.resyncSuccess"));
    }
  } catch (error) {
    window.$message.error((error as any)?.message || $t("workbench.globalTaskCenter.syncFailed"));
  } finally {
    resyncingKeys.delete(task.key);
  }
}
</script>

<style scoped lang="scss">
.taskDialog {
  min-height: 280px;
}
.taskToolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.taskList {
  max-height: min(58vh, 520px);
  overflow: auto;
  border-top: 1px solid var(--td-component-border);
}
.emptyTasks {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--td-text-color-placeholder);
}
.taskRow {
  display: grid;
  grid-template-columns: minmax(170px, 1.2fr) minmax(210px, 1.6fr) 90px auto;
  gap: 12px;
  align-items: center;
  min-height: 64px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--td-component-border);
}
.taskIdentity {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  span {
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
  .snapshotWarning {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--td-warning-color);
    white-space: normal;
  }
}
.taskMeta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
.taskTime {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  white-space: nowrap;
}
.taskActions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
.diagnostics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed var(--td-component-border);
  color: var(--td-text-color-placeholder);
  font-family: monospace;
  font-size: 11px;
}
@media (max-width: 720px) {
  .taskRow {
    grid-template-columns: 1fr auto;
  }
  .taskMeta,
  .taskTime {
    grid-column: 1 / -1;
  }
}
</style>
