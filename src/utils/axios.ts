import axios from "axios";
import router from "@/router/index";
import { storeToRefs } from "pinia";
import { MessagePlugin, NotifyPlugin, type TNode } from "tdesign-vue-next";
import settingStore from "@/stores/setting";
import { h } from "vue";
import type { ApiValidationIssue } from "@/types/api";
const instance = axios.create();

function formatApiError(error: any) {
  const payload = error?.response?.data;
  if (!payload || typeof payload !== "object") return error;
  const issues = Array.isArray(payload.data?.issues) ? (payload.data.issues as ApiValidationIssue[]) : [];
  if (!issues.length) return payload;
  const details = issues
    .map((issue) => [issue.path, issue.message].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");
  return {
    ...payload,
    message: [payload.message, details].filter(Boolean).join(" - "),
  };
}

instance.interceptors.request.use(function (config) {
  const { baseUrl, otherSetting } = storeToRefs(settingStore());
  config.baseURL = baseUrl.value;
  config.timeout = otherSetting.value.axiosTimeOut;
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = token;
  }

  return config;
});

instance.interceptors.response.use(
  function (response) {
    return response.data;
  },
  function (error) {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      router.push("/login");
      MessagePlugin.error(window.$t("common.sessionExpired"));
    }
    if (error.response?.status === 503 && error.response?.data?.data?.maintenance) {
      void import("@/stores/workspace").then(({ default: useWorkspaceStore }) => {
        useWorkspaceStore().fetchStatus().catch(() => {});
      });
      MessagePlugin.warning(window.$t("workspace.maintenanceRequestBlocked"));
    }
    const errorText = [error.message, error.response?.data?.message, error.response?.data?.stack].filter(Boolean).join("\n");
    const isNetworkError = errorText.includes("Network Error");
    const shouldSuppressNetworkNotify = (error.config as any)?.suppressNetworkErrorNotify;
    const shouldShowRuntimeTip = /better_sqlite3\.node|NODE_MODULE_VERSION|Visual C\+\+|ERR_DLOPEN_FAILED/i.test(errorText);
    if (isNetworkError && !shouldSuppressNetworkNotify && shouldShowRuntimeTip) {
      NotifyPlugin.error({
        title: "Network Error",
        closeBtn: true,
        content: h("div", [
          h("div", [
            "请尝试安装 Visual C++ 运行库：",
            h("br"),
            h("a", { href: "https://aka.ms/vs/17/release/vc_redist.x86.exe", target: "_blank", rel: "noopener noreferrer" }, "32位系统下载"),
            h("br"),
            h("a", { href: "https://aka.ms/vs/17/release/vc_redist.x64.exe", target: "_blank", rel: "noopener noreferrer" }, "64位系统下载"),
          ]),
        ]) as unknown as TNode,
      });
    }

    return Promise.reject(formatApiError(error));
  },
);

export default instance;
