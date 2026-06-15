import type { MediaRef, TaskResult } from "@/types/api";
import { getOriginalImageUrl, getThumbnailImageUrl } from "@/utils/imageUrl";

const MEDIA_TYPES = new Set(["image", "video", "audio", "file"]);

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object");
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
    rawMedia.imageUrl ??
    rawMedia.originalUrl ??
    rawMedia.generatedImage ??
    rawMedia.selectedImageUrl ??
    "";
  const rawPath = rawMedia.path ?? rawMedia.ossPath ?? rawMedia.fileKey ?? rawMedia.filePath ?? rawMedia.src ?? rawUrl;
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
  const value = media.previewUrl || media.url;
  return media.type === "image" ? getThumbnailImageUrl(value, size) : value;
}

export function getMediaOriginalUrl(media?: MediaRef | null) {
  if (!media) return "";
  return media.type === "image" ? getOriginalImageUrl(media.url) : media.url;
}

export function getMediaPathForGeneration(media?: MediaRef | null) {
  return media?.path || "";
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
