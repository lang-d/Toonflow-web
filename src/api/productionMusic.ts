import axios from "@/utils/axios";
import type { AsyncTaskEnvelope } from "@/types/api";

type ApiEnvelope<T> = { code?: number; data: T; message?: string };
const unwrap = <T>(value: ApiEnvelope<T> | T): T => value && typeof value === "object" && "data" in value ? (value as ApiEnvelope<T>).data : (value as T);
const parseObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  try { const parsed = typeof value === "string" ? JSON.parse(value) : null; return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
};
const parseList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  try { const parsed = typeof value === "string" ? JSON.parse(value) : null; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
};

export type MusicPlanMode = "concept" | "project" | "episode";
export type MusicWorkType = "theme_song" | "opening_song" | "ending_song" | "insert_song" | "score_theme" | "source_music" | "stinger";
export type MusicEditionType = "master" | "narrative_variant" | "arrangement" | "vocal_variant" | "instrumental" | "short_edit" | "custom";
export type MusicUsageMode = "reuse" | "new" | "silence";
export type MusicReviewStatus = "unreviewed" | "passed" | "warning" | "blocked" | string;
export type MusicPromptMode = "generic" | "modelSpecific";
export type MusicDownloadTargetType = "libraryVersion" | "cueAsset";
export type MusicTaskTargetType = "musicBible" | "musicPlan" | "musicPrompt" | "musicLyrics" | "musicCueAsset" | "musicLibraryVersion";
export type MusicTaskEnvelope = AsyncTaskEnvelope & { targetType: "musicBible" | "musicPlan" | "musicPrompt" | "musicLyrics" | "musicCueAsset" | "musicLibraryVersion" | string };

export interface MusicModelCapabilities { durationRange?: { min?: number; max?: number }; durationControl?: "targetOnly" | "exact" | string; vocal?: boolean | "optional"; lyrics?: boolean | "optional"; referenceAudio?: boolean | "optional"; loop?: boolean | "optional"; outputFormats?: string[]; }
export interface MusicBible { id: number; projectId: number; version?: number; state?: string; title?: string | null; content?: string | null; styleProfile?: Record<string, unknown>; styleProfileJson?: unknown; [key: string]: unknown; }
export interface MusicLibraryVersion { id: number; editionId: number; version?: number; state?: string; errorReason?: string | null; assetsId?: number | null; childAssetId?: number | null; promptVersionId?: number | null; lyricsVersionId?: number | null; model?: string | null; generationConfig?: Record<string, unknown>; generationDurationSec?: number | null; effectiveMusicDurationSec?: number | null; derivationType?: string; sourceVersionId?: number | null; trimStartMs?: number | null; trimEndMs?: number | null; fadeInMs?: number | null; fadeOutMs?: number | null; audioAsset?: unknown; media?: unknown; src?: string | null; url?: string | null; audioUrl?: string | null; [key: string]: unknown; }
export interface MusicLyricsVersion { id: number; editionId: number; version?: number; title?: string | null; language?: string | null; content: string; state?: string; reviewStatus?: MusicReviewStatus; basedOnId?: number | null; [key: string]: unknown; }
export interface MusicPromptVersion { id: number; targetType: "cue" | "edition"; cueId?: number | null; editionId?: number | null; version?: number; promptMode: MusicPromptMode; model: string | null; profileSource?: string | null; prompt: string; negativePrompt?: string | null; generationConfig?: Record<string, unknown>; generationConfigJson?: unknown; lyricsVersionId?: number | null; reviewStatus?: MusicReviewStatus; state?: string; basedOnId?: number | null; [key: string]: unknown; }
export interface MusicLibraryEdition { id: number; libraryItemId: number; editionKey: string; editionType: MusicEditionType; title?: string | null; narrativePhase?: string | null; vocalMode?: "instrumental" | "vocal" | "optional" | string; language?: string | null; state?: string; selectedVersionId?: number | null; parentEditionId?: number | null; musicSpec?: Record<string, unknown>; versions?: MusicLibraryVersion[]; lyricsVersions?: MusicLyricsVersion[]; [key: string]: unknown; }
export interface MusicLibraryItem { id: number; projectId: number; bibleId?: number | null; workKey: string; workType: MusicWorkType; title?: string | null; narrativeRole?: string | null; reuseScope?: string; state?: string; relatedItemId?: number | null; relationType?: string | null; editions: MusicLibraryEdition[]; [key: string]: unknown; }
export interface MusicCueBinding { cueId: number; usageMode: MusicUsageMode; editionId?: number | null; libraryVersionId?: number | null; suggestedUseDurationSec?: number | null; state?: string; [key: string]: unknown; }
export interface MusicCueAsset { id: number; cueId: number; version?: number; state?: string; errorReason?: string | null; selected?: boolean | number; model?: string | null; assetsId?: number | null; childAssetId?: number | null; media?: unknown; src?: string | null; url?: string | null; audioUrl?: string | null; [key: string]: unknown; }
export interface MusicCue { id: number; projectId: number; scriptId?: number | null; planId: number; cueKey?: string | null; cueType?: string | null; title?: string | null; estimatedDurationSec?: number | null; minDurationSec?: number | null; maxDurationSec?: number | null; confidence?: number | null; startRef?: Record<string, unknown>; endRef?: Record<string, unknown>; musicSpec?: Record<string, unknown>; binding?: MusicCueBinding | null; usageMode?: MusicUsageMode; edition?: MusicLibraryEdition | null; libraryVersion?: MusicLibraryVersion | null; latestPromptVersion?: MusicPromptVersion | null; needsGeneration?: boolean; assets: MusicCueAsset[]; [key: string]: unknown; }
export interface MusicRecommendedProduction { workKey: string; editionKey: string; reason?: string | null; }
export interface MusicPlan { id: number; projectId: number; scriptId?: number | null; bibleId?: number | null; mode?: MusicPlanMode | string; version?: number; state?: string; title?: string | null; content?: string | null; libraryPlan?: unknown[]; cueSheet?: unknown[]; cues?: MusicCue[]; recommendedProduction?: MusicRecommendedProduction | null; [key: string]: unknown; }
export interface MusicAgentRun { runId: string; status: "running" | "awaiting_user" | "completed" | "failed" | "cancelled" | "interrupted" | string; currentStage?: string | null; currentSubAgent?: string | null; reason?: string | null; serverTime?: number | null; projectId?: number | null; scriptId?: number | null; agentKey?: string | null; [key: string]: unknown; }
export interface MusicRunStatus { serverTime?: number; activeRun?: MusicAgentRun | null; latestRun?: MusicAgentRun | null; }
export interface MusicTimelineEvent { id?: string | number; kind: string; createdAt?: number | string | null; stage?: string | null; subAgent?: string | null; status?: string | null; payload?: Record<string, unknown>; [key: string]: unknown; }
export interface MusicRunDetail { run?: MusicAgentRun | null; timeline?: MusicTimelineEvent[]; events?: MusicTimelineEvent[]; }
export interface MusicRecentTask { taskId: string; legacyTaskId?: number | string | null; status?: string; targetType?: MusicTaskTargetType | string; targetId?: number | string | null; reason?: string | null; updateTime?: number | string | null; updatedAt?: number | string | null; phase?: string | null; progress?: number | null; handler?: string | null; [key: string]: unknown; }
export interface MusicTaskSnapshot { serverTime?: number; tasks?: MusicRecentTask[]; }

export const normalizeMusicVersion = (value: any): MusicLibraryVersion => ({ ...(value ?? {}), generationConfig: parseObject(value?.generationConfig ?? value?.generationConfigJson) });
export const normalizeMusicLyrics = (value: any): MusicLyricsVersion => ({ ...(value ?? {}), content: String(value?.content ?? "") });
export const normalizeMusicPrompt = (value: any): MusicPromptVersion => ({ ...(value ?? {}), promptMode: value?.promptMode === "generic" ? "generic" : "modelSpecific", model: value?.model == null ? null : String(value.model), profileSource: value?.profileSource == null ? null : String(value.profileSource), prompt: String(value?.prompt ?? ""), generationConfig: parseObject(value?.generationConfig ?? value?.generationConfigJson) });
export const normalizeMusicEdition = (value: any): MusicLibraryEdition => ({ ...(value ?? {}), musicSpec: parseObject(value?.musicSpec ?? value?.musicSpecJson), versions: Array.isArray(value?.versions) ? value.versions.map(normalizeMusicVersion) : [], lyricsVersions: Array.isArray(value?.lyricsVersions) ? value.lyricsVersions.map(normalizeMusicLyrics) : [] });
export const normalizeMusicLibraryItem = (value: any): MusicLibraryItem => ({ ...(value ?? {}), editions: Array.isArray(value?.editions) ? value.editions.map(normalizeMusicEdition) : [] });
export const normalizeMusicCue = (value: any): MusicCue => ({ ...(value ?? {}), startRef: parseObject(value?.startRef ?? value?.startRefJson), endRef: parseObject(value?.endRef ?? value?.endRefJson), musicSpec: parseObject(value?.musicSpec ?? value?.musicSpecJson), edition: value?.edition ? normalizeMusicEdition(value.edition) : null, libraryVersion: value?.libraryVersion ? normalizeMusicVersion(value.libraryVersion) : null, latestPromptVersion: value?.latestPromptVersion ? normalizeMusicPrompt(value.latestPromptVersion) : null, assets: Array.isArray(value?.assets) ? value.assets : [] });
export const normalizeMusicPlan = (value: any): MusicPlan => ({ ...(value ?? {}), libraryPlan: Array.isArray(value?.libraryPlan) ? value.libraryPlan : parseList(value?.libraryPlanJson), cueSheet: Array.isArray(value?.cueSheet) ? value.cueSheet : parseList(value?.cueSheetJson), cues: Array.isArray(value?.cues) ? value.cues.map(normalizeMusicCue) : undefined, recommendedProduction: value?.recommendedProduction && typeof value.recommendedProduction === "object" && value.recommendedProduction.workKey && value.recommendedProduction.editionKey ? { workKey: String(value.recommendedProduction.workKey), editionKey: String(value.recommendedProduction.editionKey), reason: value.recommendedProduction.reason == null ? null : String(value.recommendedProduction.reason) } : null });
export const normalizeMusicBible = (value: any): MusicBible => ({ ...(value ?? {}), styleProfile: parseObject(value?.styleProfile ?? value?.styleProfileJson) });

const task = (path: string, params: unknown) => axios.post(path, params).then((response) => unwrap<MusicTaskEnvelope>(response));
const withOptionalMusicModel = <T extends { model?: string }>(params: T) => {
  const model = typeof params.model === "string" ? params.model.trim() : "";
  return model ? { ...params, model } : Object.fromEntries(Object.entries(params).filter(([key]) => key !== "model")) as Omit<T, "model">;
};
const extensionForAudioContentType = (contentType: string | null) => {
  switch ((contentType || "").split(";", 1)[0].trim().toLowerCase()) {
    case "audio/mpeg": return "mp3";
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave": return "wav";
    case "audio/mp4":
    case "audio/x-m4a": return "m4a";
    case "audio/aac": return "aac";
    case "audio/ogg": return "ogg";
    case "audio/flac":
    case "audio/x-flac": return "flac";
    case "audio/webm": return "webm";
    default: return "audio";
  }
};
const decodeDownloadFilename = (value: string) => {
  const normalized = value.trim().replace(/^"(.*)"$/, "$1");
  try { return decodeURIComponent(normalized); } catch { return normalized; }
};
const safeDownloadFilename = (value: string) => value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").replace(/^\.+|\.+$/g, "").trim().slice(0, 180) || "audio";
const filenameFromContentDisposition = (contentDisposition: string | null) => {
  if (!contentDisposition) return "";
  const encoded = contentDisposition.match(/(?:^|;)\s*filename\*\s*=\s*(?:[\w-]+'[^']*')?([^;]+)/i)?.[1];
  if (encoded) return safeDownloadFilename(decodeDownloadFilename(encoded));
  const plain = contentDisposition.match(/(?:^|;)\s*filename\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/i)?.[1];
  return plain ? safeDownloadFilename(decodeDownloadFilename(plain)) : "";
};
const downloadErrorMessage = async (response: Response) => {
  try {
    const payload = await response.json() as { message?: unknown };
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  } catch { /* The endpoint may return a non-JSON error body. */ }
  return `下载失败（HTTP ${response.status}）`;
};
export const downloadMusicCandidate = async (params: { projectId: number; targetType: MusicDownloadTargetType; targetId: number; baseUrl: string; fallbackBaseName: string }) => {
  const token = localStorage.getItem("token");
  const response = await fetch(`${params.baseUrl.replace(/\/+$/, "")}/production/music/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: JSON.stringify({ projectId: params.projectId, targetType: params.targetType, targetId: params.targetId }),
  });
  if (!response.ok) throw new Error(await downloadErrorMessage(response));
  const blob = await response.blob();
  if (!blob.size) throw new Error("下载失败：服务端未返回音频文件");
  const contentType = response.headers.get("content-type") || blob.type;
  const filename = filenameFromContentDisposition(response.headers.get("content-disposition")) || `${safeDownloadFilename(params.fallbackBaseName)}.${extensionForAudioContentType(contentType)}`;
  return { blob, filename };
};
export const getMusicAgentRunStatus = (params: { projectId: number; scriptId: number }) => axios.post("/agent/run/status", { agentKey: "musicProductionAgent", ...params }).then((response) => unwrap<MusicRunStatus>(response));
export const getMusicAgentRunDetail = (params: { runId: string }) => axios.post("/agent/run/detail", params).then((response) => unwrap<MusicRunDetail>(response));
export const getMusicTaskSnapshot = (params: { projectId: number; scriptId?: number; taskIds?: string[]; targetTypes?: MusicTaskTargetType[]; includeTerminal?: boolean; limit?: number }) => axios.post("/task/status/snapshot", params).then((response) => unwrap<MusicTaskSnapshot>(response));
export const getMusicAgentMemory = (params: { projectId: number; scriptId?: number }) => axios.post("/agents/getMemory", { projectId: params.projectId, agentType: "musicProductionAgent", ...(params.scriptId ? { episodesId: params.scriptId } : {}) }).then((response) => unwrap<unknown[]>(response));
export const getMusicDefaultModel = (params: { projectId: number }) => axios.post("/production/music/model/default", params).then((response) => unwrap<{ musicModel?: string | null }>(response)).then((data) => data.musicModel == null ? null : String(data.musicModel));
export const setMusicDefaultModel = (params: { projectId: number; model: string | null }) => axios.post("/production/music/model/default", params).then((response) => unwrap<{ musicModel?: string | null }>(response)).then((data) => data.musicModel == null ? null : String(data.musicModel));
export const generateMusicBible = (params: { projectId: number; instruction?: string }) => task("/production/music/bible/generate", params);
export const reviewMusicBible = (params: { projectId: number; bibleId: number }) => task("/production/music/bible/review", params);
export const listMusicBibles = (params: { projectId: number; state?: string }) => axios.post("/production/music/bible/list", params).then((response) => unwrap<{ bibles?: MusicBible[] } | MusicBible[]>(response)).then((data) => (Array.isArray(data) ? data : data.bibles ?? []).map(normalizeMusicBible));
export const getMusicBibleDetail = (params: { projectId: number; bibleId: number }) => axios.post("/production/music/bible/detail", params).then((response) => unwrap<{ bible?: MusicBible } | MusicBible>(response)).then((data: any) => normalizeMusicBible(data.bible ?? data));
export const generateMusicPlan = (params: { projectId: number; mode: MusicPlanMode; bibleId?: number; scriptId?: number; instruction?: string }) => task("/production/music/plan/generate", params);
export const reviewMusicPlan = (params: { projectId: number; planId: number }) => task("/production/music/plan/review", params);
export const listMusicPlans = (params: { projectId: number; scriptId?: number; mode?: MusicPlanMode; state?: string }) => axios.post("/production/music/plan/list", params).then((response) => unwrap<{ plans?: MusicPlan[] } | MusicPlan[]>(response)).then((data) => (Array.isArray(data) ? data : data.plans ?? []).map(normalizeMusicPlan));
export const getMusicPlanDetail = (params: { projectId: number; planId: number; includeCues?: boolean }) => axios.post("/production/music/plan/detail", params).then((response) => unwrap<{ plan?: MusicPlan; cues?: MusicCue[] } | MusicPlan>(response)).then((data: any) => normalizeMusicPlan({ ...(data.plan ?? data), cues: data.cues ?? data.plan?.cues }));
export const listMusicCues = (params: { projectId: number; scriptId?: number; planId?: number }) => axios.post("/production/music/cue/list", params).then((response) => unwrap<{ cues?: MusicCue[] } | MusicCue[]>(response)).then((data) => (Array.isArray(data) ? data : data.cues ?? []).map(normalizeMusicCue));
export const bindMusicCue = (params: { projectId: number; cueId: number; usageMode: MusicUsageMode; editionId?: number | null; libraryVersionId?: number | null; suggestedUseDurationSec?: number | null }) => axios.post("/production/music/cue/bind", params).then((response) => unwrap<{ binding: MusicCueBinding }>(response));
export const compileMusicCuePrompt = (params: { projectId: number; cueId: number; model?: string; instruction?: string }) => task("/production/music/cue/compilePrompt", withOptionalMusicModel(params));
export const listMusicCuePrompts = (params: { projectId: number; cueId: number }) => axios.post("/production/music/cue/prompt/list", params).then((response) => unwrap<{ promptVersions?: MusicPromptVersion[] }>(response)).then((data) => (data.promptVersions ?? []).map(normalizeMusicPrompt));
export const saveMusicCuePrompt = (params: { projectId: number; scriptId?: number | null; cueId: number; promptMode: MusicPromptMode; model: string | null; profileSource?: string | null; prompt: string; negativePrompt?: string; generationConfig?: Record<string, unknown>; basedOnId?: number | null }) => axios.post("/production/music/cue/prompt/save", params).then((response) => unwrap<{ promptVersion: MusicPromptVersion }>(response)).then((data) => normalizeMusicPrompt(data.promptVersion));
export const reviewMusicCuePrompt = (params: { projectId: number; cueId: number; promptVersionId: number }) => task("/production/music/cue/reviewPrompt", params);
// `model` is the model selected for this generation attempt.  Prompt versions may
// retain a historical/recommended model, but must not decide the executing vendor.
export const generateMusicCueAudio = (params: { projectId: number; cueId: number; promptVersionId: number; model?: string; acknowledgeWarnings?: boolean; select?: boolean }) => task("/production/music/cue/generate", withOptionalMusicModel(params));
export const selectMusicCueAsset = (params: { projectId: number; cueId: number; musicCueAssetId: number }) => axios.post("/production/music/cue/selectAsset", params).then((response) => unwrap<{ musicCueAsset: MusicCueAsset }>(response));
export const createMusicLibraryItem = (params: { projectId: number; bibleId?: number | null; workKey: string; workType: MusicWorkType; title?: string; narrativeRole?: string; reuseScope?: "project" | "episode" | "single_use"; relatedItemId?: number | null; relationType?: "evolves_from" | "replaces" | "companion" | null }) => axios.post("/production/music/library/create", params).then((response) => unwrap<{ libraryItem: MusicLibraryItem }>(response)).then((data) => normalizeMusicLibraryItem(data.libraryItem));
export const listMusicLibrary = (params: { projectId: number; state?: string; workType?: string }) => axios.post("/production/music/library/list", params).then((response) => unwrap<{ libraryItems?: MusicLibraryItem[] }>(response)).then((data) => (data.libraryItems ?? []).map(normalizeMusicLibraryItem));
export const getMusicLibraryDetail = (params: { projectId: number; libraryItemId: number }) => axios.post("/production/music/library/detail", params).then((response) => unwrap<{ libraryItem: MusicLibraryItem }>(response)).then((data) => normalizeMusicLibraryItem(data.libraryItem));
export const saveMusicLibraryEdition = (params: { projectId: number; libraryItemId: number; editionId?: number; editionKey: string; editionType: MusicEditionType; parentEditionId?: number | null; title?: string; narrativePhase?: string; episodeStart?: number | null; episodeEnd?: number | null; vocalMode?: "instrumental" | "vocal" | "optional"; language?: string; musicSpec?: Record<string, unknown>; state?: "planned" | "ready" | "archived" }) => axios.post("/production/music/library/edition/save", params).then((response) => unwrap<{ edition: MusicLibraryEdition }>(response)).then((data) => normalizeMusicEdition(data.edition));
export const selectMusicLibraryVersion = (params: { projectId: number; editionId: number; libraryVersionId: number }) => axios.post("/production/music/library/selectVersion", params).then((response) => unwrap<{ edition: MusicLibraryEdition }>(response));
export const generateMusicLyrics = (params: { projectId: number; editionId: number; instruction?: string; basedOnId?: number | null }) => task("/production/music/library/lyrics/generate", params);
export const listMusicLyrics = (params: { projectId: number; editionId: number }) => axios.post("/production/music/library/lyrics/list", params).then((response) => unwrap<{ lyricsVersions?: MusicLyricsVersion[] }>(response)).then((data) => (data.lyricsVersions ?? []).map(normalizeMusicLyrics));
export const saveMusicLyrics = (params: { projectId: number; editionId: number; title?: string; language?: string; content: string; basedOnId?: number | null }) => axios.post("/production/music/library/lyrics/save", params).then((response) => unwrap<{ lyricsVersion: MusicLyricsVersion }>(response)).then((data) => normalizeMusicLyrics(data.lyricsVersion));
export const confirmMusicLyrics = (params: { projectId: number; editionId: number; lyricsVersionId: number }) => axios.post("/production/music/library/lyrics/confirm", params).then((response) => unwrap<{ lyricsVersion: MusicLyricsVersion }>(response)).then((data) => normalizeMusicLyrics(data.lyricsVersion));
export const compileMusicLibraryPrompt = (params: { projectId: number; editionId: number; model?: string; instruction?: string; effectiveMusicDurationSec?: number; requestedDurationSec?: number; lyricsVersionId?: number | null }) => task("/production/music/library/compilePrompt", withOptionalMusicModel(params));
export const listMusicLibraryPrompts = (params: { projectId: number; editionId: number }) => axios.post("/production/music/library/prompt/list", params).then((response) => unwrap<{ promptVersions?: MusicPromptVersion[] }>(response)).then((data) => (data.promptVersions ?? []).map(normalizeMusicPrompt));
export const saveMusicLibraryPrompt = (params: { projectId: number; editionId: number; promptMode: MusicPromptMode; model: string | null; profileSource?: string | null; prompt: string; negativePrompt?: string; generationConfig?: Record<string, unknown>; lyricsVersionId?: number | null; basedOnId?: number | null }) => axios.post("/production/music/library/prompt/save", params).then((response) => unwrap<{ promptVersion: MusicPromptVersion }>(response)).then((data) => normalizeMusicPrompt(data.promptVersion));
export const reviewMusicLibraryPrompt = (params: { projectId: number; editionId: number; promptVersionId: number }) => task("/production/music/library/reviewPrompt", params);
// `model` is the model selected for this generation attempt.  Prompt versions may
// retain a historical/recommended model, but must not decide the executing vendor.
export const generateMusicLibraryAudio = (params: { projectId: number; editionId: number; promptVersionId: number; model?: string; lyricsVersionId?: number | null; acknowledgeWarnings?: boolean }) => task("/production/music/library/generate", withOptionalMusicModel(params));
export const trimMusicLibraryVersion = (params: { projectId: number; sourceLibraryVersionId: number; startMs: number; endMs: number; fadeInMs?: number; fadeOutMs?: number; title: string; bindCueId?: number | null; select?: boolean }) => task("/production/music/library/trim", params);
