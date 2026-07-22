<template>
  <div class="project">
    <div class="header">
      <div class="fc">
        <span class="title">{{ $t("workbench.project.title") }}</span>
        <span class="sub">{{ $t("workbench.project.subtitle") }}</span>
      </div>
      <div class="headerActions">
        <t-button variant="outline" :disabled="!isElectron || workspace.maintenanceBlocking" :loading="importingProject" @click="handleImportProject">
          {{ $t("workspace.importProject") }}
        </t-button>
        <t-button
          class="addBtn"
          @click="
            editProjectData = null;
            dialogShow = true;
          ">
          <template #icon><i-plus class="addIcon" :size="20" /></template>
          {{ $t("workbench.project.newProject") }}
        </t-button>
      </div>
    </div>
    <t-alert v-if="isElectron && workspace.legacyMode" class="legacyTip" theme="warning" :message="$t('workspace.legacyModeTip')">
      <template #operation>
        <t-button variant="text" @click="openWorkspaceSettings">{{ $t("workspace.openSettings") }}</t-button>
      </template>
    </t-alert>
    <div class="list">
      <t-card
        hoverShadow
        class="card"
        :class="{ opening: openingProjectId === project.id }"
        v-for="project in allProject"
        :key="project.id"
        @click="openProject(project.id)">
        <div class="jb ac">
          <div class="title">
            {{ project.name }}
          </div>
          <div>
            <t-tag shape="round">
              {{ project.projectType == "novel" ? $t(`workbench.project.type.novel`) : $t(`workbench.project.type.script`) }}
            </t-tag>
          </div>
        </div>
        <t-tag shape="round" v-if="project.artStyle" style="align-self: flex-start">{{ project.artStyle }}</t-tag>
        <div class="intro">
          {{ project.intro }}
        </div>
        <div class="bottomMenu f ac jb">
          <div class="time">
            <span>{{ dayjs(project?.createTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
          </div>
          <div class="actionBtns f ac">
            <t-tooltip :content="snapshotLabel(project.id)" destroyOnClose :showArrow="false">
              <div class="copyBtn" @click.stop="handleProjectCopy(project.id)">
                <t-loading v-if="isSnapshotRunning(project.id)" size="small" />
                <i-download v-else :size="18" />
              </div>
            </t-tooltip>
            <div class="editBtn" @click.stop="openEdit(project)">
              <i-edit :size="18" />
            </div>
            <div class="removeBtn" @click.stop="delProjcer(project.id)">
              <i-delete :size="18" />
            </div>
          </div>
        </div>
        <div v-if="openingProjectId === project.id" class="openingState">
          <t-loading size="small" text="正在打开项目" />
        </div>
      </t-card>
    </div>
  </div>
  <projectDialog v-model="dialogShow" :projectData="editProjectData" @add="addProjectFn" @edit="editProjectFn" />
</template>

<script setup lang="ts">
import projectDialog from "./components/projectDialog.vue";
import dayjs from "dayjs";
import axios from "@/utils/axios";
import projectStore, { type Project } from "@/stores/project";
import imageListCacheStore from "@/stores/imageListCache";
import { handleDynamicImportFailure } from "@/utils/moduleRecovery";
import useWorkspaceStore from "@/stores/workspace";
import settingStore from "@/stores/setting";
import { disposeProductionAgentStore } from "@/stores/productionAgent";
import { useMusicProductionAgentStore } from "@/stores/musicProductionAgent";

const { clearProjectCache } = imageListCacheStore();
const projectState = projectStore();
const { allProject, project } = storeToRefs(projectState);
const workspace = useWorkspaceStore();
const musicProductionAgent = useMusicProductionAgentStore();
const { showSetting, activeMenu, isElectron } = storeToRefs(settingStore());

const dialogShow = ref(false);
const openingProjectId = ref<string | null>(null);
const importingProject = ref(false);
const editProjectData = ref<{
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  videoRatio: string | null;
  imageModel: string;
  videoModel: string;
  projectType: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
  directorManual: string;
} | null>(null);

async function getAllProject() {
  await projectState.fetchProjects();
}

onMounted(() => {
  disposeProductionAgentStore(project.value?.id);
  musicProductionAgent.dispose(Number(project.value?.id));
  project.value = null;
  getAllProject();
});

const router = useRouter();

async function openProject(projectId: string | undefined) {
  logProjectNavigation("click", { projectId });
  if (!projectId || openingProjectId.value) return;
  if (isElectron.value && workspace.selectionRequired) {
    logProjectNavigation("blocked", { projectId, reason: "workspace-selection-required" });
    window.$message.warning($t("workspace.maintenanceNavigationBlocked"));
    return;
  }
  const item = allProject.value.find((p) => p.id === projectId);

  if (!item) {
    logProjectNavigation("blocked", { projectId, reason: "project-not-found" });
    return window.$message.error($t("workbench.project.msg.notFound"));
  }

  openingProjectId.value = projectId;
  if (project.value?.id && project.value.id !== projectId) {
    disposeProductionAgentStore(project.value.id);
    musicProductionAgent.dispose(Number(project.value.id));
  }
  project.value = item;
  const target = getProjectEntryRoute(item);
  logProjectNavigation("push", { projectId, target });

  try {
    await router.push(target);
    logProjectNavigation("pushed", { projectId, target });
    void validateProjectModels(item);
  } catch (error) {
    logProjectNavigation("failed", { projectId, target, error });
    if (!handleDynamicImportFailure(error, target)) {
      window.$message.error((error as Error)?.message || "项目页面加载失败");
    }
  } finally {
    openingProjectId.value = null;
  }
}

function getProjectEntryRoute(item: Pick<Project, "projectType" | "type">) {
  const rawType = String(item.projectType || item.type || "").toLowerCase();
  if (rawType === "novel" || rawType.includes("\u539f\u6587") || rawType.includes("\u5c0f\u8bf4")) return "/novel";
  if (rawType === "novel" || rawType.includes("原文") || rawType.includes("novel")) return "/novel";
  return "/script";
}

function logProjectNavigation(step: string, detail: Record<string, unknown> = {}) {
  if (!import.meta.env.DEV) return;
  console.info("[project-navigation]", step, {
    ...detail,
    isElectron: isElectron.value,
    selectionRequired: workspace.selectionRequired,
    maintenanceBlocking: workspace.maintenanceBlocking,
    restartRequired: workspace.restartRequired,
    migrationActive: workspace.migrationActive,
    workspaceMaintenance: Boolean(workspace.status?.maintenance),
    activeProjectId: project.value?.id,
  });
}

async function validateProjectModels(item: {
  imageModel: string;
  videoModel: string;
}) {
  if (!item.imageModel || !item.videoModel) {
    window.$message.warning($t("workbench.project.msg.modelProviderDisabled"));
    return;
  }
  const checks = [item.imageModel, item.videoModel].map((modelId) => axios.post("/modelSelect/getModelDetail", { modelId }));
  const results = await Promise.allSettled(checks);
  if (results.some((result) => result.status === "rejected")) {
    window.$message.warning($t("workbench.project.msg.modelProviderDisabled"));
  }
}

function openWorkspaceSettings() {
  activeMenu.value = "workspace";
  showSetting.value = true;
}

function snapshotRuntime(projectId: string | undefined) {
  return projectId ? workspace.getSnapshotRuntime(Number(projectId)) : null;
}

function isSnapshotRunning(projectId: string | undefined) {
  const task = snapshotRuntime(projectId)?.task;
  return task ? ["queued", "submitting", "processing"].includes(task.status) : false;
}

function snapshotLabel(projectId: string | undefined) {
  const runtime = snapshotRuntime(projectId);
  if (!runtime?.task) return $t("workspace.prepareProjectCopy");
  if (runtime.task.status === "completed") return $t("workspace.openPreparedProject");
  if (runtime.task.status === "failed") return $t("workspace.prepareFailedRetry");
  return `${$t("workspace.preparingProject")} ${Math.round(runtime.task.progress || 0)}%`;
}

async function handleProjectCopy(projectId: string | undefined) {
  if (!projectId) return;
  if (!isElectron.value) {
    window.$message.warning($t("workspace.desktopOnly"));
    return;
  }
  const runtime = snapshotRuntime(projectId);
  if (runtime?.task?.status === "completed" && runtime.operation.directory) {
    try {
      await workspace.openProjectSnapshotDirectory(Number(projectId));
    } catch (error: any) {
      window.$message.error(error?.message || $t("workspace.openDirectoryFailed"));
    }
    return;
  }
  if (isSnapshotRunning(projectId)) return;
  try {
    await workspace.prepareProjectCopy(Number(projectId));
    window.$message.success($t("workspace.projectCopyStarted"));
  } catch (error: any) {
    window.$message.error(error?.message || $t("workspace.projectCopyFailed"));
  }
}

async function handleImportProject() {
  if (!isElectron.value) {
    window.$message.warning($t("workspace.desktopOnly"));
    return;
  }
  importingProject.value = true;
  try {
    const operation = await workspace.chooseAndImportProject();
    if (operation) window.$message.success($t("workspace.importStarted"));
  } catch (error: any) {
    window.$message.error(error?.message || $t("workspace.importFailed"));
  } finally {
    importingProject.value = false;
  }
}

function openEdit(item: {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  directorManual: string;
  videoRatio: string | null;
  imageModel: string;
  videoModel: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  projectType: string;
  mode: string;
}) {
  editProjectData.value = {
    ...item,
  };
  dialogShow.value = true;
}

function editProjectFn(data: {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
}) {
  axios
    .post("/project/editProject", data)
    .then(() => {
      window.$message.success($t("workbench.project.msg.editSuccess"));
      getAllProject();
    })
    .catch((e) => {
      window.$message.error(e.message ?? $t("workbench.project.msg.editFailed"));
    });
}

function addProjectFn(data: {
  projectType: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  imageQuality: string;
  mode: string;
}) {
  axios
    .post("/project/addProject", data)
    .then(() => {
      window.$message.success($t("workbench.project.msg.addSuccess"));
      getAllProject();
    })
    .catch((e) => {
      window.$message.error(e.message ?? $t("workbench.project.msg.addFailed"));
    });
}

function delProjcer(projectId: string | undefined) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.project.msg.deleteHeader"),
    body: $t("workbench.project.msg.deleteBody"),
    confirmBtn: $t("workbench.project.msg.deleteConfirm"),
    cancelBtn: $t("workbench.project.msg.deleteCancel"),
    onConfirm: () => {
      axios
        .post("/project/delProject", { id: projectId })
        .then(() => {
          disposeProductionAgentStore(projectId);
          musicProductionAgent.dispose(Number(projectId));
          clearProjectCache(projectId!);
          window.$message.success($t("workbench.project.msg.deleteSuccess"));
          getAllProject();
        })
        .catch((e) => {
          window.$message.error(e.message ?? $t("workbench.project.msg.deleteFailed"));
        })
        .finally(() => {
          dialog.destroy();
        });
    },
  });
}
</script>

<style lang="scss" scoped>
.project {
  .header {
    padding-top: 32px;
    margin-bottom: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .title {
      font-size: 32px;
      font-weight: 600;
      color: var(--td-text-color-primary);
    }
    .sub {
      opacity: 0.5;
      color: var(--td-text-color-secondary);
    }
  }
  .headerActions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .legacyTip {
    margin-bottom: 18px;
  }
  .list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    .card {
      position: relative;
      width: 100%;
      height: 100%;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      .title {
        font-size: 20px;
        font-weight: bold;
        margin-bottom: 8px;
      }
      .intro {
        height: 100%;
        margin-top: 5px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bottomMenu {
        margin-top: 32px;
        .time {
          opacity: 0.5;
        }
        .actionBtns {
          gap: 12px;
        }
        .copyBtn {
          cursor: pointer;
          &:hover {
            color: var(--td-brand-color);
          }
        }
        .editBtn {
          cursor: pointer;
          &:hover {
            color: var(--td-brand-color);
          }
        }
        .removeBtn {
          cursor: pointer;
          &:hover {
            color: red;
          }
        }
      }
      &.opening {
        pointer-events: none;
      }
      .openingState {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--td-bg-color-container) 82%, transparent);
      }
    }
  }
}
:deep(.t-col) {
  height: auto !important;
}
:deep(.t-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
}
</style>
