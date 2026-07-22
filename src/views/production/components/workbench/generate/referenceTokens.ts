import "@/views/production/components/workbench/type/type";

const REFERENCE_TOKEN_FIELDS = [
  "inputOrder",
  "referenceToken",
  "visualToken",
  "visualImageIndex",
  "audioToken",
  "audioReferenceIndex",
  "videoToken",
  "videoReferenceIndex",
] as const;

type ReferenceTokenField = (typeof REFERENCE_TOKEN_FIELDS)[number];
type ReferenceLike = Partial<Pick<UploadItemBase, "fileType" | "src"> & Record<ReferenceTokenField, string | number | undefined>>;

export function stripDerivedReferenceTokens<T extends Record<string, any>>(item: T): T {
  const next = { ...item };
  REFERENCE_TOKEN_FIELDS.forEach((field) => {
    delete next[field];
  });
  return next;
}

export function deriveReferenceTokens<T extends ReferenceLike>(items: T[]) {
  let visualImageIndex = 0;
  let audioReferenceIndex = 0;
  let videoReferenceIndex = 0;

  return items.map((item, index) => {
    const next: T & Partial<Record<ReferenceTokenField, string | number>> = {
      ...stripDerivedReferenceTokens(item as Record<string, any>),
      inputOrder: index + 1,
    } as T & Partial<Record<ReferenceTokenField, string | number>>;

    if (!item?.src) return next;

    if (item.fileType === "image") {
      visualImageIndex += 1;
      next.visualImageIndex = visualImageIndex;
      next.visualToken = `@Image${visualImageIndex}`;
      next.referenceToken = next.visualToken;
    } else if (item.fileType === "audio") {
      audioReferenceIndex += 1;
      next.audioReferenceIndex = audioReferenceIndex;
      next.audioToken = `参考音频${audioReferenceIndex}`;
      next.referenceToken = next.audioToken;
    } else if (item.fileType === "video") {
      videoReferenceIndex += 1;
      next.videoReferenceIndex = videoReferenceIndex;
      next.videoToken = `参考视频${videoReferenceIndex}`;
      next.referenceToken = next.videoToken;
    }

    return next;
  });
}

export function getDerivedReferenceToken(item?: Partial<Record<ReferenceTokenField, string | number>>) {
  return String(item?.referenceToken || item?.visualToken || item?.audioToken || item?.videoToken || "");
}
