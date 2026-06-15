import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import useTaskCenterStore, { createTaskKey, type RuntimeTask } from "@/stores/taskCenter";
import type {
  LegacyStorageCandidate,
  PortableImportResult,
  StorageStatus,
  WorkspaceOperation,
  WorkspaceOperationKind,
  WorkspaceTargetValidation,
} from "@/types/workspace";
import { openDirectory, restartApplication, selectDirectory } from "@/utils/electronProtocol";
import { formatBytes } from "@/utils/formatBytes";

const ACTIVE_STATUSES = new Set(["queued", "submitting", "processing"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function targetTypeForKind(kind: WorkspaceOperationKind) {
  if (kind === "migration") return "storage-migration";
  if (kind === "project-snapshot") return "project-snapshot";
  return "project-import";
}

function operationProjectId(kind: WorkspaceOperationKind, projectId?: number) {
  return kind === "project-snapshot" ? Number(projectId || 0) : 0;
}

export default defineStore(
  "workspace",
  () => {
    const status = ref<StorageStatus | null>(null);
    const legacyCandidates = ref<LegacyStorageCandidate[]>([]);
    const validation = ref<WorkspaceTargetValidation | null>(null);
    const activeOperation = ref<WorkspaceOperation | null>(null);
    const snapshotOperations = ref<Record<string, WorkspaceOperation>>({});
    const taskRuntime = ref<Record<string, RuntimeTask>>({});
    const loading = ref(false);
    const scanning = ref(false);
    const validating = ref(false);
    const initialized = ref(false);
    const statusError = ref("");

    const releases = new Map<string, () => void>();

    const migrationTask = computed(() => {
      const op = activeOperation.value?.kind === "migration" ? activeOperation.value : null;
      return op ? taskRuntime.value[op.taskId] : undefined;
    });
    const currentOperationTask = computed(() => {
      const op = activeOperation.value;
      return op ? taskRuntime.value[op.taskId] : undefined;
    });
    const selectionRequired = computed(() => Boolean(status.value?.selectionRequired));
    const restartRequired = computed(() =>
      Boolean(status.value?.restartRequired || (activeOperation.value?.kind === "migration" && migrationTask.value?.status === "completed")),
    );
    const migrationActive = computed(() => {
      const taskStatus = migrationTask.value?.status;
      return Boolean(activeOperation.value?.kind === "migration" && taskStatus && ACTIVE_STATUSES.has(taskStatus));
    });
    const maintenanceBlocking = computed(() =>
      Boolean(!selectionRequired.value && (status.value?.maintenance || migrationActive.value || restartRequired.value)),
    );
    const legacyMode = computed(() => status.value?.mode === "legacy");

    async function fetchStatus() {
      const response = await axios.post("/setting/storage/status", {}, { suppressNetworkErrorNotify: true } as any);
      status.value = (response as any).data;
      statusError.value = "";
      return status.value;
    }

    async function scanLegacy() {
      scanning.value = true;
      try {
        const response = await axios.post("/setting/storage/scanLegacy");
        legacyCandidates.value = Array.isArray((response as any).data) ? (response as any).data : [];
        return legacyCandidates.value;
      } finally {
        scanning.value = false;
      }
    }

    async function validateTarget(targetPath: string) {
      validating.value = true;
      try {
        const response = await axios.post("/setting/storage/validateTarget", { targetPath });
        validation.value = (response as any).data;
        return validation.value;
      } finally {
        validating.value = false;
      }
    }

    async function chooseWorkspaceTarget() {
      const result = await selectDirectory("workspace");
      if (!result.ok || !result.path) return null;
      return validateTarget(result.path);
    }

    function registerWorkspaceTask(operation: WorkspaceOperation) {
      const taskCenter = useTaskCenterStore();
      taskCenter.setTransport("auto");
      releases.get(operation.taskId)?.();
      const targetId = operation.kind === "project-snapshot" ? operation.projectId : operation.taskId;
      const projectId = operationProjectId(operation.kind, operation.projectId);
      const key = createTaskKey("media", projectId, targetId, undefined, operation.taskId);
      const release = taskCenter.registerTask(
        {
          key,
          domain: "media",
          unifiedTaskId: operation.taskId,
          taskId: operation.taskId,
          projectId,
          targetType: targetTypeForKind(operation.kind),
          targetId,
          status: "queued",
          source: "submit",
        },
        (task) => handleTaskUpdate(operation, task),
      );
      releases.set(operation.taskId, release);
    }

    async function handleTaskUpdate(operation: WorkspaceOperation, task: RuntimeTask) {
      taskRuntime.value = { ...taskRuntime.value, [operation.taskId]: task };
      if (!TERMINAL_STATUSES.has(task.status)) return;
      releases.get(operation.taskId)?.();
      releases.delete(operation.taskId);
      if (operation.kind === "migration") {
        await fetchStatus().catch(() => {});
      }
      if (operation.kind === "project-import" && task.status === "completed") {
        await projectStore().fetchProjects().catch(() => {});
      }
    }

    function rememberOperation(operation: WorkspaceOperation) {
      if (operation.kind === "project-snapshot") {
        snapshotOperations.value = {
          ...snapshotOperations.value,
          [String(operation.projectId)]: operation,
        };
      } else {
        activeOperation.value = operation;
      }
      registerWorkspaceTask(operation);
    }

    function restoreOperations() {
      if (activeOperation.value) registerWorkspaceTask(activeOperation.value);
      Object.values(snapshotOperations.value).forEach(registerWorkspaceTask);
    }

    async function initialize(force = false) {
      if (initialized.value && !force) return status.value;
      loading.value = true;
      try {
        const nextStatus = await fetchStatus();
        initialized.value = true;
        restoreOperations();
        if (nextStatus?.selectionRequired) {
          await scanLegacy().catch(() => {
            legacyCandidates.value = [];
          });
        }
        return nextStatus;
      } catch (error: any) {
        statusError.value = error?.message || $t("workspace.statusFailed");
        throw error;
      } finally {
        loading.value = false;
      }
    }

    async function startMigration(input: { targetPath: string; sourcePath?: string }) {
      const response = await axios.post("/setting/storage/startMigration", input);
      const data = (response as any).data || {};
      const operation: WorkspaceOperation = {
        kind: "migration",
        taskId: data.taskId,
        projectId: 0,
        sourcePath: input.sourcePath,
        targetPath: input.targetPath,
        createdAt: Date.now(),
      };
      rememberOperation(operation);
      await fetchStatus().catch(() => {});
      return operation;
    }

    async function prepareProjectCopy(projectId: number) {
      const response = await axios.post("/project/preparePortableCopy", { projectId });
      const data = (response as any).data || {};
      const operation: WorkspaceOperation = {
        kind: "project-snapshot",
        taskId: data.taskId,
        projectId,
        directory: data.directory,
        createdAt: Date.now(),
      };
      rememberOperation(operation);
      return operation;
    }

    async function importPortableProject(sourceDirectory: string) {
      const response = await axios.post("/project/importPortableProject", { sourceDirectory });
      const data = (response as any).data || {};
      const operation: WorkspaceOperation = {
        kind: "project-import",
        taskId: data.taskId,
        projectId: 0,
        directory: sourceDirectory,
        createdAt: Date.now(),
      };
      rememberOperation(operation);
      return operation;
    }

    async function chooseAndImportProject() {
      const result = await selectDirectory("projectImport");
      if (!result.ok || !result.path) return null;
      return importPortableProject(result.path);
    }

    function getSnapshotRuntime(projectId: number) {
      const operation = snapshotOperations.value[String(projectId)];
      return operation ? { operation, task: taskRuntime.value[operation.taskId] } : null;
    }

    function clearSnapshotOperation(projectId: number) {
      const key = String(projectId);
      const operation = snapshotOperations.value[key];
      if (operation) {
        releases.get(operation.taskId)?.();
        releases.delete(operation.taskId);
      }
      const next = { ...snapshotOperations.value };
      delete next[key];
      snapshotOperations.value = next;
    }

    function clearActiveOperation() {
      const operation = activeOperation.value;
      if (operation) {
        releases.get(operation.taskId)?.();
        releases.delete(operation.taskId);
      }
      activeOperation.value = null;
    }

    async function openWorkspaceDirectory() {
      if (!status.value?.workspacePath) return;
      await openDirectory(status.value.workspacePath);
    }

    async function openProjectSnapshotDirectory(projectId: number) {
      const operation = snapshotOperations.value[String(projectId)];
      if (!operation?.directory) return;
      await openDirectory(operation.directory);
    }

    async function restart() {
      await restartApplication();
    }

    function describeTaskPhase(phase?: string) {
      const map: Record<string, string> = {
        backup: $t("workspace.phase.backup"),
        "split-database": $t("workspace.phase.splitDatabase"),
        "copy-media": $t("workspace.phase.copyMedia"),
        "project-snapshots": $t("workspace.phase.projectSnapshots"),
        activate: $t("workspace.phase.activate"),
        "restart-required": $t("workspace.phase.restartRequired"),
        completed: $t("workspace.phase.completed"),
        failed: $t("workspace.phase.failed"),
      };
      return phase ? map[phase] || phase : $t("workspace.phase.queued");
    }

    return {
      status,
      legacyCandidates,
      validation,
      activeOperation,
      snapshotOperations,
      taskRuntime,
      loading,
      scanning,
      validating,
      initialized,
      statusError,
      migrationTask,
      currentOperationTask,
      selectionRequired,
      restartRequired,
      migrationActive,
      maintenanceBlocking,
      legacyMode,
      fetchStatus,
      scanLegacy,
      validateTarget,
      chooseWorkspaceTarget,
      initialize,
      startMigration,
      prepareProjectCopy,
      importPortableProject,
      chooseAndImportProject,
      getSnapshotRuntime,
      clearSnapshotOperation,
      clearActiveOperation,
      openWorkspaceDirectory,
      openProjectSnapshotDirectory,
      restart,
      describeTaskPhase,
      formatBytes,
    };
  },
  {
    persist: {
      pick: ["activeOperation", "snapshotOperations"],
    },
  },
);
