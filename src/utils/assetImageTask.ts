export type AssetImageType = "role" | "scene" | "tool";

export function normalizeAssetImageType(type?: string | null): AssetImageType | undefined {
  const normalized = type === "props" ? "tool" : type;
  if (normalized === "role" || normalized === "scene" || normalized === "tool") return normalized;
  return undefined;
}
