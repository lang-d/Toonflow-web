type ReferenceType = "videoReference" | "imageReference" | "audioReference" | "textReference";
type Type = "imageReference" | "startImage" | "endImage" | "videoReference" | "audioReference";
type VideoMode = "singleImage" | "startEndRequired" | "endFrameOptional" | "startFrameOptional" | "text" | ReferenceType[];
type UploadCategory = "role" | "scene" | "tool" | "clip" | "audio" | "other";

interface UploadItemBase {
  fileType: "image" | "video" | "audio";
  id: number | null;
  src?: string;
  originalUrl?: string;
  imageUrl?: string;
  thumbnail?: string;
  thumb?: string;
  media?: import("@/types/api").MediaRef;
  prompt?: string;
  name?: string;
  category?: UploadCategory;
  parentName?: string;
}

interface UploadItemStoryboard extends UploadItemBase {
  sources: "storyboard";
  index: number;
}
interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
}
interface UploadItemAssets extends UploadItemBase {
  sources: "assets";
}

interface UploadItemMerged extends UploadItemBase {
  sources: "merged";
  fileType: "image";
  id: number;
  name: string;
  sourceRefs: Array<{ id: number; sources: "storyboard" | "assets"; order: number }>;
}

type UploadItem = UploadItemStoryboard | UploadItemAssets | UploadItemMerged;

interface StoryboardItem {
  src: string;
  originalUrl?: string | null;
  imageUrl?: string | null;
  thumbnail?: string | null;
  thumb?: string | null;
  media?: import("@/types/api").MediaRef;
  createTime?: number | null;
  duration?: string | null;
  flowId?: number | null;
  id: number;
  index: number;
  projectId?: number | null;
  prompt?: string | null;
  reason?: string | null;
  scriptId?: number | null;
  state?: string | null;
  trackId?: number | null;
  videoDesc?: string | null;
}

interface TrackItem {
  id: number;
  prompt: string;
  status?: import("@/types/api").TaskStatus;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  reason?: string;
  taskId?: string;
  selectVideoId?: number | null;
  medias: TrackMedia[];
  videoList: VideoItem[];
  duration: number;
}

interface VideoItem {
  id: number;
  src: string;
  media?: import("@/types/api").MediaRef;
  status?: import("@/types/api").TaskStatus;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  errorReason?: string | null;
  taskId?: string;
  queueTaskId?: number;
}
interface TrackMediaBase {
  src: string;
  media?: import("@/types/api").MediaRef;
  originalUrl?: string;
  imageUrl?: string;
  thumbnail?: string;
  thumb?: string;
  id?: number;
  prompt?: string;
  fileType: "image" | "video" | "audio";
  slotType?: Type; // 本地保存时记录的 slot 类型，用于切换轨道时精确还原位置
  index?: number;
  name?: string;
  category?: UploadCategory;
  parentName?: string;
}

interface TrackMediaStoryboard extends TrackMediaBase {
  sources: "storyboard";
  index?: number;
}

interface TrackMediaAssets extends TrackMediaBase {
  sources: "assets";
}

interface TrackMediaUnknown extends TrackMediaBase {
  sources?: string;
}

interface TrackMediaMerged extends TrackMediaBase {
  sources: "merged";
  id: number;
  name: string;
  sourceRefs?: Array<{ id: number; sources: "storyboard" | "assets"; order: number }>;
}

type TrackMedia = TrackMediaStoryboard | TrackMediaAssets | TrackMediaMerged | TrackMediaUnknown;

interface HistoryVideoItem {
  errorReason?: string | null;
  src: string;
  id: number;
  duration?: number | string | null;
  projectId?: number | null;
  scriptId?: number | null;
  state?: string | null;
  time?: number | null;
  videoTrackId?: number | null;
}
interface ModelSetting {
  mode: string;
  model: string;
  resolution: string;
  duration: number;
  audio: boolean;
}
