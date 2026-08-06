type ReferenceType = "videoReference" | "imageReference" | "audioReference" | "textReference";
type Type = "imageReference" | "startImage" | "endImage" | "videoReference" | "audioReference";
type VideoMode = "singleImage" | "startEndRequired" | "endFrameOptional" | "startFrameOptional" | "text" | ReferenceType[];
type UploadCategory = "role" | "scene" | "tool" | "clip" | "audio" | "other";
type WorkbenchReferenceSource = "storyboard" | "assets" | "merged" | "directorAsset" | "local";
type StoryboardFactStatus = "draft" | "ready" | "legacy";

interface UploadItemBase {
  fileType: "image" | "video" | "audio";
  id: number | string | null;
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
  inputOrder?: number;
  referenceToken?: string;
  visualToken?: string;
  visualImageIndex?: number;
  audioToken?: string;
  audioReferenceIndex?: number;
  videoToken?: string;
  videoReferenceIndex?: number;
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
interface UploadItemDirectorAsset extends UploadItemBase {
  sources: "directorAsset";
}

interface UploadItemLocal extends UploadItemBase {
  sources: "local";
}

interface UploadItemMerged extends UploadItemBase {
  sources: "merged";
  fileType: "image";
  id: number;
  name: string;
  sourceRefs: Array<{ id: number; sources: "storyboard" | "assets"; order: number }>;
}

type UploadItem = UploadItemStoryboard | UploadItemAssets | UploadItemMerged | UploadItemDirectorAsset | UploadItemLocal;

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
  scene?: string | null;
  location?: string | null;
  timeOfDay?: string | null;
  sceneContinuityId?: string | null;
  shotDescription?: string | null;
  picture?: string | null;
  action?: string | null;
  shotSize?: string | null;
  cameraMove?: string | null;
  cameraAngle?: string | null;
  dialogue?: string | null;
  sound?: string | null;
  visibleEmotion?: string | null;
  reason?: string | null;
  scriptId?: number | null;
  state?: string | null;
  trackId?: number | null;
  groupKey?: string | null;
  groupName?: string | null;
  groupIntent?: string | null;
  beatId?: string | null;
  tableRowJson?: string | null;
  factStatus?: StoryboardFactStatus;
  factVersion?: number | null;
  factSource?: "storyboardTable" | "minimalFallback";
  promptStale?: boolean;
  imageStale?: boolean;
  sourceTracked?: boolean;
  videoDesc?: string | null;
}

interface TrackItem {
  id: number;
  prompt: string;
  groupKey?: string | null;
  groupName?: string | null;
  groupIntent?: string | null;
  beatId?: string | null;
  videoPromptStale?: boolean;
  sourceTracked?: boolean;
  musicPlan?: import("@/types/productionReview").TrackBgmSuggestion | null;
  reviewState?: import("@/types/productionReview").ProductionReviewState;
  reviewIssues?: import("@/types/productionReview").ProductionReviewSuggestion[];
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
  id?: number | string;
  prompt?: string;
  fileType: "image" | "video" | "audio";
  slotType?: Type; // 本地保存时记录的 slot 类型，用于切换轨道时精确还原位置
  index?: number;
  name?: string;
  category?: UploadCategory;
  parentName?: string;
  inputOrder?: number;
  referenceToken?: string;
  visualToken?: string;
  visualImageIndex?: number;
  audioToken?: string;
  audioReferenceIndex?: number;
  videoToken?: string;
  videoReferenceIndex?: number;
}

interface TrackMediaStoryboard extends TrackMediaBase {
  sources: "storyboard";
  index?: number;
}

interface TrackMediaAssets extends TrackMediaBase {
  sources: "assets";
}

interface TrackMediaDirectorAsset extends TrackMediaBase {
  sources: "directorAsset";
}

interface TrackMediaLocal extends TrackMediaBase {
  sources: "local";
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

type TrackMedia = TrackMediaStoryboard | TrackMediaAssets | TrackMediaMerged | TrackMediaDirectorAsset | TrackMediaLocal | TrackMediaUnknown;

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
