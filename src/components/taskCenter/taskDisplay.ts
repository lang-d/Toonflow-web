import type { RuntimeTask, TaskDomain } from "@/stores/taskCenter";
import type { TaskStatus } from "@/types/api";

const domainKeys: Record<TaskDomain, string> = {
  flowImage: "workbench.globalTaskCenter.domain.flowImage",
  assetImage: "workbench.globalTaskCenter.domain.assetImage",
  assetPrompt: "workbench.globalTaskCenter.domain.assetPrompt",
  storyboardImage: "workbench.globalTaskCenter.domain.storyboardImage",
  video: "workbench.globalTaskCenter.domain.video",
  videoPrompt: "workbench.globalTaskCenter.domain.videoPrompt",
  audioBind: "workbench.globalTaskCenter.domain.audioBind",
  novelEvent: "workbench.globalTaskCenter.domain.novelEvent",
  scriptAssetExtraction: "workbench.globalTaskCenter.domain.scriptAssetExtraction",
  media: "workbench.globalTaskCenter.domain.media",
};

const statusKeys: Partial<Record<TaskStatus, string>> = {
  pending: "workbench.globalTaskCenter.status.pending",
  queued: "workbench.globalTaskCenter.status.queued",
  submitting: "workbench.globalTaskCenter.status.submitting",
  processing: "workbench.globalTaskCenter.status.processing",
};

export function getTaskDomainKey(domain: TaskDomain) {
  return domainKeys[domain];
}

export function getTaskStatusKey(status: TaskStatus) {
  return statusKeys[status] ?? "workbench.globalTaskCenter.status.processing";
}

export function getTaskStatusTheme(status: TaskStatus): "default" | "primary" | "warning" {
  if (status === "pending" || status === "queued") return "warning";
  if (status === "submitting") return "primary";
  return "default";
}

export function getTaskTargetLabel(task: RuntimeTask) {
  const targetType = task.targetType ? `${task.targetType} ` : "";
  return `${targetType}#${task.targetId}`;
}
