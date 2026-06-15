import type { RuntimeTask } from "@/stores/taskCenter";

export type WorkspaceMode = "legacy" | "workspace";
export type WorkspaceOperationKind = "migration" | "project-snapshot" | "project-import";

export interface StorageStatus {
  mode: WorkspaceMode;
  workspacePath: string;
  appDataPath?: string;
  profileDatabasePath?: string;
  workspaceDatabasePath?: string;
  projectCount: number;
  totalFiles: number;
  totalBytes: number;
  maintenance: boolean;
  activeTaskCount: number;
  restartRequired: boolean;
  selectionRequired: boolean;
}

export interface LegacyStorageCandidate {
  path: string;
  databasePath: string;
  healthy: boolean;
  message: string;
  projectCount: number;
  mediaFiles: number;
  totalFiles: number;
  totalBytes: number;
  current: boolean;
}

export interface WorkspaceTargetValidation {
  targetPath: string;
  freeBytes: number;
  requiredBytes: number;
}

export interface WorkspaceOperation {
  kind: WorkspaceOperationKind;
  taskId: string;
  projectId: number;
  directory?: string;
  sourcePath?: string;
  targetPath?: string;
  createdAt: number;
}

export interface WorkspaceTaskRuntime {
  operation: WorkspaceOperation;
  task?: RuntimeTask;
}

export interface PortableImportResult {
  projectId?: number;
  importedAsCopy?: boolean;
  directory?: string;
  warnings?: string[];
}
