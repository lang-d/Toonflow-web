<template>
  <Teleport to="body">
    <div
      v-if="!collapsed"
      ref="floatingRef"
      class="taskFloating"
      :class="{ syncing, dialogOpen: dialogVisible }"
      :style="style"
      role="button"
      tabindex="0"
      :aria-expanded="dialogVisible"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="stopDragging"
      @pointercancel="stopDragging"
      @mousedown="onMouseDown"
      @click="openDialog"
      @keydown.enter.prevent="openDialog"
      @keydown.space.prevent="openDialog">
      <span class="taskIcon"><i-view-list /></span>
      <span class="taskSummary">
        <strong>{{ $t("workbench.globalTaskCenter.title") }}</strong>
        <small>
          {{ $t("workbench.globalTaskCenter.running") }} {{ activeTaskCount }}
          <template v-if="queuedCount"> · {{ $t("workbench.globalTaskCenter.queued") }} {{ queuedCount }}</template>
          <template v-if="snapshotWarningCount">
            · {{ $t("workbench.globalTaskCenter.needsConfirmation") }} {{ snapshotWarningCount }}
          </template>
        </small>
      </span>
      <span class="syncDot" :title="$t(syncing ? 'workbench.globalTaskCenter.syncing' : 'workbench.globalTaskCenter.synced')" />
      <button
        class="collapseButton"
        type="button"
        :title="$t('workbench.globalTaskCenter.collapse')"
        @pointerdown.stop
        @pointerup.stop
        @mousedown.stop
        @click.stop="collapse()">
        {{ collapseSide === "left" ? "<" : ">" }}
      </button>
    </div>
    <button
      v-else
      class="taskSideTab"
      :class="[collapseSide, { syncing, hasWarning: snapshotWarningCount }]"
      :style="sideStyle"
      type="button"
      :title="$t('workbench.globalTaskCenter.expand')"
      @click="expand">
      <span class="sideIcon"><i-view-list /></span>
      <strong>{{ activeTaskCount }}</strong>
      <small v-if="snapshotWarningCount">{{ snapshotWarningCount }}</small>
    </button>
    <TaskCenterDialog v-model:visible="dialogVisible" :syncing="syncing" @refresh="syncCurrentProject" />
  </Teleport>
</template>

<script setup lang="ts">
import useTaskCenterStore from "@/stores/taskCenter";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import TaskCenterDialog from "./TaskCenterDialog.vue";
import { useFloatingPosition } from "./useFloatingPosition";

const taskCenter = useTaskCenterStore();
const { project } = storeToRefs(projectStore());
const { apiReady } = storeToRefs(settingStore());
const { activeTaskCount, activeTasks, snapshotWarningCount } = storeToRefs(taskCenter);
const dialogVisible = ref(false);
const syncing = ref(false);
const floatingRef = ref<HTMLElement | null>(null);
const {
  style,
  sideStyle,
  collapsed,
  collapseSide,
  draggedRecently,
  collapse,
  expand,
  onPointerDown,
  onPointerMove,
  stopDragging,
  onMouseDown,
} = useFloatingPosition(floatingRef, "globalTaskCenterPosition");
const queuedCount = computed(() => activeTasks.value.filter((task) => task.status === "queued").length);
let syncRequestId = 0;

async function syncCurrentProject() {
  const projectId = Number(project.value?.id);
  if (!apiReady.value || !projectId) return;
  const requestId = ++syncRequestId;
  syncing.value = true;
  try {
    await taskCenter.syncProjectTasks(projectId);
  } catch (error) {
    if (requestId === syncRequestId && dialogVisible.value) {
      window.$message.error((error as any)?.message || $t("workbench.globalTaskCenter.syncFailed"));
    }
  } finally {
    if (requestId === syncRequestId) syncing.value = false;
  }
}

async function activateCurrentProject(projectId: number) {
  const requestId = ++syncRequestId;
  syncing.value = true;
  try {
    await taskCenter.activateProjectScope(projectId);
  } catch (error) {
    if (requestId === syncRequestId && dialogVisible.value) {
      window.$message.error((error as any)?.message || $t("workbench.globalTaskCenter.syncFailed"));
    }
  } finally {
    if (requestId === syncRequestId) syncing.value = false;
  }
}

function openDialog() {
  if (draggedRecently.value) return;
  dialogVisible.value = true;
  void syncCurrentProject();
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") void syncCurrentProject();
}

watch(
  [() => project.value?.id, apiReady],
  ([projectId, ready]) => {
    const nextProjectId = Number(projectId);
    if (ready && nextProjectId > 0) {
      void activateCurrentProject(nextProjectId);
      return;
    }
    syncRequestId++;
    syncing.value = false;
    taskCenter.deactivateProjectScope();
  },
  { immediate: true },
);

onMounted(() => document.addEventListener("visibilitychange", handleVisibilityChange));
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  taskCenter.deactivateProjectScope();
});
</script>

<style scoped lang="scss">
.taskFloating {
  position: fixed;
  z-index: 7600;
  width: 220px;
  height: 68px;
  display: grid;
  grid-template-columns: 38px 1fr 8px;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--td-bg-color-container) 96%, transparent);
  box-shadow: var(--td-shadow-2);
  color: var(--td-text-color-primary);
  cursor: grab;
  user-select: none;
  touch-action: none;
  text-align: left;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
  &:active {
    cursor: grabbing;
  }
  &:hover {
    border-color: var(--td-brand-color);
    box-shadow: var(--td-shadow-3);
  }
  &.dialogOpen {
    border-color: var(--td-brand-color);
  }
}
.taskIcon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-size: 21px;
}
.taskSummary {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    font-size: 13px;
  }
  small {
    color: var(--td-text-color-secondary);
    font-size: 11px;
  }
}
.syncDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--td-success-color);
}
.taskFloating.syncing .syncDot {
  background: var(--td-warning-color);
  animation: taskPulse 1s ease-in-out infinite;
}
.collapseButton {
  position: absolute;
  top: -9px;
  right: -9px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--td-component-border);
  border-radius: 50%;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary);
  box-shadow: var(--td-shadow-1);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  &:hover {
    color: var(--td-brand-color);
    border-color: var(--td-brand-color);
  }
}
.taskSideTab {
  position: fixed;
  z-index: 7600;
  width: 46px;
  min-height: 86px;
  display: grid;
  grid-template-rows: 24px 22px minmax(0, auto);
  place-items: center;
  gap: 4px;
  padding: 9px 6px;
  border: 1px solid var(--td-component-border);
  background: color-mix(in srgb, var(--td-bg-color-container) 97%, transparent);
  color: var(--td-text-color-primary);
  box-shadow: var(--td-shadow-2);
  cursor: pointer;
  &.left {
    border-left: 0;
    border-radius: 0 8px 8px 0;
  }
  &.right {
    border-right: 0;
    border-radius: 8px 0 0 8px;
  }
  &:hover {
    border-color: var(--td-brand-color);
    color: var(--td-brand-color);
    box-shadow: var(--td-shadow-3);
  }
  strong {
    font-size: 15px;
    line-height: 1;
  }
  small {
    min-width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--td-warning-color);
    color: var(--td-font-white-1);
    font-size: 11px;
    line-height: 1;
  }
}
.sideIcon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-size: 16px;
}
.taskSideTab.syncing .sideIcon {
  animation: taskPulse 1s ease-in-out infinite;
}
@keyframes taskPulse {
  50% {
    opacity: 0.35;
  }
}
</style>
