const RECOVERY_KEY = "toonflow:module-recovery";
const ERROR_KEY = "toonflow:module-load-error";
const RECOVERY_TTL = 2 * 60 * 1000;
const RETRY_DELAYS = [300, 800, 1500];

export interface ModuleRecoveryState {
  route: string;
  attempts: number;
  timestamp: number;
}

export interface ModuleLoadErrorState extends ModuleRecoveryState {
  message: string;
  module?: string;
}

const handledErrors = new WeakSet<object>();
let lastHandled: { signature: string; timestamp: number } | null = null;
let activeRecoverySignature: string | null = null;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error ?? "");
}

function normalizeRoute(route?: string) {
  if (route?.startsWith("/") && route !== "/module-load-error") return route;
  const hashRoute = window.location.hash.replace(/^#/, "");
  return hashRoute.startsWith("/") && hashRoute !== "/module-load-error" ? hashRoute : "/project";
}

function readRecoveryState(): ModuleRecoveryState | null {
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as ModuleRecoveryState;
    if (!state.route || Date.now() - state.timestamp > RECOVERY_TTL) {
      sessionStorage.removeItem(RECOVERY_KEY);
      return null;
    }
    return state;
  } catch {
    sessionStorage.removeItem(RECOVERY_KEY);
    return null;
  }
}

function extractModuleUrl(message: string) {
  const match = message.match(/https?:\/\/[^\s)]+|\/(?:src|assets)\/[^\s)]+/);
  return match?.[0];
}

function toProbeUrl(moduleUrl?: string) {
  if (!moduleUrl) return "";
  try {
    return new URL(moduleUrl, window.location.origin).toString();
  } catch {
    return "";
  }
}

async function canLoadModule(moduleUrl?: string) {
  const probeUrl = toProbeUrl(moduleUrl);
  if (!probeUrl) return false;
  try {
    const response = await fetch(probeUrl, {
      cache: "no-store",
      credentials: "same-origin",
    });
    return response.ok;
  } catch {
    return false;
  }
}

function navigateToHash(route: string) {
  const url = new URL(window.location.href);
  url.hash = route;
  window.location.replace(url.toString());
}

function reloadRoute(route: string) {
  sessionStorage.removeItem(ERROR_KEY);
  sessionStorage.removeItem(RECOVERY_KEY);
  const url = new URL(window.location.href);
  url.hash = route;
  window.location.replace(url.toString());
  window.setTimeout(() => window.location.reload(), 0);
}

function showModuleLoadError(errorState: ModuleLoadErrorState) {
  sessionStorage.setItem(ERROR_KEY, JSON.stringify(errorState));
  navigateToHash("/module-load-error");
}

async function recoverDynamicImportFailure(signature: string, route: string, errorState: ModuleLoadErrorState) {
  if (activeRecoverySignature === signature) return;
  activeRecoverySignature = signature;
  try {
    for (const delay of RETRY_DELAYS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (!errorState.module || (await canLoadModule(errorState.module))) {
        reloadRoute(route);
        return;
      }
    }
    showModuleLoadError(errorState);
  } finally {
    if (activeRecoverySignature === signature) {
      activeRecoverySignature = null;
    }
  }
}

export function isDynamicImportFailure(error: unknown) {
  const message = getErrorMessage(error);
  return [
    /Failed to fetch dynamically imported module/i,
    /Importing a module script failed/i,
    /ChunkLoadError/i,
    /Loading chunk [\w-]+ failed/i,
    /Unable to preload CSS/i,
    /Failed to load module script/i,
  ].some((pattern) => pattern.test(message));
}

export function handleDynamicImportFailure(error: unknown, targetRoute?: string): boolean {
  if (!isDynamicImportFailure(error)) return false;

  const route = normalizeRoute(targetRoute);
  const message = getErrorMessage(error);
  const signature = `${route}:${message}`;
  if (lastHandled?.signature === signature && Date.now() - lastHandled.timestamp < 2_000) {
    return true;
  }

  if (error && typeof error === "object") {
    if (handledErrors.has(error)) return true;
    handledErrors.add(error);
  }
  lastHandled = { signature, timestamp: Date.now() };

  const previous = readRecoveryState();
  const attempts = previous?.route === route ? previous.attempts + 1 : 1;
  const state: ModuleRecoveryState = {
    route,
    attempts,
    timestamp: Date.now(),
  };
  sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(state));
  sessionStorage.removeItem(ERROR_KEY);

  const errorState: ModuleLoadErrorState = {
    ...state,
    message: message || "Page module failed to load",
    module: extractModuleUrl(message),
  };
  void recoverDynamicImportFailure(signature, route, errorState);
  return true;
}

export function getModuleLoadError(): ModuleLoadErrorState | null {
  try {
    const raw = sessionStorage.getItem(ERROR_KEY);
    return raw ? (JSON.parse(raw) as ModuleLoadErrorState) : null;
  } catch {
    return null;
  }
}

export function hasModuleLoadError() {
  return sessionStorage.getItem(ERROR_KEY) !== null;
}

export function clearModuleRecovery(route?: string) {
  const state = readRecoveryState();
  if (!route || !state || state.route === route) {
    sessionStorage.removeItem(RECOVERY_KEY);
  }
  sessionStorage.removeItem(ERROR_KEY);
}
