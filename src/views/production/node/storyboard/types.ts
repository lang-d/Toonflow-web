import type { Storyboard } from "../../utils/flowBuilder";
import type { MediaRef } from "@/types/api";

export interface ImageHistoryItem {
  id: number;
  url: string;
  previewUrl?: string;
  media?: MediaRef;
  prompt?: string;
  model?: string;
  ratio?: string;
  quality?: string;
  createTime?: string;
}

export interface ReferenceView {
  key: string;
  id?: number;
  localId?: string;
  source: "asset" | "local" | "storyboard" | "generated" | "directorStage" | "directorAsset";
  sourceId?: number | string;
  src: string;
  originalSrc?: string;
  label: string;
  group: string;
  type: "image" | "video" | "audio" | "text";
}

export interface StoryboardGroup {
  key: string;
  title: string;
  intent?: string | null;
  beatId?: string | null;
  items: Storyboard[];
}
