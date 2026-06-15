function isInlineImageUrl(src: string) {
  return src.startsWith("data:") || src.startsWith("blob:");
}

function updateImageSize(src: string, size?: number) {
  if (!src || isInlineImageUrl(src)) return src;
  try {
    const url = new URL(src, window.location.origin);
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
