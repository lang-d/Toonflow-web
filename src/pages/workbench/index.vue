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
      <div class="topMenu" v-if="project?.id">
        <div class="projectIdentity">
          <h2>{{ project?.name || $t("workbench.selectProject") }}</h2>
          <span v-if="projectTypeLabel" class="projectMeta">{{ projectTypeLabel }}</span>
        </div>
        <div class="rightBtnList" aria-label="项目工作区导航">
          <section v-for="group in menuGroups" v-show="group.menus.some(isMenuVisible)" :key="group.key" class="menuGroup" :aria-label="group.label">
            <t-tooltip
              v-for="menu in group.menus"
              :key="menu.path"
              :content="getMenuLabel(menu)"
              placement="bottom"
              destroyOnClose
              :showArrow="false">
              <button
                v-if="isMenuVisible(menu)"
                type="button"
                class="item"
                :class="{ active: activeMenu === menu.path }"
                @click="handleClick(menu)">
                <component :is="menu.icon" class="icon" />
                <span class="menuLabel">{{ getMenuLabel(menu) }}</span>
              </button>
            </t-tooltip>
          </section>
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
  <GlobalTaskCenter />
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import setting from "@/components/setting/index.vue";
import hello from "@/components/hello.vue";
import WorkspaceSetupWizard from "@/components/workspace/WorkspaceSetupWizard.vue";
import WorkspaceMaintenanceOverlay from "@/components/workspace/WorkspaceMaintenanceOverlay.vue";
import GlobalTaskCenter from "@/components/taskCenter/GlobalTaskCenter.vue";
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
  { path: "/novel", labelKey: "workbench.menu.novel", icon: "i-notebook", nodelOnly: true, needProject: true, group: "creative" },
  { path: "/scriptAgent", labelKey: "workbench.menu.scriptAgent", icon: "i-color-filter", nodelOnly: true, needProject: true, group: "creative" },
  { path: "/storyAgent", label: "故事创作台", icon: "i-edit-name", needProject: true, group: "creative" },
  { path: "/projectMaterial", labelKey: "workbench.menu.projectMaterial", icon: "i-folder-open", needProject: true, group: "content" },
  { path: "/script", labelKey: "workbench.menu.scriptManage", icon: "i-document-folder", needProject: true, group: "content" },
  { path: "/cornerScape", labelKey: "workbench.menu.cornerScape", icon: "i-peoples-two", needProject: true, group: "content" },
  { path: "/production", labelKey: "workbench.menu.production", icon: "i-carousel-video", needProject: true, group: "production" },
  { path: "/productionMusic", labelKey: "workbench.menu.productionMusic", icon: "i-music", needProject: true, group: "production" },
  { path: "/assets", labelKey: "workbench.menu.assetCenter", icon: "i-receive", needProject: true, group: "assets" },
]);

const menuGroups = computed(() => [
  { key: "creative", label: "创作", menus: rightBtnList.value.filter((menu) => menu.group === "creative") },
  { key: "content", label: "内容", menus: rightBtnList.value.filter((menu) => menu.group === "content") },
  { key: "production", label: "制作", menus: rightBtnList.value.filter((menu) => menu.group === "production") },
  { key: "assets", label: "资产", menus: rightBtnList.value.filter((menu) => menu.group === "assets") },
]);

const router = useRouter();
const route = useRoute();
const activeMenu = ref(route.path);
const pageError = ref<{ message: string } | null>(null);

function getMenuLabel(menu: any) {
  return menu.labelKey ? $t(menu.labelKey) : menu.label || "";
}

const projectTypeLabel = computed(() => {
  if (project.value?.projectType === "novel") return "小说项目";
  if (project.value?.projectType === "script") return "剧本项目";
  return "";
});

function isMenuVisible(menu: any) {
  return project.value?.projectType === "novel" || !menu.nodelOnly;
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
      position: sticky;
      top: 0;
      z-index: 12;
      display: flex;
      align-items: stretch;
      justify-content: space-between;
      height: 72px;
      min-height: 72px;
      box-sizing: border-box;
      gap: 0;
      background-color: var(--page);
      border-bottom: 1px solid var(--td-border-level-1-color);
      box-shadow: 0 2px 6px rgb(0 0 0 / 4%);
      .projectIdentity {
        flex: 0 1 300px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        box-sizing: border-box;
        min-width: 0;
        max-width: 360px;
        padding-right: 24px;
        overflow: hidden;
        border-right: 1px solid var(--td-border-level-1-color);
        h2 {
          margin: 0;
          font-size: 21px;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .projectMeta {
          margin-top: 3px;
          color: var(--td-text-color-secondary);
          font-size: 12px;
          line-height: 1.3;
        }
      }
      .rightBtnList {
        flex: 0 1 auto;
        display: flex;
        align-items: stretch;
        width: fit-content;
        min-width: 0;
        max-width: calc(100% - 240px);
        margin-left: auto;
        padding-left: 0;
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        scrollbar-width: thin;
        scrollbar-color: var(--td-border-level-2-color) transparent;
        .menuGroup {
          position: relative;
          display: flex;
          align-items: stretch;
          flex: 0 0 auto;
          padding: 4px 10px;
          & + .menuGroup {
            margin-left: 4px;
            padding-left: 22px;
            &::before {
              position: absolute;
              top: 22px;
              bottom: 22px;
              left: 0;
              width: 1px;
              background: var(--td-border-level-1-color);
              content: "";
            }
          }
        }
        .item {
          position: relative;
          flex: 0 0 72px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          width: 72px;
          height: 64px;
          margin: 0 !important;
          padding: 4px 5px 6px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: var(--td-text-color-primary);
          cursor: pointer;
          transition: background-color 160ms ease, color 160ms ease;
          .icon {
            font-size: 21px;
          }
          .menuLabel {
            max-width: 100%;
            overflow: hidden;
            color: inherit;
            font-size: 11px;
            line-height: 15px;
            text-overflow: ellipsis;
          }
          &:hover {
            background: var(--td-bg-color-container-hover);
          }
          &.active {
            border-radius: 6px;
            background: #edf5ff !important;
            color: var(--td-brand-color) !important;
            &::after {
              position: absolute;
              right: 8px;
              bottom: 0;
              left: 8px;
              height: 2px;
              border-radius: 2px 2px 0 0;
              background: var(--td-brand-color);
              content: "";
            }
          }
          &:focus-visible {
            outline: 2px solid var(--td-brand-color);
            outline-offset: -2px;
          }
        }
        &::-webkit-scrollbar { height: 4px; }
        &::-webkit-scrollbar-thumb { border-radius: 4px; background-color: var(--td-border-level-2-color); }
        &::-webkit-scrollbar-track { background: transparent; }
      }
    }
    .viewBox {
      width: 100%;
      height: calc(100% - 72px);
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

@media (max-width: 1100px) {
  .main .view {
    .topMenu {
      gap: 12px;
      .projectIdentity { flex-basis: 210px; padding-right: 16px; }
      .rightBtnList { max-width: calc(100% - 180px); padding-left: 0; }
    }
  }
}

@media (max-width: 760px) {
  .main .view {
    padding-right: 16px;
    padding-left: 16px;
    .topMenu {
      gap: 8px;
      .projectIdentity {
        flex: 0 1 132px;
        h2 { font-size: 17px; }
        .projectMeta { display: none; }
      }
      .rightBtnList {
        flex: 1 1 0;
        max-width: calc(100% - 132px);
        padding-left: 0;
        .menuGroup { padding-right: 5px; padding-left: 5px; }
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
.menu .item.active {
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
