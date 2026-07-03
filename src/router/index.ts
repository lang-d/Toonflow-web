import { createRouter, createWebHashHistory } from "vue-router";
import ModuleLoadError from "@/pages/error/moduleLoad.vue";
import { clearModuleRecovery, handleDynamicImportFailure, hasModuleLoadError } from "@/utils/moduleRecovery";
import projectStore from "@/stores/project";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/:catchAll(.*)",
      name: "404",
      meta: {
        title: "404",
      },
      component: () => import("@/pages/error/404.vue"),
    },
    {
      path: "/",
      redirect: "/workbench",
    },
    {
      path: "/workbench",
      component: () => import("@/pages/workbench/index.vue"),
      redirect: "/project",
      children: [
        {
          path: "/project",
          component: () => import("@/views/project/index.vue"),
        },
        {
          path: "/task",
          component: () => import("@/views/task/index.vue"),
        },
        // {
        //   path: "/detail",
        //   component: () => import("@/views/detail/index.vue"),
        // },
        {
          path: "/novel",
          meta: { requiresProject: true },
          component: () => import("@/views/novel/index.vue"),
        },
        {
          path: "/script",
          meta: { requiresProject: true },
          component: () => import("@/views/script/index.vue"),
        },
        {
          path: "/scriptAgent",
          meta: { requiresProject: true },
          component: () => import("@/views/scriptAgent/index.vue"),
        },
        {
          path: "/storyAgent",
          meta: { requiresProject: true },
          component: () => import("@/views/storyAgent/index.vue"),
        },
        {
          path: "/projectMaterial",
          meta: { requiresProject: true },
          component: () => import("@/views/projectMaterial/index.vue"),
        },
        {
          path: "/cornerScape",
          meta: { requiresProject: true },
          component: () => import("@/views/cornerScape/index.vue"),
        },
        {
          path: "/production",
          meta: { requiresProject: true },
          component: () => import("@/views/production/index.vue"),
        },
        {
          path: "/assets",
          meta: { requiresProject: true },
          component: () => import("@/views/assets/index.vue"),
        },
        {
          path: "/test",
          component: () => import("@/views/test/index.vue"),
        },
      ],
    },
    {
      path: "/module-load-error",
      name: "module-load-error",
      component: ModuleLoadError,
    },
    {
      path: "/login",
      component: () => import("@/pages/login/index.vue"),
    },
  ],
});
router.beforeEach((to, from, next) => {
  if (to.path === "/login") {
    next();
  } else {
    if (localStorage.getItem("token")) {
      const activeProject = projectStore().project;
      if (to.meta.requiresProject && !activeProject?.id) {
        if (import.meta.env.DEV) {
          console.warn("[router] blocked project route without active project", {
            to: to.fullPath,
            from: from.fullPath,
            activeProjectId: activeProject?.id,
          });
        }
        next("/project");
        return;
      }
      next();
    } else {
      next("/login");
    }
  }
});

router.onError((error, to) => {
  if (!handleDynamicImportFailure(error, to.fullPath)) return;
  if (hasModuleLoadError()) {
    void router.replace({ name: "module-load-error" });
  }
});

router.afterEach((to, _from, failure) => {
  if (!failure && to.name !== "module-load-error") {
    clearModuleRecovery(to.fullPath);
  }
});

export default router;
