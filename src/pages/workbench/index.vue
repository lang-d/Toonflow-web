<template>
  <div class="main" :style="{ height: isElectron ? 'calc(100vh - 32px)' : '100vh' }">
    <div class="menu fc jb">
      <div class="logoBox c">
        <div class="logo"></div>
      </div>
      <div class="itemBox fc ac">
        <t-tooltip
          :content="getMenuLabel(menu)"
          placement="right"
          destroyOnClose
          :showArrow="false"
          v-for="(menu, index) in menuList"
          :key="index">
          <div class="item fc c" v-if="menu.type === 'btn'" :class="{ active: activeMenu == menu.path }" @click="handleClick(menu)">
            <component :is="menu.icon" class="icon" />
          </div>
          <div class="divider" v-if="menu.type === 'divider'"></div>
        </t-tooltip>
      </div>
      <div class="footItem fc ac">
        <t-tooltip :content="$t('workbench.menu.feedbackQuestions')" placement="right" destroyOnClose :showArrow="false">
          <div class="item c" @click="openFeedback">
            <i-bill class="icon" />
          </div>
        </t-tooltip>
        <t-tooltip :content="$t('workbench.menu.settings')" placement="right" destroyOnClose :showArrow="false">
          <div class="item c" @click="showSetting = true">
            <t-badge :count="needUpdate ? 1 : 0" dot>
              <i-setting-one class="icon" />
            </t-badge>
          </div>
        </t-tooltip>
        <t-tooltip :content="$t('workbench.menu.jumpGithub')" placement="right" destroyOnClose :showArrow="false">
          <div class="item c" @click="jumpGithub">
            <i-github-one class="icon" />
          </div>
        </t-tooltip>
      </div>
    </div>
    <div class="view">
      <div class="topMenu f ac jb" v-if="project?.id">
        <div class="title">
          <h2>{{ project?.name || $t("workbench.selectProject") }}</h2>
        </div>
        <div class="rightBtnList f ac">
          <t-tooltip
            :content="getMenuLabel(menu)"
            placement="bottom"
            destroyOnClose
            :showArrow="false"
            v-for="(menu, index) in rightBtnList"
            :key="index">
            <div
              class="item fc c"
              v-if="menu.type === 'btn' && (project.projectType === 'novel' || !menu.nodelOnly)"
              :class="{ active: activeMenu == menu.path }"
              @click="handleClick(menu)">
              <component :is="menu.icon" class="icon" />
            </div>
            <div class="divider" v-if="menu.type === 'divider'"></div>
          </t-tooltip>
        </div>
      </div>
      <div class="viewBox">
        <div v-if="pageError" class="pageErrorState c">
          <div class="pageErrorCard">
            <h3>页面加载失败</h3>
            <p>{{ pageError.message }}</p>
            <div class="errorMeta">当前路由：{{ route.fullPath }}</div>
            <div class="errorActions f ac">
              <t-button theme="primary" @click="reloadCurrentPage">重新加载</t-button>
              <t-button variant="outline" @click="backToProjectList">返回项目列表</t-button>
            </div>
          </div>
        </div>
        <router-view v-else v-slot="{ Component }">
          <component :is="Component" :key="$route.fullPath" />
        </router-view>
      </div>
    </div>
  </div>
  <hello />
  <setting />
  <WorkspaceSetupWizard />
  <WorkspaceMaintenanceOverlay />
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import setting from "@/components/setting/index.vue";
import hello from "@/components/hello.vue";
import WorkspaceSetupWizard from "@/components/workspace/WorkspaceSetupWizard.vue";
import WorkspaceMaintenanceOverlay from "@/components/workspace/WorkspaceMaintenanceOverlay.vue";
import projectStore from "@/stores/project";
import useWorkspaceStore from "@/stores/workspace";
import { handleDynamicImportFailure } from "@/utils/moduleRecovery";
const { project } = storeToRefs(projectStore());
import settingStore from "@/stores/setting";
import { NotifyPlugin } from "tdesign-vue-next";
const { showSetting, isElectron, needUpdate, apiReady } = storeToRefs(settingStore());
const workspace = useWorkspaceStore();
const menuList = ref([
  { type: "btn", path: "/project", labelKey: "workbench.menu.myProject", icon: "i-folder-close" },
  { type: "btn", path: "/task", labelKey: "workbench.menu.taskCenter", icon: "i-view-list" },
  // { type: "divider" },
]);

const rightBtnList = ref([
  { type: "btn", path: "/novel", labelKey: "workbench.menu.novel", icon: "i-notebook", nodelOnly: true, needProject: true },
  { type: "btn", path: "/scriptAgent", labelKey: "workbench.menu.scriptAgent", icon: "i-color-filter", nodelOnly: true, needProject: true },
  { type: "btn", path: "/storyAgent", label: "故事创作台", icon: "i-edit-name", needProject: true },
  { type: "btn", path: "/script", labelKey: "workbench.menu.scriptManage", icon: "i-document-folder", needProject: true },
  { type: "btn", path: "/cornerScape", labelKey: "workbench.menu.cornerScape", icon: "i-peoples-two", needProject: true },
  { type: "btn", path: "/production", labelKey: "workbench.menu.production", icon: "i-carousel-video", needProject: true },
  { type: "divider" },
  { type: "btn", path: "/assets", labelKey: "workbench.menu.assetCenter", icon: "i-receive", needProject: true },
]);

const router = useRouter();
const route = useRoute();
const activeMenu = ref(route.path);
const pageError = ref<{ message: string } | null>(null);

function getMenuLabel(menu: any) {
  return menu.labelKey ? $t(menu.labelKey) : menu.label || "";
}

onErrorCaptured((error) => {
  const message = error instanceof Error ? error.message : String(error || "未知错误");
  pageError.value = { message };
  console.error("[workbench] route component error", error);
  return false;
});

watch(
  () => route.path,
  (newPath) => {
    activeMenu.value = newPath;
    pageError.value = null;
  },
);

async function handleClick(menu: any) {
  if (menu.needProject && !project.value?.id) {
    window.$message.warning("请先选择项目");
    void router.replace("/project");
    activeMenu.value = "/project";
    return;
  }
  if (isElectron.value && workspace.selectionRequired) {
    window.$message.warning($t("workspace.maintenanceNavigationBlocked"));
    return;
  }
  logWorkbenchNavigation(menu.path);
  try {
    await router.push(menu.path);
    activeMenu.value = menu.path;
  } catch (error) {
    if (!handleDynamicImportFailure(error, menu.path)) {
      window.$message.error((error as Error)?.message || "Page failed to load");
    }
  }
}

function logWorkbenchNavigation(path: string) {
  if (!import.meta.env.DEV) return;
  console.info("[workbench-navigation]", {
    path,
    isElectron: isElectron.value,
    selectionRequired: workspace.selectionRequired,
    maintenanceBlocking: workspace.maintenanceBlocking,
    restartRequired: workspace.restartRequired,
    migrationActive: workspace.migrationActive,
    activeProjectId: project.value?.id,
  });
}

function reloadCurrentPage() {
  pageError.value = null;
  window.location.reload();
}

function backToProjectList() {
  pageError.value = null;
  void router.replace("/project");
}

async function jumpGithub() {
  if (isElectron.value) {
    await fetch("toonflow://openurlwithbrowser?url=https://github.com/HBAI-Ltd/Toonflow-app");
  } else {
    window.open("https://github.com/HBAI-Ltd/Toonflow-app");
  }
}

async function openFeedback() {
  if (isElectron.value) {
    await fetch("toonflow://openurlwithbrowser?url=https://docs.qq.com/smartsheet/form/EmvmQBrmlPmr%2Fss_vsqk2v%2FvhiGzE?tab=ss_vsqk2v");
  } else {
    window.open("https://docs.qq.com/smartsheet/form/EmvmQBrmlPmr%2Fss_vsqk2v%2FvhiGzE?tab=ss_vsqk2v");
  }
}

async function checkVersion() {
  const { data } = await axios.post("/setting/about/checkUpdate", {
    source: "toonflow",
  });
  if (data.needUpdate) {
    needUpdate.value = true;
    const { activeMenu: settingActiveMenu } = storeToRefs(settingStore());
    const notifyInstance = NotifyPlugin.success({
      title: $t("version.newVersion") as string,
      content: () =>
        h(
          "div",
          { style: "text-align: right; padding-top: 4px;" },
          h(
            "span",
            {
              style: "color: #ed7b2f; font-size: 12px; cursor: pointer;",
              onClick: () => {
                settingActiveMenu.value = "about";
                showSetting.value = true;
                NotifyPlugin.close(notifyInstance);
              },
            },
            $t("skillScan.openSettings"),
          ),
        ),
      closeBtn: true,
      placement: "bottom-right",
    });
  } else {
    needUpdate.value = false;
  }
}

let checkVersionTimer: ReturnType<typeof setInterval> | null = null;

function startVersionCheck() {
  checkVersion();
  checkVersionTimer = setInterval(
    () => {
      checkVersion();
    },
    2 * 60 * 1000,
  );
}

function stopVersionCheck() {
  if (checkVersionTimer) {
    clearInterval(checkVersionTimer);
    checkVersionTimer = null;
  }
}

watch(needUpdate, (val) => {
  if (val) stopVersionCheck();
});

onMounted(() => {
  startVersionCheck();
});

watch(
  apiReady,
  (ready) => {
    if (!ready || !isElectron.value || !localStorage.getItem("token")) return;
    void workspace.initialize().catch(() => {});
  },
  { immediate: true },
);

onUnmounted(() => {
  stopVersionCheck();
});
</script>

<style lang="scss" scoped>
.main {
  width: 100vw;
  padding: 16px;
  display: flex;

  .menu {
    width: 64px;
    height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    background-color: var(--page);
    border-radius: 16px;
    padding-top: 16px;
    padding-bottom: 16px;
    color: var(--td-text-color-primary);
    .logoBox {
      width: 100%;
      height: fit-content;
      .logo {
        width: 60%;
        aspect-ratio: 1/1;
        background-color: var(--td-text-color-primary);
        mask: url("@/assets/logo.svg") no-repeat center;
        mask-size: contain;
        -webkit-mask: url("@/assets/logo.svg") no-repeat center;
        -webkit-mask-size: contain;
      }
    }
    .itemBox {
      flex: 1;
      margin-top: 16px;
      margin-bottom: 16px;
      padding-bottom: 16px;
      width: 100%;
      height: 100%;
    }
    .footItem {
      width: 100%;
      height: fit-content;
      .item {
        cursor: pointer;
        width: 50px;
        height: 50px;
        .icon {
          font-size: 24px;
        }
        &:hover {
          background-color: var(--td-bg-color-container-hover);
          border-radius: 16px;
        }
      }
      .active {
        background-color: #000 !important;
        border-radius: 16px;
      }
    }
  }
  .menu::-webkit-scrollbar {
    width: 4px;
  }
  .menu::-webkit-scrollbar-thumb {
    background-color: #d5d5d5;
    border-radius: 4px;
    &:hover {
      background-color: #bbb;
    }
  }
  .menu::-webkit-scrollbar-track {
    background-color: transparent;
  }
  .view {
    flex: 1;
    margin-left: 16px;
    background-color: var(--page);
    border-radius: 16px;
    width: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding-left: 32px;
    padding-right: 32px;
    .topMenu {
      height: 6vh;
      .rightBtnList {
        .item {
          margin-bottom: 0px !important;
          margin-top: 0px !important;
          margin-right: 4px;
          margin-left: 4px;
        }
        .divider {
          width: 1px;
          height: 24px;
          background-color: var(--td-border-level-1-color);
          margin: 0 4px;
        }
      }
    }
    .viewBox {
      width: 100%;
      height: calc(100% - 6vh);
      .pageErrorState {
        width: 100%;
        height: 100%;
        .pageErrorCard {
          width: min(460px, 90%);
          padding: 24px;
          border: 1px solid var(--td-border-level-1-color);
          border-radius: 8px;
          background: var(--td-bg-color-container);
          box-shadow: var(--td-shadow-2);
          h3 {
            margin: 0 0 12px;
          }
          p {
            margin: 0 0 12px;
            color: var(--td-text-color-secondary);
            line-height: 1.6;
            word-break: break-word;
          }
          .errorMeta {
            margin-bottom: 16px;
            color: var(--td-text-color-placeholder);
            font-size: 12px;
          }
          .errorActions {
            gap: 8px;
          }
        }
      }
    }
  }
}

.item {
  margin-bottom: 4px;
  margin-top: 4px;
  cursor: pointer;
  width: 50px;
  height: 50px;
  .icon {
    font-size: 24px;
  }
  .title {
    font-size: 10px;
    white-space: nowrap;
    color: var(--td-text-color-primary);
  }
  &:hover {
    background-color: var(--td-bg-color-container-hover);
    border-radius: 16px;
  }
}
.active {
  background-color: var(--td-brand-color) !important;
  color: var(--td-font-white-1);
  border-radius: 16px;
}
.divider {
  width: 50px;
  height: 1px;
  background-color: var(--td-border-level-1-color);
  margin: 8px 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
