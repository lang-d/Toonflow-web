import axios from "@/utils/axios";
import type { AsyncTaskEnvelope } from "@/types/api";

type ApiEnvelope<T> = {
  code?: number;
  data: T;
  message?: string;
};

function unwrapData<T>(response: ApiEnvelope<T> | T): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as ApiEnvelope<T>).data;
  }
  return response as T;
}

export type MusicPlanMode = "concept" | "project" | "episode";
export type MusicEntityState = "complete" | string;
export type MusicCueState = "ready" | string;
export type MusicCueAssetState = "generating" | "complete" | "failed" | string;
export type MusicStage =
  | "idle"
  | "discussing"
  | "bible_generating"
  | "bible_reviewing"
  | "plan_generating"
  | "plan_reviewing"
  | "cue_prompting"
  | "audio_generating"
  | "completed"
  | "failed"
  | string;

export type MusicTaskEnvelope = AsyncTaskEnvelope & {
  targetType: "musicBible" | "musicPlan" | "musicPrompt" | "musicCueAsset" | "projectContextPack" | string;
};

export interface MusicBible {
  id: number;
  projectId: number;
  version?: number;
  state?: MusicEntityState;
  title?: string | null;
  content?: string | null;
  styleProfileJson?: string | Record<string, unknown> | null;
  styleProfile?: Record<string, unknown> | null;
  createTime?: number | string | null;
  updateTime?: number | string | null;
  [key: string]: unknown;
}

export interface MusicCueAsset {
  id: number;
  cueId: number;
  version?: number;
  assetsId?: number | null;
  childAssetId?: number | null;
  prompt?: string | null;
  compiledPromptJson?: string | Record<string, unknown> | null;
  compiledPrompt?: Record<string, unknown> | null;
  model?: string | null;
  state?: MusicCueAssetState;
  errorReason?: string | null;
  selected?: number | boolean;
  src?: string | null;
  url?: string | null;
  audioUrl?: string | null;
  originalUrl?: string | null;
  downloadUrl?: string | null;
  media?: unknown;
  [key: string]: unknown;
}

export interface MusicCue {
  id: number;
  projectId: number;
  scriptId?: number | null;
  planId: number;
  cueKey?: string | null;
  cueType?: string | null;
  title?: string | null;
  durationSec?: number | null;
  state?: MusicCueState;
  startRefJson?: string | Record<string, unknown> | null;
  endRefJson?: string | Record<string, unknown> | null;
  musicSpecJson?: string | Record<string, unknown> | null;
  startRef?: Record<string, unknown> | null;
  endRef?: Record<string, unknown> | null;
  musicSpec?: Record<string, unknown> | null;
  assets: MusicCueAsset[];
  [key: string]: unknown;
}

export interface MusicPlan {
  id: number;
  projectId: number;
  scriptId?: number | null;
  mode?: MusicPlanMode | string;
  bibleId?: number | null;
  version?: number;
  state?: MusicEntityState;
  title?: string | null;
  content?: string | null;
  cueSheetJson?: string | Record<string, unknown> | unknown[] | null;
  cueSheet?: Record<string, unknown> | unknown[] | null;
  cues?: MusicCue[];
  createTime?: number | string | null;
  updateTime?: number | string | null;
  [key: string]: unknown;
}

export interface CompiledMusicPrompt {
  cueId: number;
  model: string;
  prompt: string;
  compiledPromptJson?: string | Record<string, unknown> | null;
  compiledPrompt?: Record<string, unknown> | null;
}

export interface MusicStageActiveTask {
  taskId: string;
  legacyTaskId?: number | string | null;
  status?: string;
  targetType?: string;
  targetId?: number | string | null;
  [key: string]: unknown;
}

export interface MusicStageState {
  stage: MusicStage;
  mode: MusicPlanMode | string;
  projectId: number;
  scriptId?: number | null;
  isolationKey?: string;
  projectMemoryKey?: string;
  episodeMemoryKey?: string;
  latestBible?: MusicBible | null;
  latestPlan?: MusicPlan | null;
  cueCount?: number;
  assetCount?: number;
  activeTasks?: MusicStageActiveTask[];
  [key: string]: unknown;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonAny(value: unknown): Record<string, unknown> | unknown[] {
  if (!value) return {};
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeMusicCueAsset(asset: any): MusicCueAsset {
  return {
    ...(asset ?? {}),
    compiledPrompt: parseJsonObject(asset?.compiledPrompt ?? asset?.compiledPromptJson),
  };
}

export function normalizeMusicCue(cue: any): MusicCue {
  return {
    ...(cue ?? {}),
    startRef: parseJsonObject(cue?.startRef ?? cue?.startRefJson),
    endRef: parseJsonObject(cue?.endRef ?? cue?.endRefJson),
    musicSpec: parseJsonObject(cue?.musicSpec ?? cue?.musicSpecJson),
    assets: Array.isArray(cue?.assets) ? cue.assets.map(normalizeMusicCueAsset) : [],
  };
}

export function normalizeMusicBible(bible: any): MusicBible {
  return {
    ...(bible ?? {}),
    styleProfile: parseJsonObject(bible?.styleProfile ?? bible?.styleProfileJson),
  };
}

export function normalizeMusicPlan(plan: any): MusicPlan {
  return {
    ...(plan ?? {}),
    cueSheet: parseJsonAny(plan?.cueSheet ?? plan?.cueSheetJson),
    cues: Array.isArray(plan?.cues) ? plan.cues.map(normalizeMusicCue) : undefined,
  };
}

export function normalizeMusicStageState(state: any): MusicStageState {
  return {
    ...(state ?? {}),
    latestBible: state?.latestBible ? normalizeMusicBible(state.latestBible) : null,
    latestPlan: state?.latestPlan ? normalizeMusicPlan(state.latestPlan) : null,
    activeTasks: Array.isArray(state?.activeTasks) ? state.activeTasks : [],
  };
}

export function normalizeCompiledMusicPrompt(prompt: any): CompiledMusicPrompt {
  return {
    ...(prompt ?? {}),
    cueId: Number(prompt?.cueId ?? 0),
    model: String(prompt?.model ?? ""),
    prompt: String(prompt?.prompt ?? ""),
    compiledPrompt: parseJsonObject(prompt?.compiledPrompt ?? prompt?.compiledPromptJson),
  };
}

export function generateMusicBible(params: { projectId: number; instruction?: string }) {
  return axios.post("/production/music/bible/generate", params).then((response) => unwrapData<MusicTaskEnvelope>(response));
}

export function getMusicStageState(params: { projectId: number; mode: MusicPlanMode; scriptId?: number }) {
  return axios
    .post("/production/music/stage/state", params)
    .then((response) => unwrapData<MusicStageState>(response))
    .then(normalizeMusicStageState);
}

export function reviewMusicBible(params: { projectId: number; bibleId: number }) {
  return axios.post("/production/music/bible/review", params).then((response) => unwrapData<MusicTaskEnvelope>(response));
}

export function listMusicBibles(params: { projectId: number; state?: string }) {
  return axios
    .post("/production/music/bible/list", params)
    .then((response) => unwrapData<{ bibles?: MusicBible[] } | MusicBible[]>(response))
    .then((data) => (Array.isArray(data) ? data : data.bibles ?? []).map(normalizeMusicBible));
}

export function getMusicBibleDetail(params: { projectId: number; bibleId: number }) {
  return axios
    .post("/production/music/bible/detail", params)
    .then((response) => unwrapData<{ bible?: MusicBible } | MusicBible>(response))
    .then((data) => normalizeMusicBible((data as any)?.bible ?? data));
}

export function generateMusicPlan(params: {
  projectId: number;
  mode: MusicPlanMode;
  bibleId?: number;
  scriptId?: number;
  instruction?: string;
}) {
  return axios.post("/production/music/plan/generate", params).then((response) => unwrapData<MusicTaskEnvelope>(response));
}

export function reviewMusicPlan(params: { projectId: number; planId: number }) {
  return axios.post("/production/music/plan/review", params).then((response) => unwrapData<MusicTaskEnvelope>(response));
}

export function listMusicPlans(params: { projectId: number; scriptId?: number; mode?: MusicPlanMode; state?: string }) {
  return axios
    .post("/production/music/plan/list", params)
    .then((response) => unwrapData<{ plans?: MusicPlan[] } | MusicPlan[]>(response))
    .then((data) => (Array.isArray(data) ? data : data.plans ?? []).map(normalizeMusicPlan));
}

export function getMusicPlanDetail(params: { projectId: number; planId: number; includeCues?: boolean }) {
  return axios
    .post("/production/music/plan/detail", params)
    .then((response) => unwrapData<{ plan?: MusicPlan } | MusicPlan>(response))
    .then((data) => normalizeMusicPlan((data as any)?.plan ?? data));
}

export function listMusicCues(params: { projectId: number; scriptId?: number; planId?: number }) {
  return axios
    .post("/production/music/cue/list", params)
    .then((response) => unwrapData<{ cues?: MusicCue[] } | MusicCue[]>(response))
    .then((data) => (Array.isArray(data) ? data : data.cues ?? []).map(normalizeMusicCue));
}

export function compileMusicCuePrompt(params: { projectId: number; cueId: number; model: string; instruction?: string }) {
  return axios.post("/production/music/cue/compilePrompt", params).then((response) => unwrapData<MusicTaskEnvelope>(response));
}

export function reviewMusicCuePrompt(params: {
  projectId: number;
  cueId: number;
  model: string;
  prompt: string;
  compiledPromptJson?: Record<string, unknown>;
}) {
  return axios.post("/production/music/cue/reviewPrompt", params).then((response) => unwrapData<MusicTaskEnvelope>(response));
}

export function generateMusicCueAudio(params: { projectId: number; cueId: number; model: string; instruction?: string; select?: boolean }) {
  return axios.post("/production/music/cue/generate", params).then((response) => unwrapData<MusicTaskEnvelope>(response));
}

export function selectMusicCueAsset(params: { projectId: number; cueId: number; musicCueAssetId: number }) {
  return axios
    .post("/production/music/cue/selectAsset", params)
    .then((response) => unwrapData<{ musicCueAsset?: MusicCueAsset } | MusicCueAsset>(response))
    .then((data) => normalizeMusicCueAsset((data as any)?.musicCueAsset ?? data));
}
