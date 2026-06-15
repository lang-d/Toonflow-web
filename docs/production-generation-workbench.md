# 生成工作台前端设计与接口文档

## 1. 文档范围

本文档说明生产台“生成工作台”的前端交互、组件设计、状态流转和接口调用。范围覆盖当前主入口：

- 工作台节点入口：`src/views/production/node/workbench.vue`
- 全屏工作台容器：`src/views/production/components/workbench/index.vue`
- 快速预览：`src/views/production/components/workbench/preview.vue`
- 视频生成：`src/views/production/components/workbench/generate/index.vue`
- 视频剪辑：`src/views/production/components/workbench/editVideo/index.vue`

`src/views/production/components/workbench/generate copy.vue` 和 `src/views/production/components/workbench/generate copy/` 是历史实现拷贝，不作为当前业务主流程依据。

## 2. 产品定位

生成工作台是生产台后半段的视频制作入口，承接分镜、资产和项目视频模型配置，完成三类工作：

1. 快速预览分镜图片、描述、时长和关联资产。
2. 基于分镜或资产引用生成分镜视频，并管理每个轨道的历史视频结果。
3. 将生成视频、素材、音频、图片导入剪辑台，进行本地时间线剪辑和导出。

工作台前端不直接保存生产台总流程结构，生产台画布结构仍由外层生产台负责。工作台内部通过 `/production/workbench/*` 维护视频轨道、引用素材、提示词、视频任务和选中视频。

## 3. 总体结构

### 3.1 入口层级

```text
production canvas
└─ node/workbench.vue
   └─ components/workbench/index.vue
      ├─ preview.vue
      ├─ generate/index.vue
      │  ├─ components/imageSelect.vue
      │  ├─ components/modeMenu.vue
      │  ├─ components/video.vue
      │  └─ components/track.vue
      └─ editVideo/index.vue
         ├─ mediaLibrary.vue
         ├─ videoPreview.vue
         ├─ propertyPanel.vue
         └─ editVideo/utils/*
```

### 3.2 顶层交互

用户点击生产台中的“工作台”节点后，`node/workbench.vue` 打开全屏弹窗。全屏弹窗顶部提供三个模式：

- 快速预览：查看分镜图片和分镜顺序。
- 视频生成：选择模型、引用素材、编辑提示词、发起视频生成。
- 视频剪辑：将生成视频和本地素材组成时间线，进行剪辑和导出。

弹窗关闭只关闭前端视图，不主动取消视频生成任务。生成任务由后端异步执行，重新打开生成页时通过后端返回的轨道和视频状态继续展示。

## 4. 核心数据模型

类型定义位于 `src/views/production/components/workbench/type/type.ts`。

### 4.1 生成模式

```ts
type ReferenceType = "videoReference" | "imageReference" | "audioReference" | "textReference";

type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | ReferenceType[];
```

常见语义：

- `text`：纯文本生成视频，不提交引用素材。
- `singleImage`：单图生视频，只允许一个图片引用。
- `startEndRequired`：首尾帧必填。
- `startFrameOptional`：首帧可选、尾帧必填或按模型规则处理。
- `endFrameOptional`：首帧必填、尾帧可选或按模型规则处理。
- `ReferenceType[]`：多模态引用组合，可能包含图片、视频、音频、文本引用。

### 4.2 轨道

```ts
interface TrackItem {
  id: number;
  prompt: string;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  reason?: string;
  selectVideoId?: number | null;
  medias: TrackMedia[];
  videoList: VideoItem[];
  duration: number;
}
```

轨道是视频生成的最小业务单元。每个轨道有独立的提示词、引用素材、时长、历史视频列表和当前选中视频。

### 4.3 引用素材

```ts
interface UploadItemBase {
  fileType: "image" | "video" | "audio";
  id: number | null;
  src?: string;
  prompt?: string;
}

interface UploadItemStoryboard extends UploadItemBase {
  sources: "storyboard";
  index: number;
}

interface UploadItemAssets extends UploadItemBase {
  sources: "assets";
}
```

引用素材只向后端提交 `{ id, sources }`，`src` 主要用于前端预览。`sources` 用于区分素材来源：

- `storyboard`：分镜图片。
- `assets`：资产库素材，包括角色、道具、场景、片段、音频等。

### 4.4 视频结果

```ts
interface VideoItem {
  id: number;
  src: string;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  errorReason?: string | null;
}
```

`videoList` 是一个轨道下的历史生成结果集合。用户可以预览、下载、删除并选择其中一个作为该轨道的最终视频。

## 5. 工作台容器设计

### 5.1 `node/workbench.vue`

职责：

- 在生产台 Vue Flow 画布中展示工作台节点。
- 提供目标 Handle，承接上游分镜节点连接。
- 点击节点打开全屏工作台弹窗。
- 展示工作台封面 `cover`，未配置时展示默认视频图标。

关键状态：

- `visible`：控制全屏工作台是否打开。
- `workbenchData`：由 Vue Flow 节点数据双向绑定，包含封面、名称、分辨率等展示字段。

### 5.2 `components/workbench/index.vue`

职责：

- 管理全屏弹窗。
- 管理顶部模式切换。
- 初始化剪辑台素材库。
- 根据项目比例设置剪辑画布尺寸。

主要状态：

- `activeMenu`：`preview | generate | editVideo`。
- `canvasWidth/canvasHeight`：由项目 `videoRatio` 推导，支持 `16:9`、`1:1`、`9:16`。
- `initialVideoItems`：分镜视频素材。
- `mockMediaItems`：普通视频素材。
- `mockAudioItems`：音频素材。
- `mockImageItems`：图片素材。

素材初始化调用 `/assets/getMaterialData`，前端按文件扩展名分为 video、audio、image，并传给剪辑台媒体库。

## 6. 快速预览模块

文件：`src/views/production/components/workbench/preview.vue`

### 6.1 功能

- 加载当前剧集分镜。
- 展示当前分镜大图。
- 展示分镜描述、时长、关联资产和图片提示词。
- 提供播放式浏览，按照每个分镜时长自动跳转。
- 支持进度条拖动、上一镜、下一镜、空格选择。
- 支持拖拽调整本地展示顺序。
- 支持勾选分镜并导出图片 zip。

### 6.2 数据加载

```ts
POST /production/getStoryboardData
```

请求：

```ts
{
  scriptId: number;
}
```

前端使用返回数组直接赋值给 `shotList`。每个分镜包含：

- `id`
- `filePath`
- `description`
- `duration`
- `prompt`
- `characters`

### 6.3 交互逻辑

- 进入预览页时自动拉取分镜数据。
- 点击缩略分镜切换当前分镜。
- 点击播放后，前端本地定时器按 `duration` 推进。
- 进度条分段宽度由各分镜时长占总时长比例计算。
- 导出图片只使用前端 `fetch(filePath)` 下载并用 `JSZip` 打包，不调用后端导出接口。

## 7. 视频生成模块

文件：`src/views/production/components/workbench/generate/index.vue`

### 7.1 模块职责

生成模块是工作台的视频生产主流程，负责：

- 获取轨道列表和分镜列表。
- 读取项目默认视频模型和生成模式。
- 根据模型详情生成模式、分辨率、时长、音频配置。
- 管理当前轨道的引用素材。
- 编辑并保存当前轨道提示词。
- 发起单轨视频生成和提示词生成。
- 轮询视频生成状态和提示词生成状态。
- 协调轨道条、素材选择器、模式选择器、历史视频面板。

### 7.2 初始化流程

进入生成页后：

1. 从项目配置读取：
   - `project.videoModel`
   - `project.mode`
2. 调用 `/production/workbench/getGenerateData` 获取：
   - `storyboardList`
   - `trackList`
3. 初始化 `imageListCache`：
   - 首次进入时将后端 `track.medias` 写入本地缓存。
   - 批量调用 `/production/workbench/getFileUrl` 解析素材完整 URL。
   - 将缓存中的完整 URL 回写到 `track.medias` 供前端展示。
4. 如果已有 `videoList.state === "生成中"` 的视频，开启视频轮询。
5. 如果已有 `track.state === "生成中"` 的提示词任务，开启提示词轮询。

### 7.3 当前轨道

`currentTrack` 根据 `activeTrackIndex` 从 `trackList` 中计算得到。所有编辑操作默认作用于当前轨道：

- 引用素材 `currentTrack.medias`
- 提示词 `currentTrack.prompt`
- 时长 `currentTrack.duration`
- 历史视频 `currentTrack.videoList`

切换轨道时：

- 保存上一个轨道的 `medias` 到 `imageListCache`。
- 从缓存恢复新轨道的 `medias`。
- 如果当前模式是 `singleImage`，自动裁剪到一个引用。
- 将 `modelParmas.duration` 重置为当前轨道时长并按模型可用时长夹取。

## 8. 引用素材选择设计

文件：`src/views/production/components/workbench/generate/components/imageSelect.vue`

### 8.1 选择入口

引用素材选择器根据当前 `mode` 展示不同入口：

- `text`：不展示添加引用。
- `singleImage`：最多一个引用。
- 首尾帧模式：固定两个槽位，分别对应首帧和尾帧。
- 多模态引用模式：允许添加多个引用。

### 8.2 来源选择

点击添加引用后弹出确认框：

- 确认：打开资产选择器 `assetsCheck`。
- 取消：打开分镜选择弹窗。

资产选择支持类型：

- `role`
- `tool`
- `scene`
- `clip`
- `audio`

当模式是多模态引用时，会根据 `ReferenceType[]` 限制 `clipMediaTypes`，例如只允许图片、视频或音频。

### 8.3 引用写入规则

资产来源写入：

```ts
{
  fileType: "image" | "video" | "audio",
  sources: "assets",
  src: asset.src,
  id: asset.id,
  prompt: asset.prompt
}
```

分镜来源写入：

```ts
{
  fileType: "image",
  sources: "storyboard",
  src: storyboard.src,
  id: storyboard.id,
  prompt: storyboard.videoDesc,
  index: storyboard.index
}
```

首尾帧模式会写入固定槽位：

- index 0：首帧。
- index 1：尾帧。

非首尾帧模式会追加到 `imageList`。

### 8.4 音频绑定素材

多引用资产选择后，前端会取非音频素材 id 调用：

```ts
POST /production/workbench/getAudioBindAssetsList
```

请求：

```ts
{
  assetsIds: number[];
}
```

返回数据会追加到 `imageList`，用于自动补充与资产绑定的音频或相关素材。

## 9. 模型与模式配置设计

文件：`src/views/production/components/workbench/generate/components/modeMenu.vue`

### 9.1 组件职责

- 选择视频模型。
- 选择模型支持的生成模式。
- 切换是否生成音频。
- 选择分辨率和时长。
- 更新当前轨道时长。

### 9.2 模型详情

当 `modelParmas.model` 变化时，生成模块调用：

```ts
POST /modelSelect/getModelDetail
```

请求：

```ts
{
  modelId: string;
}
```

前端使用返回的 `VideoModel`：

```ts
{
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: {
    duration: number[];
    resolution: string[];
  }[];
}
```

处理规则：

- `audio === true | "true" | "optional"` 时默认开启音频。
- 优先选择 `durationResolutionMap[0].resolution[0]`。
- 当前轨道时长按模型支持范围进行 `clampDuration`。
- 如果当前模式不在新模型支持列表中，自动切到模型第一个可用模式。

### 9.3 模式切换保护

当用户已经选择引用素材或已填写提示词时，切换模式会弹确认框。确认后：

- 清空当前轨道引用。
- 清空当前轨道提示词。
- 写入新模式。

这样避免不同模式下引用槽位语义不一致导致旧数据误用。

### 9.4 时长更新

用户在分辨率/时长弹层中修改时长后，组件调用：

```ts
POST /production/workbench/updateVideoDuration
```

请求：

```ts
{
  id: number;
  duration: number;
}
```

其中 `id` 是当前轨道 id。

## 10. 提示词编辑与生成

### 10.1 提示词编辑

生成页使用公共组件 `promptEditor`：

```vue
<promptEditor
  v-model="currentTrack.prompt"
  :references="references"
  :placeholder="$t('workbench.generate.promptPlaceholder')"
/>
```

`references` 来自当前轨道有 `src` 的引用素材，用于在提示词编辑器中展示可引用媒体。

提示词输入框失焦时调用：

```ts
POST /production/workbench/updateVideoPrompt
```

请求：

```ts
{
  id: number;
  prompt: string;
}
```

### 10.2 单轨提示词生成

点击当前轨道“生成文案”时：

```ts
POST /production/workbench/generateVideoPrompt
```

请求：

```ts
{
  projectId: number;
  trackId: number;
  info: {
    id: number;
    sources: "assets" | "storyboard";
  }[];
  model: string;
  mode: string;
}
```

前端在请求前将当前轨道状态置为 `生成中`。成功后把返回内容写入 `track.prompt`，并将轨道状态置为 `已完成`。失败时置为 `生成失败` 并提示错误。

### 10.3 批量提示词生成

轨道组件中勾选多个轨道后调用：

```ts
POST /production/workbench/batchGeneratePrompt
```

请求：

```ts
{
  projectId: number;
  trackData: {
    trackId: number;
    info: {
      id: number;
      sources: string;
    }[];
  }[];
  model: string;
  mode: string;
  concurrentCount: number;
}
```

`concurrentCount` 来自 `settingStore.otherSetting.assetsBatchGenereateSize`。

批量提示词生成后，前端依赖 `/production/workbench/checkVideoPrompt` 轮询状态。

## 11. 视频生成交互

### 11.1 单轨视频生成

文件：`generate/index.vue` 与 `generate/components/video.vue`

用户点击当前轨道视频卡片中的“生成”按钮后：

1. 弹出确认框。
2. 根据模式构造 `uploadData`：
   - `text` 模式提交空数组。
   - 首尾帧模式最多提交前两个有效引用。
   - `singleImage` 最多提交一个有效引用。
   - 多引用模式提交所有有效引用。
3. 调用生成接口。
4. 后端返回视频记录 id 后，前端向当前轨道 `videoList` 追加一条 `生成中` 记录。
5. `hasGenerateVideoIds` 发生变化，开启轮询。

接口：

```ts
POST /production/workbench/generateVideo
```

请求：

```ts
{
  projectId: number;
  scriptId: number;
  uploadData: {
    id: number;
    sources: "assets" | "storyboard";
  }[];
  prompt: string;
  model: string;
  mode: string;
  resolution: string;
  duration: number;
  audio: boolean;
  trackId: number;
}
```

响应：

```ts
{
  data: number;
}
```

`data` 是新建的视频结果记录 id。

### 11.2 批量视频生成

文件：`generate/components/track.vue`

用户在轨道条勾选多个轨道后点击批量生成：

1. 检查所有勾选轨道是否都有提示词。
2. 每个轨道独立构造 `uploadData`。
3. 调用批量生成接口。
4. 后端返回 `{ trackId, videoId }[]` 后，前端向对应轨道 `videoList` 追加 `生成中` 视频。

接口：

```ts
POST /production/workbench/batchGenerateVideo
```

请求：

```ts
{
  projectId: number;
  scriptId: number;
  model: string;
  mode: string;
  resolution: string;
  audio: boolean;
  trackData: {
    duration: number;
    prompt: string;
    uploadData: {
      id: number;
      sources: string;
    }[];
    trackId: number;
  }[];
}
```

响应：

```ts
{
  data: {
    videoId: number;
    trackId: number;
  }[];
}
```

## 12. 轮询与状态同步

### 12.1 视频状态轮询

生成页维护 `hasGenerateVideoIds`：

```ts
trackList
  .flatMap(track => track.videoList)
  .filter(video => video.state === "生成中")
  .map(video => video.id)
```

当列表非空时开启 `setInterval`，每 3 秒调用：

```ts
POST /production/workbench/checkVideoStateList
```

请求：

```ts
{
  projectId: number;
  scriptId: number;
  videoIds: number[];
}
```

响应：

```ts
{
  data: {
    id: number;
    state: "生成中" | "未生成" | "已完成" | "生成失败";
    src?: string;
    errorReason?: string;
  }[];
}
```

前端按 `id` 在所有轨道的 `videoList` 中查找并更新：

- `state`
- `src`
- `errorReason`

当没有 `生成中` 视频时停止轮询。

### 12.2 提示词状态轮询

生成页维护 `hasGeneratePromptIds`：

```ts
trackList
  .filter(track => track.state === "生成中")
  .map(track => track.id)
```

当列表非空时每 3 秒调用：

```ts
POST /production/workbench/checkVideoPrompt
```

请求：

```ts
{
  projectId: number;
  scriptId: number;
  trackIds: number[];
}
```

响应：

```ts
{
  data: {
    id: number;
    state: "生成中" | "未生成" | "已完成" | "生成失败";
    prompt?: string;
    reason?: string;
  }[];
}
```

前端按轨道 id 更新：

- `track.state`
- `track.prompt`
- `track.reason`

当没有 `生成中` 轨道时停止提示词轮询。

### 12.3 轮询生命周期

- 组件挂载：如果初始化数据中存在生成中任务，开启对应轮询。
- 任务追加：由计算属性变化自动开启轮询。
- 任务全部终态：自动停止轮询。
- 组件卸载：清理视频轮询和提示词轮询定时器。

## 13. 历史视频管理

文件：`src/views/production/components/workbench/generate/components/video.vue`

### 13.1 展示

每个轨道的视频卡片展示当前轨道的 `videoList`：

- `生成中`：显示 loading 覆层。
- `生成失败`：显示失败标签，tooltip 展示 `errorReason`。
- 成功视频：展示封面、播放、下载、选择、删除入口。

视频封面由前端创建 `<video>`，跳到 `0.5s` 后绘制到 canvas 并缓存为 dataURL。

### 13.2 选择最终视频

点击历史视频的选择按钮调用：

```ts
POST /production/workbench/selectVideo
```

请求：

```ts
{
  projectId: number;
  scriptId: number;
  videoId: number;
  trackId: number;
}
```

成功后刷新生成数据，使轨道 `selectVideoId` 和外部展示保持后端事实一致。

### 13.3 删除历史视频

点击删除按钮确认后调用：

```ts
POST /production/workbench/delVideo
```

请求：

```ts
{
  id: number;
}
```

成功后刷新生成数据。

### 13.4 下载和播放

下载使用前端 `fetch(video.src)` 获取 blob，然后创建临时链接下载。播放使用本地弹窗中的 `<video controls autoplay>`，关闭弹窗时清空播放地址。

## 14. 轨道条设计

文件：`src/views/production/components/workbench/generate/components/track.vue`

### 14.1 功能

- 展示所有视频轨道。
- 切换当前轨道。
- 添加轨道。
- 删除轨道。
- 勾选轨道。
- 批量生成提示词。
- 批量生成视频。
- 批量下载已选择视频。

### 14.2 轨道卡片展示规则

优先级：

1. 如果轨道有 `selectVideoId` 且能找到对应视频 `src`，展示选中视频封面。
2. 否则如果轨道有引用素材，展示引用素材缩略图组。
3. 否则展示空轨道占位。

### 14.3 添加轨道

添加前先根据当前模型获取模型详情，读取模型支持的第一个时长作为轨道初始时长：

```ts
POST /modelSelect/getModelDetail
```

然后调用：

```ts
POST /production/workbench/addTrack
```

请求：

```ts
{
  projectId: number;
  scriptId: number;
  duration: number;
}
```

成功后刷新生成数据，并切换到新增轨道。

### 14.4 删除轨道

确认后调用：

```ts
POST /production/workbench/deleteTrack
```

请求：

```ts
{
  id: number;
}
```

成功后：

- 移除该轨道勾选状态。
- 删除 `imageListCache` 中该轨道缓存。
- 刷新生成数据。

### 14.5 批量下载

只下载已勾选轨道中 `selectVideoId` 对应的视频。前端使用 `JSZip` 打包，不调用后端批量下载接口。

## 15. 引用素材缓存

文件：`src/stores/imageListCache.ts`

### 15.1 设计目的

工作台中轨道切换频繁，引用素材需要做到：

- 切换轨道不丢失当前未提交的前端引用状态。
- 后端端口或 host 变化后，缓存不因完整 URL 失效。
- 批量解析素材预览地址，减少重复请求。

### 15.2 缓存结构

```ts
{
  [projectId]: {
    [scriptId]: {
      [trackId]: CachedUploadItem[]
    }
  }
}
```

缓存中的 `src` 会去掉 origin，只保留 path、query、hash。展示时再通过 URL 映射恢复完整地址。

### 15.3 URL 解析接口

```ts
POST /production/workbench/getFileUrl
```

请求：

```ts
{
  items: {
    id: number;
    sources: string;
  }[];
}
```

兼容响应：

```ts
{
  data: {
    data:
      | {
          id: number;
          sources: string;
          url: string;
        }[]
      | Record<string, string>;
  }
}
```

当前 store 对 Axios 解包和后端额外包一层 `{ data }` 做了兼容处理。推荐后端统一返回数组：

```ts
{
  data: [
    { id: 1, sources: "storyboard", url: "http://..." },
    { id: 2, sources: "assets", url: "http://..." }
  ]
}
```

## 16. 视频剪辑模块

文件：`src/views/production/components/workbench/editVideo/index.vue`

### 16.1 定位

剪辑模块是一个前端本地时间线编辑器，基于：

- `vue-clip-track`
- `@webav/av-canvas`
- `@webav/av-cliper`

当前剪辑台主要在前端本地管理轨道、片段、预览和导出，不通过 `/production/workbench/*` 保存剪辑工程。

### 16.2 布局

剪辑台分为三块：

- 左侧媒体库：`mediaLibrary.vue`
- 中央预览：`videoPreview.vue`
- 右侧属性面板：`propertyPanel.vue`
- 底部时间线：`VideoTrack`

### 16.3 媒体来源

全屏工作台容器调用：

```ts
POST /assets/getMaterialData
```

请求：

```ts
{
  projectId: number;
  scriptId: number;
}
```

返回数据被分为：

- 分镜视频：传入 `initialVideoItems`
- 普通视频：传入 `initialMediaItems`
- 音频：传入 `initialAudioItems`
- 图片：传入 `initialImageItems`

### 16.4 时间线能力

剪辑台支持：

- 添加视频、图片、音频、字幕、文本、贴纸、滤镜、特效、转场。
- 主轨模式。
- 跨轨拖拽。
- 吸附。
- 重置、撤销、重做。
- 分割和删除片段。
- 属性面板编辑片段参数。
- WebAV 本地渲染导出 mp4。

## 17. 接口清单

| 模块 | 接口 | 触发时机 | 请求关键字段 | 返回用途 |
| --- | --- | --- | --- | --- |
| 工作台容器 | `POST /assets/getMaterialData` | 打开工作台或切到剪辑页 | `projectId`, `scriptId` | 初始化剪辑台媒体库 |
| 快速预览 | `POST /production/getStoryboardData` | 进入预览页 | `scriptId` | 获取分镜列表 |
| 生成页 | `POST /production/workbench/getGenerateData` | 进入生成页、刷新 | `projectId`, `scriptId` | 获取 `storyboardList` 和 `trackList` |
| 生成页 | `POST /modelSelect/getModelDetail` | 模型变化、添加轨道 | `modelId` | 获取模型模式、时长、分辨率和音频配置 |
| 引用缓存 | `POST /production/workbench/getFileUrl` | 初始化引用缓存 | `items[]` | 按 `id + sources` 获取完整预览 URL |
| 引用选择 | `POST /production/workbench/getAudioBindAssetsList` | 多引用选择资产后 | `assetsIds[]` | 自动补充绑定音频/素材 |
| 提示词 | `POST /production/workbench/updateVideoPrompt` | 提示词失焦 | `id`, `prompt` | 保存轨道提示词 |
| 提示词 | `POST /production/workbench/generateVideoPrompt` | 单轨生成提示词 | `projectId`, `trackId`, `info`, `model`, `mode` | 返回生成后的提示词 |
| 提示词 | `POST /production/workbench/batchGeneratePrompt` | 批量生成提示词 | `projectId`, `trackData`, `model`, `mode`, `concurrentCount` | 创建批量提示词任务 |
| 提示词 | `POST /production/workbench/checkVideoPrompt` | 提示词轮询 | `projectId`, `scriptId`, `trackIds` | 更新轨道提示词状态 |
| 视频生成 | `POST /production/workbench/generateVideo` | 单轨生成视频 | `projectId`, `scriptId`, `uploadData`, `prompt`, `model`, `mode`, `resolution`, `duration`, `audio`, `trackId` | 返回视频记录 id |
| 视频生成 | `POST /production/workbench/batchGenerateVideo` | 批量生成视频 | `projectId`, `scriptId`, `model`, `mode`, `resolution`, `audio`, `trackData` | 返回 `trackId -> videoId` |
| 视频生成 | `POST /production/workbench/checkVideoStateList` | 视频轮询 | `projectId`, `scriptId`, `videoIds` | 更新历史视频状态 |
| 轨道 | `POST /production/workbench/addTrack` | 添加轨道 | `projectId`, `scriptId`, `duration` | 创建轨道 |
| 轨道 | `POST /production/workbench/deleteTrack` | 删除轨道 | `id` | 删除轨道 |
| 轨道 | `POST /production/workbench/updateVideoDuration` | 修改时长 | `id`, `duration` | 保存轨道时长 |
| 历史视频 | `POST /production/workbench/selectVideo` | 选择最终视频 | `projectId`, `scriptId`, `videoId`, `trackId` | 同步轨道选中视频 |
| 历史视频 | `POST /production/workbench/delVideo` | 删除历史视频 | `id` | 删除视频记录 |

## 18. 状态与错误处理规范

### 18.1 生成状态

当前前端仍使用中文状态值：

- `未生成`
- `生成中`
- `已完成`
- `生成失败`

视频轮询和提示词轮询都依赖 `生成中` 判断是否继续轮询。后端必须保证终态最终返回 `已完成` 或 `生成失败`，否则前端会持续请求。

### 18.2 推荐后续收口

为了避免中文状态值编码问题和契约歧义，推荐后续后端同时返回标准状态字段：

```ts
type TaskStatus = "pending" | "queued" | "submitting" | "processing" | "completed" | "failed" | "cancelled";
```

前端展示可以继续使用中文 `state`，业务判断应逐步迁移到 `status`。

### 18.3 错误展示

- 单轨生成接口请求失败：展示接口错误 message。
- 视频轮询返回 `生成失败`：在历史视频卡片展示失败标签，tooltip 显示 `errorReason`。
- 提示词轮询返回 `生成失败`：展示 `reason`。
- 批量生成前，如果勾选轨道缺少提示词，前端直接拦截并提示。

## 19. 端到端交互流程

### 19.1 从分镜生成视频

1. 用户进入生产台，点击工作台节点。
2. 切换到“视频生成”。
3. 前端加载轨道和分镜列表。
4. 用户选择视频模型和生成模式。
5. 用户添加分镜或资产引用。
6. 用户编辑提示词，失焦保存。
7. 用户点击生成视频。
8. 前端提交生成请求并新增一条 `生成中` 历史记录。
9. 前端轮询视频状态。
10. 后端完成后返回视频 `src`。
11. 用户选择一个历史视频作为当前轨道最终视频。
12. 前端刷新轨道数据，轨道条展示选中视频封面。

### 19.2 批量生成视频

1. 用户在轨道条勾选多个轨道。
2. 前端校验每个轨道有提示词。
3. 前端按轨道分别构造 `trackData`。
4. 调用批量生成接口。
5. 后端返回每个轨道对应的视频记录 id。
6. 前端给各轨道追加生成中视频。
7. 视频轮询统一更新所有生成中视频。

### 19.3 进入剪辑台

1. 用户切换到“视频剪辑”。
2. 前端调用 `/assets/getMaterialData` 刷新素材。
3. 按文件类型构造剪辑台媒体库。
4. 用户拖拽素材到时间线。
5. 前端本地预览和剪辑。
6. 用户导出，WebAV 在浏览器端渲染 mp4 并下载。

## 20. 维护注意事项

1. 新增生成模式时，需要同时确认：
   - 模型详情 `mode` 是否返回新模式。
   - `imageSelect.vue` 是否能正确展示槽位。
   - `generate/index.vue` 和 `track.vue` 是否能正确裁剪 `uploadData`。
2. 新增素材来源时，需要扩展：
   - `UploadItem.sources`
   - `/production/workbench/getFileUrl`
   - `imageListCache` 的 `id:sources` 映射。
3. 后端状态值必须稳定，否则前端轮询无法停止。
4. 工作台引用素材缓存是前端本地体验优化，不应作为后端事实来源。
5. 选择最终视频后，前端以刷新后的后端数据为准，不应只做本地乐观更新。
6. 剪辑台当前主要是前端本地能力，如果要支持工程保存，需要新增明确的剪辑工程保存/加载接口。

## 21. 回归测试建议

### 21.1 快速预览

- 进入预览页能加载分镜。
- 播放、暂停、上一镜、下一镜正常。
- 拖动进度条能定位到正确分镜。
- 勾选分镜导出 zip 正常。

### 21.2 视频生成

- 首次进入生成页能加载轨道和分镜。
- 切换模型后模式、时长、分辨率正确刷新。
- 单图、首尾帧、纯文本、多引用模式的引用槽位正确。
- 提示词失焦后重新进入仍保留。
- 单轨生成视频后出现生成中卡片，并能轮询到成功或失败。
- 批量生成视频时，每个轨道生成结果互不串联。
- 选择历史视频后，轨道条显示选中视频封面。
- 删除历史视频后刷新数据正确。

### 21.3 轨道管理

- 添加轨道使用当前模型支持时长。
- 删除轨道后缓存同步清理。
- 切换轨道不丢引用素材。
- 单图模式切换轨道时最多保留一个引用。

### 21.4 剪辑台

- 切到剪辑页后素材库能展示分镜视频、普通视频、音频、图片。
- 视频、图片、音频可拖入时间线。
- 分割、删除、撤销、重做可用。
- 预览比例跟随项目 `videoRatio`。
- 导出 mp4 可下载。
