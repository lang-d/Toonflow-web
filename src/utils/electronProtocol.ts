export type DirectoryPurpose = "workspace" | "projectImport";

export interface DirectorySelectionResult {
  ok: boolean;
  path: string | null;
  purpose?: DirectoryPurpose;
  error?: string;
}

function isElectronRuntime() {
  return /Electron/i.test(navigator.userAgent);
}

async function callToonflowProtocol<T>(url: string): Promise<T> {
  if (!isElectronRuntime()) throw new Error($t("workspace.desktopOnly"));
  const response = await fetch(url);
  return response.json();
}

export async function selectDirectory(purpose: DirectoryPurpose): Promise<DirectorySelectionResult> {
  return callToonflowProtocol<DirectorySelectionResult>(`toonflow://selectDirectory?purpose=${encodeURIComponent(purpose)}`);
}

export async function openDirectory(path: string) {
  const result = await callToonflowProtocol<{ ok: boolean; error?: string }>(
    `toonflow://openDirectory?path=${encodeURIComponent(path)}`,
  );
  if (!result.ok) throw new Error(result.error || $t("workspace.openDirectoryFailed"));
  return result;
}

export async function restartApplication() {
  const result = await callToonflowProtocol<{ ok: boolean; error?: string; message?: string }>("toonflow://appRestart");
  if (!result.ok) throw new Error(result.error || result.message || $t("workspace.restartFailed"));
  return result;
}
