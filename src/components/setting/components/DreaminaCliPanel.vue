<template>
  <div class="dreaminaPanel">
    <div class="dreaminaHeader">
      <div>
        <div class="title">即梦官方 CLI</div>
        <div class="subTitle">本地官方命令行供应商</div>
      </div>
      <t-button size="small" variant="outline" :loading="statusLoading || queueLoading" @click="refreshPanel">
        <template #icon><t-icon name="refresh" /></template>
        刷新状态
      </t-button>
    </div>

    <div class="statusTags">
      <t-tag :theme="status?.installed ? 'success' : 'warning'">
        {{ status?.installed ? "已安装" : "未安装" }}
      </t-tag>
      <t-tag :theme="status?.helpOk ? 'success' : 'danger'">
        {{ status?.helpOk ? "CLI 可用" : "CLI 不可用" }}
      </t-tag>
      <t-tag :theme="loginTagTheme">
        {{ loginText }}
      </t-tag>
    </div>

    <div class="infoGrid">
      <div class="infoItem">
        <span>执行文件</span>
        <code>{{ status?.executablePath || "-" }}</code>
      </div>
      <div class="infoItem">
        <span>安装目录</span>
        <code>{{ status?.installDir || "-" }}</code>
      </div>
      <div class="infoItem">
        <span>队列</span>
        <code>{{ queueSummary }}</code>
      </div>
      <div class="infoItem">
        <span>最新信息</span>
        <code>{{ formatInline(status?.latest) }}</code>
      </div>
      <div class="infoItem">
        <span>用户余额</span>
        <code>{{ creditSummary }}</code>
      </div>
    </div>

    <div class="actionRow">
      <t-button theme="primary" :loading="actionLoading.install" :disabled="status?.installed" @click="runStatusAction('install')">
        安装
      </t-button>
      <t-button variant="outline" :loading="actionLoading.update" :disabled="!status?.installed" @click="runStatusAction('update')">
        更新
      </t-button>
      <t-button theme="danger" variant="outline" :loading="actionLoading.uninstall" :disabled="!status?.installed" @click="runStatusAction('uninstall')">
        卸载
      </t-button>
      <t-button variant="outline" :loading="loginLoading" :disabled="!status?.installed || isLoggedIn || loginLoading" @click="startLogin">
        登录即梦
      </t-button>
      <t-button variant="outline" :loading="logoutLoading" :disabled="!status?.installed || !isLoggedIn || logoutLoading" @click="logout">
        退出登录
      </t-button>
      <t-button variant="outline" :loading="refreshModelsLoading" :disabled="!status?.installed" @click="refreshModels">
        刷新模型
      </t-button>
    </div>

    <div class="actionRow">
      <t-button size="small" variant="text" :loading="creditLoading" :disabled="!status?.installed || creditLoading" @click="queryCredit">
        查询余额
      </t-button>
      <t-button size="small" variant="text" :loading="queueLoading" :disabled="queueLoading" @click="() => fetchQueueStatus()">
        队列状态
      </t-button>
      <t-button size="small" variant="text" :loading="taskLoading" :disabled="!status?.installed || taskLoading" @click="listTask">
        历史任务
      </t-button>
      <t-button size="small" variant="text" :disabled="!status?.installed" @click="queryDialogVisible = true">
        查询任务结果
      </t-button>
    </div>

    <section class="panelSection">
      <div class="sectionHeader">
        <div>
          <div class="sectionTitle">视频队列状态</div>
          <div class="sectionDescription">展示 Toonflow 本地等待和即梦官方活动任务。</div>
        </div>
        <t-button size="small" variant="text" :loading="queueLoading" @click="fetchQueueStatus(false)">刷新</t-button>
      </div>

      <t-alert
        v-if="queueStats.blocked > 0"
        theme="warning"
        message="部分模型容量已满，任务将在后台自动等待，不会按生成失败处理。" />

      <div class="queueStats">
        <div class="queueStat">
          <span>官方活动</span>
          <strong>{{ queueStats.active }}</strong>
        </div>
        <div class="queueStat">
          <span>确认中</span>
          <strong>{{ queueStats.confirming }}</strong>
        </div>
        <div class="queueStat">
          <span>本地等待</span>
          <strong>{{ queueStats.waiting }}</strong>
        </div>
      </div>

      <div v-if="queueStatus.summary.length" class="queueList">
        <div v-for="item in queueStatus.summary" :key="item.providerModelKey" class="queueItem">
          <div class="queueItemMain">
            <strong>{{ getProviderModelLabel(item.providerModelKey) }}</strong>
            <span>{{ item.providerModelKey }}</span>
          </div>
          <span>活动 {{ item.knownActive }}</span>
          <span>确认 {{ item.confirming }}</span>
          <span>等待 {{ item.waiting }}</span>
          <span>并发 {{ item.configuredConcurrent }}</span>
          <span v-if="item.queueIndex != null && item.queueLength != null">官方 {{ item.queueIndex }} / {{ item.queueLength }}</span>
          <t-tag v-if="item.capacityBlocked" theme="warning" variant="light">容量等待</t-tag>
        </div>
      </div>
      <t-empty v-else title="暂无活动任务" />

      <t-collapse v-if="queueStatus.tasks.length" class="queueTasks">
        <t-collapse-panel value="active-tasks" :header="`活动任务（${queueStatus.tasks.length}）`">
          <div v-for="task in queueStatus.tasks" :key="task.id" class="queueTask">
            <div>
              <strong>{{ task.model || getProviderModelLabel(task.providerModelKey) }}</strong>
              <span>{{ getQueueTaskLabel(task) }}</span>
            </div>
            <span v-if="task.providerQueueIndex != null && task.providerQueueLength != null">
              官方队列 {{ task.providerQueueIndex }} / {{ task.providerQueueLength }}
            </span>
            <span>已轮询 {{ task.pollCount || 0 }} 次</span>
          </div>
        </t-collapse-panel>
      </t-collapse>
    </section>

    <section v-if="dreaminaModelGroups.length" class="panelSection">
      <div class="sectionHeader">
        <div>
          <div class="sectionTitle">视频队列设置</div>
          <div class="sectionDescription">同版本的视频命令共享并发槽位，修改只影响后续调度。</div>
        </div>
      </div>

      <div class="queueConfigGrid">
        <div v-for="group in dreaminaModelGroups" :key="group.key" class="queueConfigCard">
          <div class="queueConfigTitle">
            <strong>{{ group.label }}</strong>
            <span>{{ group.models.length }} 个命令模式</span>
          </div>
          <div class="queueConfigFields">
            <label>
              <span>并发任务数</span>
              <t-input-number v-model="queueConfigForms[group.key].maxConcurrent" :min="1" :max="20" />
            </label>
            <label>
              <span>最大等待时间（小时）</span>
              <t-input-number v-model="queueConfigForms[group.key].maxWaitHours" :min="1" :max="72" />
            </label>
          </div>
          <t-button
            size="small"
            theme="primary"
            :loading="!!queueConfigSaving[group.key]"
            @click="saveQueueConfig(group)">
            保存队列设置
          </t-button>
        </div>
      </div>
    </section>

    <t-alert v-if="status?.login?.state === 'failed'" theme="error" :message="failedLoginMessage" />

    <t-collapse v-if="status?.help || status?.meta">
      <t-collapse-panel value="detail" header="CLI 详情">
        <pre v-if="status?.help">{{ status.help }}</pre>
        <pre v-if="status?.meta">{{ formatBlock(status.meta) }}</pre>
      </t-collapse-panel>
    </t-collapse>

    <t-dialog v-model:visible="loginDialogVisible" width="520px" header="登录即梦" :footer="false" @close="stopLoginPolling">
      <div class="loginDialog">
        <div v-if="activeLogin?.state === 'device'" class="deviceLogin">
          <div class="deviceTitle">请在浏览器中完成即梦登录</div>
          <ol>
            <li>点击“打开登录页面”。</li>
            <li>在页面中按提示完成授权。</li>
            <li>如页面要求验证码，请复制下方授权码。</li>
          </ol>

          <div class="codeBox">
            <span>授权码</span>
            <strong>{{ activeLogin.userCode || "-" }}</strong>
          </div>
          <div v-if="activeLogin.expiresAt" class="expireText">过期时间：{{ formatExpiresAt(activeLogin.expiresAt) }}</div>

          <div class="loginActions">
            <t-button theme="primary" :disabled="!deviceLoginUrl" @click="openDeviceLoginUrl">
              打开登录页面
            </t-button>
            <t-button variant="outline" :disabled="!activeLogin.userCode" @click="copyUserCode">
              复制授权码
            </t-button>
            <t-button variant="text" :loading="statusLoading" @click="checkLoginOnce">
              我已完成登录
            </t-button>
          </div>
        </div>

        <div v-else-if="activeLogin?.state === 'qr' && activeLogin.qrBase64" class="qrWrap">
          <img :src="activeLogin.qrBase64" alt="即梦登录二维码" />
        </div>

        <t-loading v-else-if="activeLogin?.state === 'running' || loginLoading" text="正在启动登录" />

        <t-alert
          v-if="activeLogin?.message || activeLogin?.state"
          :theme="activeLogin?.state === 'failed' ? 'error' : 'info'"
          :message="loginDialogMessage" />
        <pre v-if="showLoginRawOutput">{{ activeLogin?.stderr || activeLogin?.stdout }}</pre>
      </div>
    </t-dialog>

    <t-dialog v-model:visible="rawDialogVisible" width="720px" :header="rawDialogTitle" :footer="false">
      <pre class="rawOutput">{{ rawDialogContent || "暂无输出" }}</pre>
    </t-dialog>

    <t-dialog v-model:visible="queryDialogVisible" width="560px" header="查询即梦任务结果" :footer="false">
      <t-form label-align="top">
        <t-form-item label="Submit ID">
          <t-input v-model="querySubmitId" clearable placeholder="请输入 submitId" />
        </t-form-item>
        <t-form-item label="下载结果">
          <t-switch v-model="queryDownload" />
        </t-form-item>
      </t-form>
      <div class="queryActions">
        <t-button :loading="queryLoading" theme="primary" @click="queryResult">查询</t-button>
      </div>
      <pre v-if="queryResultRaw" class="rawOutput">{{ queryResultRaw }}</pre>
      <div v-if="queryDownloadDir" class="downloadDir">下载目录：{{ queryDownloadDir }}</div>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import settingStore from "@/stores/setting";
import {
  createEmptyDreaminaQueueStatus,
  type DreaminaQueueStatusData,
  type DreaminaQueueTask,
  type DreaminaVideoModel,
} from "@/types/dreamina";

const props = withDefaults(
  defineProps<{
    models?: any[];
  }>(),
  {
    models: () => [],
  },
);

const emit = defineEmits<{
  refreshed: [];
}>();

type LoginState = "running" | "qr" | "device" | "success" | "failed";

interface DreaminaLogin {
  id: string;
  state: LoginState;
  qrPath?: string;
  qrBase64?: string;
  verificationUri?: string;
  loginUrl?: string;
  userCode?: string;
  deviceCode?: string;
  pollInterval?: number;
  expiresAt?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  startTime: number;
  endTime?: number;
}

interface DreaminaStatus {
  installed: boolean;
  executablePath: string;
  installDir: string;
  meta: unknown;
  latest: unknown;
  helpOk: boolean;
  help: string;
  login: DreaminaLogin | null;
}

interface DreaminaModelGroup {
  key: string;
  label: string;
  models: DreaminaVideoModel[];
}

const dreaminaAxiosConfig = { suppressNetworkErrorNotify: true } as any;
const dreaminaStatusAxiosConfig = { ...dreaminaAxiosConfig, timeout: 15000 } as any;
const dreaminaCommandAxiosConfig = { ...dreaminaAxiosConfig, timeout: 30000 } as any;
const dreaminaLongCommandAxiosConfig = { ...dreaminaAxiosConfig, timeout: 60000 } as any;
const { isElectron } = storeToRefs(settingStore());

const status = ref<DreaminaStatus | null>(null);
const queueStatus = ref<DreaminaQueueStatusData>(createEmptyDreaminaQueueStatus());
const statusLoading = ref(false);
const loginLoading = ref(false);
const logoutLoading = ref(false);
const refreshModelsLoading = ref(false);
const creditLoading = ref(false);
const queueLoading = ref(false);
const taskLoading = ref(false);
const loginDialogVisible = ref(false);
const rawDialogVisible = ref(false);
const rawDialogTitle = ref("");
const rawDialogContent = ref("");
const queryDialogVisible = ref(false);
const querySubmitId = ref("");
const queryDownload = ref(false);
const queryLoading = ref(false);
const queryResultRaw = ref("");
const queryDownloadDir = ref("");
const creditRaw = ref("");
const creditAutoLoading = ref(false);
const loginResult = ref<DreaminaLogin | null>(null);
const loginConfirmed = ref(false);
const queueConfigForms = reactive<Record<string, { maxConcurrent: number; maxWaitHours: number }>>({});
const queueConfigSaving = reactive<Record<string, boolean>>({});
const rawActiveLogin = computed(() => status.value?.login ?? loginResult.value);
const activeLogin = computed(() => {
  if (loginConfirmed.value) {
    return normalizeDreaminaLogin(
      loginResult.value ?? {
        id: "",
        state: "success",
        message: "即梦登录成功",
        startTime: Date.now(),
      },
    );
  }
  return normalizeDreaminaLogin(rawActiveLogin.value);
});
let loginTimer: ReturnType<typeof setInterval> | null = null;
let loginPollCount = 0;

const actionLoading = reactive({
  install: false,
  update: false,
  uninstall: false,
});

const deviceLoginUrl = computed(() => activeLogin.value?.loginUrl || activeLogin.value?.verificationUri || "");
const showLoginRawOutput = computed(() => {
  const login = activeLogin.value;
  return !!login && login.state !== "device" && !!(login.stderr || login.stdout);
});

const failedLoginMessage = computed(() => {
  const login = status.value?.login;
  return login?.message || login?.stderr || login?.stdout || "即梦登录失败";
});

const loginText = computed(() => {
  const state = activeLogin.value?.state;
  if (state === "success") return "已登录";
  if (state === "device") return "等待授权";
  if (state === "qr") return "等待扫码";
  if (state === "running") return "登录中";
  if (state === "failed") return "登录失败";
  return "未登录";
});

const loginTagTheme = computed(() => {
  const state = activeLogin.value?.state;
  if (state === "success") return "success";
  if (state === "failed") return "danger";
  if (state === "device" || state === "qr" || state === "running") return "warning";
  return "default";
});

const isLoggedIn = computed(() => activeLogin.value?.state === "success");

const creditSummary = computed(() => {
  const raw = creditRaw.value.trim();
  if (!raw) return "-";
  const match = raw.match(/(?:credit|credits|balance|余额|积分)[^\d-]*([0-9]+(?:\.[0-9]+)?)/i);
  return match?.[1] ?? raw.split(/\r?\n/).find(Boolean) ?? "-";
});

const DREAMINA_MODEL_LABELS: Record<string, string> = {
  "dreamina:seedance2.0": "Seedance 2.0",
  "dreamina:seedance2.0fast": "Seedance 2.0 Fast",
  "dreamina:seedance2.0mini": "Seedance 2.0 Mini",
  "dreamina:seedance2.0_vip": "Seedance 2.0 VIP",
  "dreamina:seedance2.0fast_vip": "Seedance 2.0 Fast VIP",
};

const DREAMINA_MODEL_ORDER = Object.keys(DREAMINA_MODEL_LABELS);

function getDreaminaProviderModelKey(modelName: string) {
  const version = modelName.split(":").at(-1)?.trim().toLowerCase() || "default";
  const aliases: Record<string, string> = {
    "seedance2.0-fast": "seedance2.0fast",
    "seedance2.0_fast": "seedance2.0fast",
    "seedance2.0-mini": "seedance2.0mini",
    "seedance2.0_mini": "seedance2.0mini",
    "seedance2.0mini": "seedance2.0mini",
    "seedance2.0-fast-vip": "seedance2.0fast_vip",
    "seedance2.0-fast_vip": "seedance2.0fast_vip",
    "seedance2.0_fast_vip": "seedance2.0fast_vip",
    "seedance2.0fastvip": "seedance2.0fast_vip",
    "seedance2.0-vip": "seedance2.0_vip",
    "seedance2.0vip": "seedance2.0_vip",
  };
  return `dreamina:${aliases[version] || version}`;
}

function getProviderModelLabel(providerModelKey: string) {
  return DREAMINA_MODEL_LABELS[providerModelKey] || providerModelKey.replace(/^dreamina:/, "");
}

const dreaminaModelGroups = computed<DreaminaModelGroup[]>(() => {
  const grouped = new Map<string, DreaminaVideoModel[]>();
  for (const model of props.models) {
    if (!model || model.type !== "video" || typeof model.modelName !== "string") continue;
    const key = getDreaminaProviderModelKey(model.modelName);
    if (!DREAMINA_MODEL_LABELS[key]) continue;
    const models = grouped.get(key) || [];
    models.push(model as DreaminaVideoModel);
    grouped.set(key, models);
  }
  return DREAMINA_MODEL_ORDER.flatMap((key) => {
    const models = grouped.get(key);
    return models?.length ? [{ key, label: DREAMINA_MODEL_LABELS[key], models }] : [];
  });
});

watch(
  dreaminaModelGroups,
  (groups) => {
    const activeKeys = new Set(groups.map((group) => group.key));
    for (const key of Object.keys(queueConfigForms)) {
      if (!activeKeys.has(key)) delete queueConfigForms[key];
    }
    for (const group of groups) {
      const config = group.models[0]?.queueConfig;
      queueConfigForms[group.key] = {
        maxConcurrent: config?.maxConcurrent ?? 1,
        maxWaitHours: config?.maxWaitHours ?? 6,
      };
    }
  },
  { immediate: true },
);

const queueStats = computed(() =>
  queueStatus.value.summary.reduce(
    (result, item) => {
      result.active += item.knownActive || 0;
      result.confirming += item.confirming || 0;
      result.waiting += item.waiting || 0;
      result.blocked += item.capacityBlocked ? 1 : 0;
      return result;
    },
    {
      active: 0,
      confirming: 0,
      waiting: 0,
      blocked: 0,
    },
  ),
);

const queueSummary = computed(() => {
  if (!queueStatus.value.summary.length) return "暂无活动任务";
  return `官方活动 ${queueStats.value.active} / 确认中 ${queueStats.value.confirming} / 本地等待 ${queueStats.value.waiting}`;
});

function getProviderQueueLabel(status?: number | null) {
  if (status === 1) return "官方排队中";
  if (status === 2) return "官方生成中";
  if (status === 3) return "结果处理中";
  return "等待官方状态";
}

function getQueueTaskLabel(task: DreaminaQueueTask) {
  if (task.status === "queued") return "本地排队中";
  if (task.status === "submitting") return "正在提交";
  if (task.status === "confirming") return "正在确认官方任务";
  if (task.status === "processing") return getProviderQueueLabel(task.providerQueueStatus);
  return task.state || task.phase || task.status;
}

const loginDialogMessage = computed(() => {
  const login = activeLogin.value;
  if (!login) return "正在启动登录";
  if (login.state === "device") return login.message || "请打开登录页面，并按提示完成授权";
  if (login.state === "qr") return login.message || "请使用即梦账号扫码登录";
  if (login.state === "success") return login.message || "登录成功";
  if (login.state === "failed") return login.message || login.stderr || login.stdout || "即梦登录失败";
  return login.message || "登录进程运行中";
});

function formatInline(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatBlock(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatExpiresAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function parseDeviceLoginFromText(login: DreaminaLogin) {
  const text = [login.stdout, login.stderr, login.message].filter(Boolean).join("\n");
  if (!text) return null;

  const userCode = text.match(/\buser_code\s*:\s*([^\s]+)/i)?.[1];
  const deviceCode = text.match(/\bdevice_code\s*:\s*([^\s]+)/i)?.[1];
  const pollIntervalText = text.match(/\bpoll_interval\s*:\s*([0-9.]+)/i)?.[1];
  const expiresAt = text.match(/\bexpires_at\s*:\s*([^\n\r]+)/i)?.[1]?.trim();

  const loginUrlMatch =
    text.match(/\blogin_url\s*:\s*(https?:\/\/[\s\S]*?)(?=\n\s*(?:verification_uri|user_code|device_code|poll_interval|expires_at)\s*:|$)/i) ||
    text.match(/\bverification_uri\s*:\s*(https?:\/\/[\s\S]*?)(?=\n\s*(?:user_code|device_code|poll_interval|expires_at)\s*:|$)/i);
  const loginUrl = loginUrlMatch?.[1]?.replace(/\s+/g, "");

  if (!userCode && !loginUrl) return null;

  return {
    ...login,
    state: "device" as LoginState,
    loginUrl: login.loginUrl || loginUrl,
    verificationUri: login.verificationUri || loginUrl,
    userCode: login.userCode || userCode,
    deviceCode: login.deviceCode || deviceCode,
    pollInterval: login.pollInterval || (pollIntervalText ? Number(pollIntervalText) : undefined),
    expiresAt: login.expiresAt || expiresAt,
  };
}

function hasLoginSuccessText(login: DreaminaLogin) {
  const text = [login.message, login.stdout, login.stderr].filter(Boolean).join("\n");
  return /(?:即梦)?登录成功|login\s+success|successfully\s+logged\s+in/i.test(text);
}

function hasLoginFailedText(login: DreaminaLogin) {
  const text = [login.message, login.stdout, login.stderr].filter(Boolean).join("\n");
  return /授权失败|登录失败|login\s+failed|failed\s+to\s+login|数据不存在/i.test(text);
}

function normalizeDreaminaLogin(login?: DreaminaLogin | null) {
  if (!login) return null;
  if (login.state === "success" || hasLoginSuccessText(login)) {
    return {
      ...login,
      state: "success" as LoginState,
      message: login.message || "即梦登录成功",
    };
  }
  if (login.state === "failed" || hasLoginFailedText(login)) {
    return {
      ...login,
      state: "failed" as LoginState,
      message: login.message || login.stderr || login.stdout || "即梦登录失败",
    };
  }
  if (login.state === "device") return login;
  return parseDeviceLoginFromText(login) ?? login;
}

function getDreaminaErrorMessage(err: any, fallback: string) {
  return err?.message || err?.data?.message || fallback;
}

function getLoginPollingInterval() {
  const interval = activeLogin.value?.pollInterval;
  if (!interval || !Number.isFinite(interval)) return 1500;
  return Math.min(Math.max(interval * 1000, 1000), 5000);
}

async function fetchStatus(options: { silent?: boolean } = {}) {
  if (!options.silent) statusLoading.value = true;
  try {
    const { data } = await axios.post("/setting/dreamina/status", undefined, dreaminaStatusAxiosConfig);
    status.value = data;
    if (data?.login) {
      const normalizedLogin = normalizeDreaminaLogin(data.login);
      loginResult.value = normalizedLogin;
      if (normalizedLogin?.state === "success") {
        loginConfirmed.value = true;
        void refreshCreditSilently();
      }
      if (normalizedLogin?.state === "success" || normalizedLogin?.state === "failed") stopLoginPolling();
    }
    return data as DreaminaStatus;
  } catch (err: any) {
    if (!options.silent) {
      window.$message.error(getDreaminaErrorMessage(err, "获取即梦状态失败"));
    }
    return null;
  } finally {
    if (!options.silent) statusLoading.value = false;
  }
}

async function refreshPanel() {
  await Promise.all([fetchStatus(), fetchQueueStatus(false)]);
}

function handleLoginState(login?: DreaminaLogin | null) {
  const normalizedLogin = normalizeDreaminaLogin(login);
  if (!normalizedLogin) return;
  if (normalizedLogin.state === "success") {
    stopLoginPolling();
    loginDialogVisible.value = false;
    loginConfirmed.value = true;
    loginResult.value = normalizedLogin;
    window.$message.success(normalizedLogin.message || "即梦登录成功");
    fetchStatus({ silent: true });
  }
  if (normalizedLogin.state === "failed") {
    stopLoginPolling();
    window.$message.error(normalizedLogin.message || normalizedLogin.stderr || normalizedLogin.stdout || "即梦登录失败");
  }
}

function markLoginSuccess(message = "即梦登录成功") {
  stopLoginPolling();
  loginDialogVisible.value = false;
  loginResult.value = {
    ...(activeLogin.value ?? {
      id: "",
      startTime: Date.now(),
    }),
    state: "success",
    message,
  };
  loginConfirmed.value = true;
  window.$message.success(message);
  fetchStatus({ silent: true });
}

async function runStatusAction(action: "install" | "update" | "uninstall") {
  if (actionLoading[action]) return;
  actionLoading[action] = true;
  try {
    const { data } = await axios.post(`/setting/dreamina/${action}`, undefined, dreaminaLongCommandAxiosConfig);
    status.value = data;
    window.$message.success(action === "install" ? "安装完成" : action === "update" ? "更新完成" : "卸载完成");
    emit("refreshed");
    await fetchStatus();
  } catch (err: any) {
    window.$message.error(getDreaminaErrorMessage(err, "操作失败"));
  } finally {
    actionLoading[action] = false;
  }
}

async function startLogin() {
  if (loginLoading.value || isLoggedIn.value) return;
  loginLoading.value = true;
  loginDialogVisible.value = true;
  try {
    const { data } = await axios.post("/setting/dreamina/login", undefined, dreaminaCommandAxiosConfig);
    loginResult.value = data;
    handleLoginState(data);
    const normalizedState = normalizeDreaminaLogin(data)?.state;
    if (normalizedState !== "success" && normalizedState !== "failed") {
      startLoginPolling();
      await fetchStatus({ silent: true });
    }
  } catch (err: any) {
    window.$message.error(getDreaminaErrorMessage(err, "即梦登录启动失败，请确认 CLI 已安装并重试"));
  } finally {
    loginLoading.value = false;
  }
}

function startLoginPolling() {
  stopLoginPolling();
  loginPollCount = 0;
  loginTimer = setInterval(async () => {
    const data = await fetchStatus({ silent: true });
    handleLoginState(data?.login);
    loginPollCount += 1;
    if (activeLogin.value?.state === "device" && loginPollCount % 5 === 0) {
      await verifyLoginByCredit({ silent: true });
    }
  }, getLoginPollingInterval());
}

function stopLoginPolling() {
  if (!loginTimer) return;
  clearInterval(loginTimer);
  loginTimer = null;
}

async function openDeviceLoginUrl() {
  if (!deviceLoginUrl.value) return;
  if (isElectron.value) {
    await fetch(`toonflow://openurlwithbrowser?url=${encodeURIComponent(deviceLoginUrl.value)}`);
    return;
  }
  window.open(deviceLoginUrl.value, "_blank", "noopener,noreferrer");
}

async function copyUserCode() {
  const code = activeLogin.value?.userCode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    window.$message.success("授权码已复制");
  } catch {
    window.$message.error("复制失败，请手动复制授权码");
  }
}

async function checkLoginOnce() {
  const data = await fetchStatus();
  handleLoginState(data?.login);
  const state = normalizeDreaminaLogin(data?.login)?.state;
  if (state === "success" || state === "failed") return;
  await verifyLoginByCredit();
}

async function verifyLoginByCredit(options: { silent?: boolean } = {}) {
  try {
    const { data } = await axios.post("/setting/dreamina/userCredit", undefined, dreaminaCommandAxiosConfig);
    creditRaw.value = data?.raw || creditRaw.value;
    markLoginSuccess("即梦登录成功");
    return true;
  } catch (err: any) {
    if (!options.silent) {
      window.$message.warning(getDreaminaErrorMessage(err, "暂未检测到登录成功，请稍后再试"));
    }
    return false;
  }
}

async function refreshCreditSilently() {
  if (creditRaw.value || creditAutoLoading.value) return;
  creditAutoLoading.value = true;
  try {
    const { data } = await axios.post("/setting/dreamina/userCredit", undefined, dreaminaCommandAxiosConfig);
    creditRaw.value = data?.raw || "";
  } catch {
    creditRaw.value = "";
  } finally {
    creditAutoLoading.value = false;
  }
}

async function logout() {
  if (logoutLoading.value) return;
  logoutLoading.value = true;
  try {
    await axios.post("/setting/dreamina/logout", undefined, dreaminaCommandAxiosConfig);
    window.$message.success("已退出即梦登录");
    loginResult.value = null;
    loginConfirmed.value = false;
    creditRaw.value = "";
    await fetchStatus();
  } catch (err: any) {
    window.$message.error(getDreaminaErrorMessage(err, "退出登录失败"));
  } finally {
    logoutLoading.value = false;
  }
}

async function queryCredit() {
  if (creditLoading.value) return;
  creditLoading.value = true;
  try {
    const { data } = await axios.post("/setting/dreamina/userCredit", undefined, dreaminaCommandAxiosConfig);
    rawDialogTitle.value = "即梦余额";
    rawDialogContent.value = data?.raw || "";
    creditRaw.value = data?.raw || "";
    rawDialogVisible.value = true;
  } catch (err: any) {
    window.$message.error(getDreaminaErrorMessage(err, "余额查询失败"));
  } finally {
    creditLoading.value = false;
  }
}

async function refreshModels() {
  if (refreshModelsLoading.value) return;
  refreshModelsLoading.value = true;
  try {
    const { data } = await axios.post("/setting/dreamina/refreshModels", undefined, dreaminaLongCommandAxiosConfig);
    window.$message.success(`已刷新 ${Array.isArray(data) ? data.length : 0} 个即梦模型`);
    emit("refreshed");
    await Promise.all([fetchStatus(), fetchQueueStatus(false)]);
  } catch (err: any) {
    window.$message.error(getDreaminaErrorMessage(err, "刷新模型失败"));
  } finally {
    refreshModelsLoading.value = false;
  }
}

function normalizeQueueStatus(data: Partial<DreaminaQueueStatusData> | null | undefined): DreaminaQueueStatusData {
  return {
    summary: Array.isArray(data?.summary) ? data.summary : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
  };
}

async function fetchQueueStatus(showRaw = true) {
  if (queueLoading.value) return;
  queueLoading.value = true;
  try {
    const { data } = await axios.post("/setting/dreamina/queueStatus", undefined, dreaminaCommandAxiosConfig);
    queueStatus.value = normalizeQueueStatus(data);
    if (showRaw) {
      rawDialogTitle.value = "即梦队列状态";
      rawDialogContent.value = formatBlock(data);
      rawDialogVisible.value = true;
    }
    return queueStatus.value;
  } catch (err: any) {
    queueStatus.value = createEmptyDreaminaQueueStatus();
    window.$message.error(getDreaminaErrorMessage(err, "队列状态查询失败"));
  } finally {
    queueLoading.value = false;
  }
}

async function saveQueueConfig(group: DreaminaModelGroup) {
  if (queueConfigSaving[group.key]) return;
  const form = queueConfigForms[group.key];
  const representative = group.models[0];
  if (!form || !representative) return;
  if (!Number.isInteger(form.maxConcurrent) || form.maxConcurrent < 1 || form.maxConcurrent > 20) {
    window.$message.error("并发任务数必须是 1 到 20 的整数");
    return;
  }
  if (!Number.isInteger(form.maxWaitHours) || form.maxWaitHours < 1 || form.maxWaitHours > 72) {
    window.$message.error("最大等待时间必须是 1 到 72 的整数小时");
    return;
  }

  queueConfigSaving[group.key] = true;
  try {
    await axios.post("/setting/vendorConfig/upVendorModel", {
      id: "dreamina",
      modelName: representative.modelName,
      model: {
        ...representative,
        queueConfig: {
          ...(representative.queueConfig || {}),
          maxConcurrent: form.maxConcurrent,
          maxWaitHours: form.maxWaitHours,
        },
      },
    });
    window.$message.success(`${group.label} 队列设置已保存`);
    emit("refreshed");
    await fetchQueueStatus(false);
  } catch (err: any) {
    window.$message.error(getDreaminaErrorMessage(err, "队列设置保存失败"));
  } finally {
    queueConfigSaving[group.key] = false;
  }
}

async function listTask() {
  if (taskLoading.value) return;
  taskLoading.value = true;
  try {
    const { data } = await axios.post("/setting/dreamina/listTask", { args: [] }, dreaminaLongCommandAxiosConfig);
    rawDialogTitle.value = "即梦历史任务";
    rawDialogContent.value = data?.raw || "";
    rawDialogVisible.value = true;
  } catch (err: any) {
    window.$message.error(getDreaminaErrorMessage(err, "历史任务查询失败"));
  } finally {
    taskLoading.value = false;
  }
}

async function queryResult() {
  if (queryLoading.value) return;
  const submitId = querySubmitId.value.trim();
  if (!submitId) {
    window.$message.error("请输入 submitId");
    return;
  }
  queryLoading.value = true;
  try {
    const { data } = await axios.post(
      "/setting/dreamina/queryResult",
      {
        submitId,
        download: queryDownload.value,
      },
      dreaminaLongCommandAxiosConfig,
    );
    queryResultRaw.value = data?.raw || "";
    queryDownloadDir.value = data?.downloadDir || "";
  } catch (err: any) {
    window.$message.error(getDreaminaErrorMessage(err, "任务结果查询失败"));
  } finally {
    queryLoading.value = false;
  }
}

onMounted(() => {
  void refreshPanel();
});

onBeforeUnmount(() => {
  stopLoginPolling();
});
</script>

<style lang="scss" scoped>
.dreaminaPanel {
  border: 1px solid var(--td-component-border, #e7e7e7);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 14px;
  background: var(--td-bg-color-container, #fff);
}

.dreaminaHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title {
  font-size: 16px;
  font-weight: 700;
}

.subTitle {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary, #888);
}

.statusTags,
.actionRow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.infoGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.infoItem {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 6px;
  background: var(--td-bg-color-secondarycontainer, #f7f7f7);

  span {
    color: var(--td-text-color-secondary, #777);
    font-size: 12px;
  }

  code {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
}

.panelSection {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--td-component-stroke, #e7e7e7);
}

.sectionHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.sectionTitle {
  font-size: 14px;
  font-weight: 700;
}

.sectionDescription {
  margin-top: 2px;
  color: var(--td-text-color-secondary, #777);
  font-size: 12px;
}

.queueStats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 0;
}

.queueStat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--td-bg-color-secondarycontainer, #f7f7f7);

  span {
    color: var(--td-text-color-secondary, #777);
    font-size: 12px;
  }

  strong {
    font-size: 16px;
  }
}

.queueList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.queueItem {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) repeat(5, auto);
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--td-bg-color-secondarycontainer, #f7f7f7);
  font-size: 12px;
}

.queueItemMain {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--td-text-color-secondary, #777);
  }
}

.queueTasks {
  margin-top: 10px;
}

.queueTask {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--td-component-stroke, #e7e7e7);
  font-size: 12px;

  &:last-child {
    border-bottom: 0;
  }

  > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  span {
    color: var(--td-text-color-secondary, #777);
  }
}

.queueConfigGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.queueConfigCard {
  padding: 12px;
  border: 1px solid var(--td-component-stroke, #e7e7e7);
  border-radius: 6px;
}

.queueConfigTitle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;

  span {
    color: var(--td-text-color-secondary, #777);
    font-size: 12px;
  }
}

.queueConfigFields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;

  label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
  }

  span {
    color: var(--td-text-color-secondary, #777);
    font-size: 12px;
  }
}

@media (max-width: 900px) {
  .queueConfigGrid,
  .queueConfigFields {
    grid-template-columns: 1fr;
  }

  .queueItem,
  .queueTask {
    grid-template-columns: 1fr;
  }
}

pre {
  max-height: 320px;
  overflow: auto;
  padding: 10px;
  border-radius: 6px;
  background: #111;
  color: #f5f5f5;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}

.loginDialog {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.deviceLogin {
  display: flex;
  flex-direction: column;
  gap: 12px;

  ol {
    margin: 0;
    padding-left: 20px;
    color: var(--td-text-color-secondary, #777);
    line-height: 1.8;
  }
}

.deviceTitle {
  font-size: 16px;
  font-weight: 700;
}

.codeBox {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer, #f7f7f7);

  span {
    color: var(--td-text-color-secondary, #777);
  }

  strong {
    font-size: 22px;
    letter-spacing: 2px;
    word-break: break-all;
  }
}

.expireText {
  color: var(--td-text-color-secondary, #777);
  font-size: 12px;
}

.loginActions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.qrWrap {
  display: flex;
  justify-content: center;

  img {
    width: 240px;
    height: 240px;
    object-fit: contain;
  }
}

.rawOutput {
  min-height: 260px;
}

.downloadDir {
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary, #777);
}

.queryActions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
</style>
