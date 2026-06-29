import type { MediaRef, TaskResult } from "@/types/api";
import { getOriginalImageUrl, getThumbnailImageUrl } from "@/utils/imageUrl";

const MEDIA_TYPES = new Set(["image", "video", "audio", "file"]);
type MediaDisplayUrls = { media: MediaRef | undefined; previewUrl: string; originalUrl: string };
const PLAYABLE_URL_FIELDS = ["originalUrl", "audioUrl", "videoUrl", "downloadUrl", "url", "src", "filePath", "path", "ossPath", "fileKey"] as const;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object");
}

function isMediaRefLike(value: Record<string, any>) {
  return MEDIA_TYPES.has(value.type) && Boolean(value.path || value.url || value.src || value.filePath || value.audioUrl || value.originalUrl || value.downloadUrl || value.ossPath || value.fileKey);
}

function inferType(url = "", fallback: MediaRef["type"] = "image"): MediaRef["type"] {
  const clean = url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v|avi)$/.test(clean)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(clean)) return "audio";
  if (/\.(png|jpe?g|webp|gif|bmp|avif)$/.test(clean)) return "image";
  return fallback;
}

function normalizePath(value = "") {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  try {
    const url = new URL(value, window.location.origin);
    return url.pathname.replace(/^\/oss\//, "").replace(/^\/+/, "");
  } catch {
    return value.replace(/^\/oss\//, "").replace(/^\/+/, "").split(/[?#]/)[0];
  }
}

export function normalizeMediaRef(input: unknown, fallbackType: MediaRef["type"] = "image"): MediaRef | undefined {
  if (!input) return undefined;
  if (typeof input === "string") {
    return {
      type: inferType(input, fallbackType),
      path: normalizePath(input),
      url: input,
    };
  }
  if (!isRecord(input)) return undefined;

  const rawMedia = isRecord(input.media) ? input.media : input;
  const rawUrl =
    rawMedia.url ??
    rawMedia.previewUrl ??
    rawMedia.src ??
    rawMedia.filePath ??
    rawMedia.audioUrl ??
    rawMedia.imageUrl ??
    rawMedia.originalUrl ??
    rawMedia.downloadUrl ??
    rawMedia.path ??
    rawMedia.ossPath ??
    rawMedia.fileKey ??
    rawMedia.generatedImage ??
    rawMedia.selectedImageUrl ??
    "";
  const rawPath = rawMedia.path ?? rawMedia.ossPath ?? rawMedia.fileKey ?? rawMedia.filePath ?? rawMedia.audioUrl ?? rawMedia.originalUrl ?? rawMedia.downloadUrl ?? rawMedia.src ?? rawUrl;
  if (!rawUrl && !rawPath) return undefined;
  const type = MEDIA_TYPES.has(rawMedia.type) ? rawMedia.type : inferType(rawUrl || rawPath, fallbackType);
  const url = rawMedia.url || rawUrl;

  return {
    id: rawMedia.id,
    type,
    path: rawMedia.path || normalizePath(rawPath || url),
    url,
    previewUrl: rawMedia.previewUrl || rawMedia.thumbnail || rawMedia.thumb || rawMedia.previewImage,
    mime: rawMedia.mime,
    name: rawMedia.name,
    width: rawMedia.width,
    height: rawMedia.height,
    duration: rawMedia.duration,
    source: rawMedia.source,
    sourceId: rawMedia.sourceId,
  };
}

export function normalizeMediaList(input: unknown, fallbackType: MediaRef["type"] = "image"): MediaRef[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  return list.map((item) => normalizeMediaRef(item, fallbackType)).filter((item): item is MediaRef => Boolean(item));
}

export function getMediaPreviewUrl(media?: MediaRef | null, size = 20) {
  if (!media) return "";
  const value = media.previewUrl || media.url || media.path;
  return media.type === "image" ? getThumbnailImageUrl(value, size) : value;
}

export function getMediaOriginalUrl(media?: MediaRef | null) {
  if (!media) return "";
  const value = media.url || media.path;
  return media.type === "image" ? getOriginalImageUrl(value) : value;
}

export function getMediaPathForGeneration(media?: MediaRef | null) {
  return media?.path || "";
}

export function getMediaDisplayUrls(input: unknown, fallbackType: MediaRef["type"] = "image", previewSize = 20): MediaDisplayUrls {
  const empty = { media: undefined as MediaRef | undefined, previewUrl: "", originalUrl: "" };
  if (!input) return empty;

  if (typeof input === "string") {
    const type = inferType(input, fallbackType);
    return {
      media: undefined,
      previewUrl: type === "image" ? getThumbnailImageUrl(input, previewSize) : input,
      originalUrl: type === "image" ? getOriginalImageUrl(input) : input,
    };
  }

  if (!isRecord(input)) return empty;

  const explicitMedia = input.media ?? (isMediaRefLike(input) ? input : undefined);
  const media = normalizeMediaRef(explicitMedia, fallbackType);
  if (media) {
    return {
      media,
      previewUrl: getMediaPreviewUrl(media, previewSize),
      originalUrl: getMediaOriginalUrl(media),
    };
  }

  if (Array.isArray(input.sonAssets)) {
    for (const child of input.sonAssets) {
      const childUrls = getMediaDisplayUrls(child, fallbackType, previewSize);
      if (childUrls.previewUrl || childUrls.originalUrl) return childUrls;
    }
  }

  const type = MEDIA_TYPES.has(input.type) ? input.type : inferType(input.originalUrl || input.audioUrl || input.downloadUrl || input.imageUrl || input.url || input.src || input.filePath || input.path || input.ossPath || input.fileKey || "", fallbackType);
  const original = input.originalUrl || input.audioUrl || input.downloadUrl || input.imageUrl || input.url || input.src || input.filePath || input.path || input.ossPath || input.fileKey || input.previewUrl || input.thumbnail || input.thumb || input.previewImage || "";
  const preview = input.previewUrl || input.thumbnail || input.thumb || input.previewImage || input.src || input.filePath || input.audioUrl || input.downloadUrl || input.imageUrl || input.originalUrl || input.url || input.path || input.ossPath || input.fileKey || "";

  if (type !== "image") {
    return {
      media: undefined,
      previewUrl: preview || original,
      originalUrl: original || preview,
    };
  }

  return {
    media: undefined,
    previewUrl: preview || original ? getThumbnailImageUrl(preview || original, previewSize) : "",
    originalUrl: original || preview ? getOriginalImageUrl(original || preview) : "",
  };
}

export function getPlayableMediaUrl(input: unknown, fallbackType: MediaRef["type"] = "audio") {
  const visited = new Set<unknown>();

  const resolve = (value: unknown): string => {
    if (!value || visited.has(value)) return "";
    if (typeof value === "string") return value.trim();
    if (!isRecord(value)) return "";
    visited.add(value);

    const mediaUrl = resolve(value.media);
    if (mediaUrl) return mediaUrl;

    for (const field of PLAYABLE_URL_FIELDS) {
      const candidate = value[field];
      if (typeof candidate !== "string" || !candidate.trim()) continue;
      const media = normalizeMediaRef({ type: value.type, [field]: candidate }, fallbackType);
      const originalUrl = media ? getMediaOriginalUrl(media) : candidate;
      if (originalUrl) return originalUrl;
    }

    if (Array.isArray(value.sonAssets)) {
      for (const child of value.sonAssets) {
        const childUrl = resolve(child);
        if (childUrl) return childUrl;
      }
    }

    return "";
  };

  return resolve(input);
}

export function normalizeTaskResult(input: unknown, fallbackType: MediaRef["type"] = "image"): TaskResult {
  if (!isRecord(input)) return {};
  const explicitResult = isRecord(input.result) ? input.result : input;
  const media = normalizeMediaRef(explicitResult.media ?? explicitResult, fallbackType);
  const mediaList = normalizeMediaList(explicitResult.mediaList ?? explicitResult.medias ?? explicitResult.list, fallbackType);
  return {
    ...explicitResult,
    ...(media ? { media } : {}),
    ...(mediaList.length ? { mediaList } : {}),
    text: explicitResult.text ?? explicitResult.prompt,
    historyId: explicitResult.historyId ?? explicitResult.id,
    businessId: explicitResult.businessId ?? explicitResult.targetId ?? explicitResult.assetsId,
  };
}

export function attachLegacyMediaFields<T extends Record<string, any>>(item: T, media?: MediaRef): T {
  if (!media) return item;
  const previewUrl = getMediaPreviewUrl(media);
  const originalUrl = getMediaOriginalUrl(media);
  return {
    ...item,
    media,
    src: item.src ?? previewUrl,
    filePath: item.filePath ?? previewUrl,
    imageUrl: item.imageUrl ?? originalUrl,
    originalUrl: item.originalUrl ?? originalUrl,
    thumbnail: item.thumbnail ?? previewUrl,
    thumb: item.thumb ?? previewUrl,
  };
}
