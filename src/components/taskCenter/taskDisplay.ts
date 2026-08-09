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

/**
 * Video providers do not always expose a trustworthy percentage. Keep the
 * backend phase visible instead of inventing a progress value in that case.
 */
export function getTaskPhaseLabel(phase?: string | null) {
  const labels: Record<string, string> = {
    remote_unavailable: "等待云端实例恢复",
    remote_unavailable_reconcile: "正在确认云端实例状态",
    remote_reconcile: "正在确认云端任务是否仍存在",
  };
  return phase ? labels[phase] ?? phase : "";
}

export function getTaskTargetLabel(task: RuntimeTask) {
  const musicLabels: Record<string, string> = {
    musicBible: "配乐方向",
    musicPlan: "配乐规划",
    musicPrompt: "配乐 Prompt 编译",
    musicLyrics: "配乐歌词",
    musicCueAsset: "Cue 音频生成",
    musicLibraryVersion: "项目音乐生成",
  };
  if (task.targetType && musicLabels[task.targetType]) return `${musicLabels[task.targetType]} #${task.targetId}`;
  const targetType = task.targetType ? `${task.targetType} ` : "";
  return `${targetType}#${task.targetId}`;
}
