import settingStore from "@/stores/setting";

function isInlineImageUrl(src: string) {
  return src.startsWith("data:") || src.startsWith("blob:");
}

function getBackendOrigin() {
  try {
    const baseUrl = settingStore().baseUrl;
    if (baseUrl) return new URL(baseUrl, window.location.origin).origin;
  } catch {
    // Pinia may not be active in isolated utility tests; fall back to the app origin.
  }
  return window.location.origin;
}

function shouldUseOssHost(pathname: string) {
  const normalized = pathname.replace(/^\/+/, "");
  return pathname.startsWith("/oss/") || /^\d+\//.test(normalized) || normalized.includes("/imageFlow/");
}

function toOssUrl(src: string) {
  if (!src || isInlineImageUrl(src)) return src;
  try {
    const backendOrigin = getBackendOrigin();
    const parsed = new URL(src, window.location.origin);
    if (parsed.origin !== window.location.origin && parsed.origin !== backendOrigin) return src;
    if (!shouldUseOssHost(parsed.pathname)) return src;

    const path = parsed.pathname.replace(/^\/oss\//, "").replace(/^\/+/, "");
    const url = new URL(`/oss/${path}`, backendOrigin);
    url.search = parsed.search;
    url.hash = parsed.hash;
    return url.toString();
  } catch {
    const path = src.replace(/^\/oss\//, "").replace(/^\/+/, "");
    if (!shouldUseOssHost(`/${path}`)) return src;
    return new URL(`/oss/${path}`, getBackendOrigin()).toString();
  }
}

function updateImageSize(src: string, size?: number) {
  if (!src || isInlineImageUrl(src)) return src;
  try {
    const url = new URL(toOssUrl(src), window.location.origin);
    if (size == null) {
      url.searchParams.delete("size");
    } else {
      url.searchParams.set("size", String(size));
    }
    return url.toString();
  } catch {
    return src;
  }
}

export function getThumbnailImageUrl(src: string, size = 20) {
  return updateImageSize(src, size);
}

export function getOriginalImageUrl(src: string) {
  return updateImageSize(src);
}
