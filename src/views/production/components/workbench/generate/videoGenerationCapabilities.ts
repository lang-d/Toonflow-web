type DurationResolutionMap = {
  duration?: unknown[];
  resolution?: unknown[];
};

type ReferenceCandidate = {
  id?: number | string | null;
  sources?: string;
  fileType?: "image" | "video" | "audio";
};

export type WorkbenchReferencePayload = {
  id: number | string;
  sources: WorkbenchReferenceSource;
};

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function uniqueNumbers(values: unknown[]) {
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((left, right) => left - right);
}

function resolutionMatches(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

export function getSupportedResolutions(model?: Pick<VideoModel, "durationResolutionMap"> | null) {
  return uniqueStrings((model?.durationResolutionMap ?? []).flatMap((item: DurationResolutionMap) => item?.resolution ?? []));
}

/** Matches the backend duration policy: a duration belongs to every map row containing the chosen resolution. */
export function getSupportedDurations(model: Pick<VideoModel, "durationResolutionMap"> | null | undefined, resolution?: string) {
  const maps = Array.isArray(model?.durationResolutionMap) ? model.durationResolutionMap as DurationResolutionMap[] : [];
  const matched = resolution
    ? maps.filter((item) => (item?.resolution ?? []).some((candidate) => resolutionMatches(String(candidate), resolution)))
    : [];
  return uniqueNumbers((matched.length ? matched : maps).flatMap((item) => item?.duration ?? []));
}

export function isSupportedDuration(model: Pick<VideoModel, "durationResolutionMap"> | null | undefined, resolution: string, duration: unknown) {
  const supported = getSupportedDurations(model, resolution);
  return !supported.length || supported.includes(Number(duration));
}

export function parseVideoMode(mode: string): VideoMode | null {
  if (!mode) return null;
  try {
    const parsed = JSON.parse(mode);
    if (Array.isArray(parsed)) return parsed as ReferenceType[];
  } catch {
    // A normal string mode is expected.
  }
  return mode as Exclude<VideoMode, ReferenceType[]>;
}

function mixedReferenceLimits(mode: ReferenceType[]) {
  return mode.reduce(
    (limits, item) => {
      const [kind, rawLimit] = String(item).split(":");
      const limit = Number(rawLimit);
      if (!Number.isFinite(limit) || limit < 0) return limits;
      if (kind === "imageReference") limits.image = limit;
      if (kind === "videoReference") limits.video = limit;
      if (kind === "audioReference") limits.audio = limit;
      return limits;
    },
    { image: 0, video: 0, audio: 0 },
  );
}

function toPayload(item: ReferenceCandidate): WorkbenchReferencePayload | null {
  if (item.id == null || !item.sources) return null;
  return { id: item.id, sources: item.sources as WorkbenchReferenceSource };
}

/**
 * Keeps a track's retained references intact while projecting only the subset the chosen model may receive.
 * The same projection is used by prompt compilation and video generation.
 */
export function buildVideoReferencePayload(modeValue: string, items: ReferenceCandidate[]): WorkbenchReferencePayload[] {
  const mode = parseVideoMode(modeValue);
  if (mode === "text") return [];

  const validItems = items.filter((item) => item.id != null && Boolean(item.sources));
  if (mode === "singleImage") {
    const item = validItems.find((candidate) => candidate.fileType === "image");
    return item ? [toPayload(item)!] : [];
  }
  if (mode === "startEndRequired" || mode === "startFrameOptional" || mode === "endFrameOptional") {
    return validItems
      .filter((candidate) => candidate.fileType === "image")
      .slice(0, 2)
      .map(toPayload)
      .filter((item): item is WorkbenchReferencePayload => item !== null);
  }
  if (!Array.isArray(mode)) {
    return validItems.map(toPayload).filter((item): item is WorkbenchReferencePayload => item !== null);
  }

  const limits = mixedReferenceLimits(mode);
  const used = { image: 0, video: 0, audio: 0 };
  return validItems.flatMap((item) => {
    const type = item.fileType;
    if (type !== "image" && type !== "video" && type !== "audio") return [];
    if (used[type] >= limits[type]) return [];
    const payload = toPayload(item);
    if (!payload) return [];
    used[type] += 1;
    return [payload];
  });
}
