# 分镜制作工作台前端设计与接口文档

## 1. 文档范围

本文档说明生产台“分镜制作工作台”的前端交互、组件设计、状态流转和接口调用。范围覆盖当前主入口：

- 分镜表节点：`src/views/production/node/storyboardTable.vue`
- 分镜制作节点：`src/views/production/node/storyboard.vue`
- 分镜制作主组件：`src/views/production/node/storyboard/index.vue`
- 分镜制作子组件：`src/views/production/node/storyboard/components/*`
- 分镜预览组合逻辑：`src/views/production/node/storyboard/composables/useStoryboardPreview.ts`
- 图片编辑画布：`src/views/production/components/editImage/index.vue`
- 生产 Agent Store：`src/stores/productionAgent.ts`

本文档只描述当前实际主流程。与视频生成工作台相关的 `components/workbench/*` 不在本文档范围内。

## 2. 产品定位

分镜制作工作台承接剧本和导演计划，负责将文字内容落成可生成图片和后续视频的分镜单元。它承担五类职责：

1. 展示和编辑 AI 生成的分镜表。
2. 展示、编辑、分组和管理分镜条目。
3. 管理每个分镜的提示词、画面描述、时长和参考资产。
4. 发起分镜图片生成，并轮询异步生成结果。
5. 支持单张分镜进入图片编辑画布，管理历史结果、插入新镜头和预览导出。

在生产台主链路中，分镜相关节点位于：

```text
script -> scriptPlan -> storyboardTable -> storyboard -> workbench
```

`storyboardTable` 是分镜方案文本层，`storyboard` 是真正的分镜制作台和图片生成层。

## 3. 总体结构

```text
production canvas
└─ node/storyboardTable.vue
   └─ Markdown preview/editor

production canvas
└─ node/storyboard.vue
   └─ node/storyboard/index.vue
      ├─ StoryboardTableView.vue
      ├─ StoryboardGridView.vue
      ├─ StoryboardReferenceDialog.vue
      ├─ StoryboardPreviewDialog.vue
      ├─ StoryboardImageViewer.vue
      ├─ StoryboardHistoryDialog.vue
      ├─ useStoryboardPreview.ts
      └─ components/editImage/index.vue

stores/productionAgent.ts
├─ AI 流式 XML 解析
├─ flowData 持久化
├─ 分镜信息落库
├─ 分镜图片批量生成
└─ 分镜图片状态轮询
```

## 4. 核心数据模型

分镜数据定义在 `src/views/production/utils/flowBuilder.ts`。

### 4.1 Storyboard

```ts
interface Storyboard {
  id?: number;
  duration?: number;
  prompt: string;
  trackId?: number;
  trackName?: string;
  associateAssetsIds?: number[];
  referenceImages?: StoryboardReference[];
  src: string | null;
  url?: string | null;
  imageUrl?: string | null;
  originalUrl?: string | null;
  thumbnail?: string | null;
  thumb?: string | null;
  state: "未生成" | "生成中" | "已完成" | "生成失败";
  flowId?: number;
  reason?: string;
  videoDesc: string;
  shouldGenerateImage: number;
}
```

字段语义：

- `id`：后端分镜记录 id。
- `prompt`：图片生成提示词。
- `videoDesc`：画面描述，主要用于表格展示和预览说明。
- `duration`：镜头时长，后续视频工作台使用。
- `trackId/trackName`：按轨道分组的依据。
- `associateAssetsIds`：关联资产或衍生资产 id。
- `referenceImages`：本地上传参考图。
- `src`：当前分镜展示图，通常是缩略/展示可用地址。
- `originalUrl/imageUrl/url/thumbnail/thumb`：兼容不同来源的图片地址字段。
- `flowId`：关联图片编辑画布。
- `state`：分镜图片生成状态。
- `reason`：失败原因。
- `shouldGenerateImage`：是否需要生成图片的标记。

当前源码中部分中文状态值存在编码异常，业务语义仍是 `未生成 / 生成中 / 已完成 / 生成失败`。

### 4.2 StoryboardReference

```ts
interface StoryboardReference {
  id: string;
  source: "local";
  url: string;
  name: string;
  type?: "role" | "tool" | "scene" | "clip" | "image";
}
```

本地参考图通过 `/production/editImage/uploadImage` 上传后写入 `referenceImages`。资产参考图不写入 `referenceImages`，而是通过 `associateAssetsIds` 关联资产库。

### 4.3 ReferenceView

前端展示参考图时统一成 `ReferenceView`：

```ts
interface ReferenceView {
  key: string;
  id?: number;
  localId?: string;
  source: "asset" | "local";
  src: string;
  label: string;
  group: string;
  type: "image" | "video" | "audio" | "text";
}
```

`ReferenceView` 是 UI 层模型，供表格资产列、参考图弹窗和 `PromptEditor` 使用。

## 5. 分镜表节点

文件：`src/views/production/node/storyboardTable.vue`

### 5.1 职责

- 展示 AI 生成的分镜表 Markdown。
- 支持用户打开 Markdown 编辑器手动修改。
- 编辑确认后写回 `flowData.storyboardTable`。
- 调用 `productionAgentStore().setFlowData()` 保存生产台流程数据。

### 5.2 交互

1. 节点中展示 `MdPreview`。
2. 点击“编辑”打开全屏比例的 Markdown 编辑弹窗。
3. 用户修改 `editContent`。
4. 点击保存：
   - `storyboardTable.value = editContent.value`
   - 关闭弹窗
   - 调用 `/production/saveFlowData`

### 5.3 输入限制

编辑器拦截粘贴和拖入图片/视频，避免大文件直接写入 Markdown 内容。

## 6. 分镜制作节点

文件：`src/views/production/node/storyboard/index.vue`

### 6.1 顶层职责

- 管理表格视图和网格视图。
- 管理选中分镜集合。
- 管理分镜分组、折叠、批量生成、批量删除。
- 管理参考图弹窗、本地上传和资产选择。
- 管理图片编辑画布入口。
- 管理历史图片弹窗和历史结果选择。
- 管理九宫格/时间线预览弹窗。
- 管理大图查看器。

### 6.2 主要状态

- `viewMode`：`table | grid`，使用本地存储记住用户偏好。
- `gridScale`：网格视图缩放比例，使用本地存储记住用户偏好。
- `selectedIds`：已选分镜 id。
- `generateLoading`：批量生成按钮 loading。
- `previewVisible`：预览弹窗显示状态。
- `previewMode`：预览模式，`grid | timeline`。
- `previewGroupIndex/previewPageIndex/timelineIndex`：预览分页和时间线位置。
- `historyVisible/historyItems/historySelectedId`：历史结果弹窗状态。
- `referenceVisible/currentReferenceTarget`：参考图管理弹窗状态。
- `imageRatioMap`：运行时记录图片自然比例，用于预览排版。
- `currentRow`：打开图片编辑画布时传入的目标数据。

### 6.3 视图切换

分镜制作台支持两种视图：

- 表格视图：适合编辑提示词、参考图、时长和操作单个分镜。
- 网格视图：适合快速浏览画面效果和批量选择。

视图切换只影响前端展示，不改变数据结构。

## 7. 表格视图设计

文件：`src/views/production/node/storyboard/components/StoryboardTableView.vue`

### 7.1 表格列

当前表格列由主组件配置：

| 列 | 字段 | 说明 |
| --- | --- | --- |
| 镜号 | `shot` | 勾选框和 `S01/S02` 标签 |
| 关联资产 | `assets` | 展示资产参考图和本地参考图 |
| 提示词 | `prompt` | `PromptEditor` 富文本提示词编辑器 |
| 图片 | `image` | 当前分镜图片、生成状态和图片操作 |
| 时长 | `duration` | 秒数输入和加减按钮 |
| 操作 | `operate` | 编辑信息、删除分镜 |

### 7.2 分组

如果任意分镜存在 `trackId`，表格按 `trackId` 分组展示。每个分组包含：

- 折叠/展开按钮。
- 分组标题，优先使用 `trackName`。
- 分组条目数量。
- 生成该组所有分镜图片的按钮。

如果没有 `trackId`，所有分镜归入一个“全部镜头”分组。

### 7.3 提示词编辑

表格提示词列使用：

```vue
<PromptEditor
  v-model="row.prompt"
  :references="getStoryboardReferences(row)"
  @blur="emit('saveStoryboardInfo', row)"
/>
```

失焦后保存当前分镜信息。保存接口见“分镜信息保存”。

### 7.4 图片状态

图片列根据 `row.state` 展示：

- `已完成 + src`：展示缩略图，点击打开大图查看器。
- `生成中`：显示 loading。
- `生成失败`：显示失败文案，tooltip 展示 `reason`。
- 其他状态：显示未生成。

图片操作包括：

- 重新生成。
- 编辑节点，进入图片编辑画布。
- 查看历史结果。

### 7.5 时长编辑

用户可以通过 `- / +` 按钮或数字输入修改 `duration`。每次修改后立即触发 `saveStoryboardInfo(row)`。

## 8. 网格视图设计

文件：`src/views/production/node/storyboard/components/StoryboardGridView.vue`

### 8.1 功能

- 以卡片网格展示分镜图片。
- 每个卡片显示勾选框和 `Sxx` 标签。
- 支持点击图片进入编辑画布。
- 支持重新生成、编辑、删除。
- 支持整体缩放，便于浏览大量分镜。

### 8.2 展示规则

- `已完成 + src`：展示图片。
- `生成中`：显示 loading。
- `生成失败`：显示失败状态。
- 未生成：显示空状态，点击也可进入编辑画布。

## 9. 参考图管理

文件：`src/views/production/node/storyboard/components/StoryboardReferenceDialog.vue`

### 9.1 来源

每个分镜支持两类参考图：

1. 资产参考图：来自 `assetsData` 的资产或衍生资产，通过 `associateAssetsIds` 关联。
2. 本地参考图：用户本地上传，通过 `referenceImages` 存储。

### 9.2 资产选择

点击“从资产选择”后调用公共选择器：

```ts
openAssetsSelector({ multiple: true, title: $t("common.selectAssets") })
```

选择完成后：

1. 将资产 id 追加到 `row.associateAssetsIds`。
2. 去重。
3. 调用 `saveStoryboardInfo(row)` 保存。

### 9.3 本地上传

点击“本地上传”后：

1. 打开本地文件选择器，限制 `.png,.jpg,.jpeg,.webp`。
2. 使用 `FileReader` 转成 base64。
3. 调用上传接口。
4. 将返回地址写入 `row.referenceImages`。
5. 调用 `saveStoryboardInfo(row)` 保存。

接口：

```ts
POST /production/editImage/uploadImage
```

请求：

```ts
{
  base64Data: string;
  projectId: number;
  scriptId: number;
}
```

响应：

```ts
{
  data: string;
}
```

`data` 是上传后的图片地址。

### 9.4 删除参考图

删除资产参考图时，从 `associateAssetsIds` 移除对应 id。

删除本地参考图时，从 `referenceImages` 移除对应 `localId`。

删除后立即调用 `saveStoryboardInfo(row)`。

## 10. 分镜信息保存

分镜基础信息保存调用：

```ts
POST /production/storyboard/editStoryboardInfo
```

请求：

```ts
{
  id: number;
  prompt: string;
  videoDesc: string;
  duration: number;
  associateAssetsIds: number[];
  referenceImages: StoryboardReference[];
}
```

触发场景：

- 提示词编辑器失焦。
- 修改时长。
- 添加或删除参考图。
- 编辑信息弹窗确认。

前端保存失败时只提示错误，不回滚本地输入。

## 11. 分镜图片生成

分镜图片生成由 `productionAgentStore.batchGenerateStoryboard` 统一发起。

### 11.1 单张重新生成

触发入口：

- 表格视图图片列的重新生成按钮。
- 网格视图卡片的重新生成按钮。

流程：

1. 判断 `row.id` 存在且当前不是 `生成中`。
2. 前端将 `row.state` 临时置为 `生成中`，清空 `reason`。
3. 调用 `batchGenerateStoryboard([row.id], true)`。
4. 后端返回后更新 `state/src`。
5. 如果仍是 `生成中`，由轮询继续更新。

### 11.2 分组生成

表格分组头可以生成该组全部分镜：

```ts
const ids = rows.map(item => item.id).filter(Boolean);
productionStore.batchGenerateStoryboard(ids, true);
```

### 11.3 批量生成

底部“生成图片”按钮对 `selectedIds` 批量生成：

1. 校验至少选择一个分镜。
2. 设置 `generateLoading = true`。
3. 调用 `batchGenerateStoryboard(selectedIds, true)`。
4. 成功后清空选择。
5. 最终关闭 loading。

### 11.4 生成接口

```ts
POST /production/storyboard/batchGenerateImage
```

请求：

```ts
{
  scriptId: number;
  projectId: number | string;
  storyboardIds: number[];
  concurrentCount: number;
  compulsory: boolean;
}
```

字段说明：

- `storyboardIds`：要生成的分镜 id 列表。
- `concurrentCount`：并发数，来自 `settingStore().otherSetting.assetsBatchGenereateSize`。
- `compulsory`：是否强制生成，当前 UI 重新生成和批量生成传 `true`。

响应：

```ts
{
  data: Storyboard[];
}
```

前端用返回数据更新本地 `flowData.storyboard` 中对应条目的：

- `state`
- `src`

## 12. 图片状态轮询

轮询逻辑在 `src/stores/productionAgent.ts`。

### 12.1 待轮询 id

```ts
const storyboardNotStateImageIds = computed(() => {
  const ids: number[] = [];
  flowData.value.storyboard.forEach((item) => {
    if (item.state === "生成中" && item.id) ids.push(item.id);
  });
  return ids;
});
```

只有 `生成中` 且存在 `id` 的分镜会进入轮询。

### 12.2 轮询接口

```ts
POST /production/storyboard/pollingImage
```

请求：

```ts
{
  ids: number[];
}
```

响应：

```ts
{
  data: {
    id: number;
    state: "未生成" | "生成中" | "已完成" | "生成失败";
    src?: string;
    reason?: string;
  }[];
}
```

前端按 `id` 更新：

- `state`
- `src`
- `reason`

### 12.3 轮询策略

- 每批最多轮询 20 个 id。
- 页面可见时轮询间隔 10 秒。
- 页面隐藏时轮询间隔 30 秒。
- 如果已有请求未完成，不发起下一次请求。
- 当没有 `生成中` 分镜时停止轮询。
- 页面 `visibilitychange` 时重新按当前可见状态调度间隔。

## 13. 图片编辑画布集成

分镜制作台复用图片编辑画布：

```vue
<editImage
  v-model="visible"
  v-if="visible"
  :flowData="currentRow"
  type="storyboard"
  @save="save"
/>
```

### 13.1 打开编辑画布

入口：

- 表格视图图片列“编辑节点”。
- 网格视图点击图片或编辑按钮。
- 未生成占位也可以进入编辑画布。

打开时构造：

```ts
currentRow = {
  flowId: item.flowId ?? null,
  targetType: "storyboard",
  targetId: item.id ?? null,
  resultImages: [{ src: item.src || "", prompt: item.prompt || "" }],
  referanceImages: [
    ...getAssetReferenceImagesByIds(item.associateAssetsIds),
    ...getLocalReferenceImages(item)
  ]
}
```

资产参考图会优先使用：

- 原图：`originalUrl || imageUrl || src`
- 缩略图：`thumbnail || thumb || src`

### 13.2 保存已有分镜

图片编辑画布保存后触发：

```ts
save({ imageUrl, flowId })
```

如果是已有分镜：

1. 找到对应 `storyboard.id`。
2. 写入 `target.flowId = flowId`。
3. 如果 `imageUrl` 存在，写入：
   - `target.src = imageUrl`
   - `target.state = "已完成"`

画布内部负责调用 `saveImageFlow` 持久化画布结构和最终图片。

### 13.3 插入新分镜

如果打开画布时传入 `insertAfterIndex`，保存时会创建新分镜：

```ts
POST /production/storyboard/addStoryboard
```

请求：

```ts
{
  duration: number;
  prompt: string;
  src: string;
  videoDesc: string;
  shouldGenerateImage: number;
  state: "已完成";
  projectId: number;
  scriptId: number;
  flowId: number;
}
```

成功后，前端将新分镜插入到 `storyboard[insertAfterIndex + 1]`，并调用 `productionStore.setFlowData()` 保存流程数据。

## 14. 历史结果管理

文件：`src/views/production/node/storyboard/components/StoryboardHistoryDialog.vue`

### 14.1 打开历史

点击表格图片列历史按钮后调用：

```ts
POST /production/editImage/getImageHistory
```

请求：

```ts
{
  projectId: number;
  scriptId: number;
  targetType: "storyboard";
  targetId: number;
}
```

响应会映射为：

```ts
{
  id: number;
  url: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  quality?: string;
  createTime?: string;
}
```

历史弹窗展示缩略图、提示词和创建时间。

### 14.2 选择历史结果

选择历史图片时：

1. 如果目标分镜已有 `flowId`，先调用 `/production/editImage/getImageFlow` 获取现有 `nodes/edges`。
2. 调用 `/production/editImage/saveImageFlow`，传入 `selectedImageUrl`。
3. 更新当前分镜：
   - `flowId`
   - `src`
   - `state = "已完成"`
4. 关闭历史弹窗。

接口：

```ts
POST /production/editImage/getImageFlow
```

请求：

```ts
{
  id: number;
}
```

接口：

```ts
POST /production/editImage/saveImageFlow
```

请求：

```ts
{
  flowId: number | null;
  projectId: number;
  scriptId: number;
  targetType: "storyboard";
  targetId: number;
  nodes: unknown[];
  edges: unknown[];
  selectedImageUrl: string;
}
```

后端应在事务中同步画布最终图和分镜当前图。

## 15. 分镜预览设计

文件：

- `src/views/production/node/storyboard/components/StoryboardPreviewDialog.vue`
- `src/views/production/node/storyboard/composables/useStoryboardPreview.ts`

### 15.1 可预览项

只有满足以下条件的分镜进入预览：

```ts
Boolean(item.src && item.state === "已完成")
```

### 15.2 九宫格预览

无轨道分组时：

- 每页最多 9 张。
- 固定 3 x 3。
- 通过上一页/下一页切换。
- 展示 `Sxx` 标签。
- 点击图片打开大图查看器。

存在轨道分组时：

- 按轨道组展示。
- 网格列数根据组内数量动态计算。
- 通过上一组/下一组切换。

### 15.3 时间线预览

时间线预览包含：

- 主图区域。
- 左右切换按钮。
- 右侧信息面板，展示镜号、时长、描述。
- 底部缩略条。
- 当前序号计数。

`timelineIndex` 是当前时间线位置，切换预览组或预览项变化时会重置为 0。

### 15.4 图片地址选择

预览图片使用：

```ts
getStoryboardImageUrl(item, "preview")
```

优先级：

```text
originalUrl -> imageUrl -> url -> src
```

普通展示使用：

```text
src -> thumbnail -> thumb -> imageUrl -> url
```

### 15.5 图片适配

前端会记录图片真实比例：

```ts
imageRatioMap[src] = `${naturalWidth} / ${naturalHeight}`;
```

如果图片特别窄或特别宽，预览使用 `object-fit: contain`；其他情况使用 `cover`。

### 15.6 下载预览

点击“下载整集预览”后：

```ts
POST /production/storyboard/downPreviewImage
```

请求：

```ts
{
  storyboardIds: number[];
}
```

响应类型：

```ts
Blob
```

前端将 Blob 下载为：

```text
storyboardImagePreview-{timestamp}.png
```

## 16. 大图查看器

文件：`src/views/production/node/storyboard/components/StoryboardImageViewer.vue`

### 16.1 打开逻辑

点击表格缩略图、预览图或网格图片后打开。

查看器会优先在当前分组中查找已完成图片；如果没有分组，则使用全部已完成分镜。

### 16.2 展示内容

- 当前图片。
- 当前分镜提示词。
- 上一张/下一张切换。
- 弹窗标题为 `Sxx`。

## 17. 删除分镜

### 17.1 单个删除

接口：

```ts
POST /production/storyboard/removeFrame
```

请求：

```ts
{
  id: number;
  projectId: number;
}
```

成功后前端从 `storyboard` 数组中移除该分镜。

### 17.2 批量删除

接口：

```ts
POST /production/storyboard/batchDelete
```

请求：

```ts
{
  ids: number[];
  projectId: number;
}
```

成功后前端过滤掉所有已删除分镜，并清空 `selectedIds`。

## 18. 生产 Agent 与分镜数据生成

文件：`src/stores/productionAgent.ts`

### 18.1 Socket 连接

生产 Agent 使用 `useChat` 连接：

```ts
`${settingStore().baseUrl}/socket/productionAgent`
```

鉴权上下文：

```ts
{
  isolationKey: `${projectId}:productionAgent:${episodesId}`,
  projectId,
  scriptId: episodesId
}
```

### 18.2 XML 标签

Agent 流式输出支持以下 XML 标签：

- `script`
- `scriptPlan`
- `storyboardTable`
- `storyboardItem`

其中：

- `storyboardTable` 写入 `flowData.storyboardTable`。
- `storyboardItem` 完成时转换为 `Storyboard` 并写入 `flowData.storyboard`。

### 18.3 storyboardItem 解析

`storyboardItem` 完成时读取属性：

- `prompt`
- `duration`
- `track`
- `videoDesc`
- `shouldGenerateImage`
- `associateAssetsIds`

如果本地已存在相同 `prompt + duration + videoDesc` 的条目，则更新提示词；否则追加新分镜，并调用 `addStoryboardInfo` 落库。

### 18.4 分镜信息批量落库

接口：

```ts
POST /production/storyboard/batchAddStoryboardInfo
```

请求：

```ts
{
  scriptId: number;
  projectId: number | string;
  data: {
    prompt: string;
    duration: number;
    track: string;
    state: "未生成";
    src: null;
    videoDesc: string;
    shouldGenerateImage: number;
    associateAssetsIds: number[];
  }[];
}
```

响应：

```ts
{
  data: Storyboard[];
}
```

前端按 `prompt + duration + videoDesc` 匹配回填：

- `id`
- `trackId`
- `src`
- `state`
- `associateAssetsIds`

### 18.5 流程数据保存

接口：

```ts
POST /production/saveFlowData
```

请求：

```ts
{
  projectId: number | string;
  episodesId: number;
  data: FlowData;
}
```

触发场景：

- AI XML 标签完成后的节流保存。
- 分镜表手动编辑保存。
- 插入新分镜后保存流程。

节流策略：500ms。

### 18.6 流程数据读取

接口：

```ts
POST /production/getFlowData
```

请求：

```ts
{
  projectId: number | string;
  episodesId: number;
}
```

响应直接赋值给 `flowData`。

## 19. 接口清单

| 模块 | 接口 | 触发时机 | 请求关键字段 | 返回用途 |
| --- | --- | --- | --- | --- |
| 流程数据 | `POST /production/saveFlowData` | AI 输出、分镜表编辑、插入分镜 | `projectId`, `episodesId`, `data` | 保存生产台流程数据 |
| 流程数据 | `POST /production/getFlowData` | 初始化/恢复生产台 | `projectId`, `episodesId` | 恢复 `flowData` |
| 分镜落库 | `POST /production/storyboard/batchAddStoryboardInfo` | Agent 生成新分镜条目 | `projectId`, `scriptId`, `data[]` | 回填分镜 id 和分组信息 |
| 分镜编辑 | `POST /production/storyboard/editStoryboardInfo` | 提示词、描述、时长、参考图变化 | `id`, `prompt`, `videoDesc`, `duration`, `associateAssetsIds`, `referenceImages` | 保存单条分镜信息 |
| 分镜生成 | `POST /production/storyboard/batchGenerateImage` | 单张、分组、批量生成图片 | `projectId`, `scriptId`, `storyboardIds`, `concurrentCount`, `compulsory` | 创建/更新分镜图片任务 |
| 分镜轮询 | `POST /production/storyboard/pollingImage` | 存在生成中分镜时 | `ids[]` | 更新 `state/src/reason` |
| 分镜新增 | `POST /production/storyboard/addStoryboard` | 编辑画布插入新镜头 | `projectId`, `scriptId`, `flowId`, `src` | 创建新分镜记录 |
| 分镜删除 | `POST /production/storyboard/removeFrame` | 单个删除 | `id`, `projectId` | 删除单个分镜 |
| 分镜删除 | `POST /production/storyboard/batchDelete` | 批量删除 | `ids`, `projectId` | 删除多个分镜 |
| 预览下载 | `POST /production/storyboard/downPreviewImage` | 下载整集预览 | `storyboardIds` | 返回预览合成图 Blob |
| 本地参考图 | `POST /production/editImage/uploadImage` | 上传参考图 | `base64Data`, `projectId`, `scriptId` | 返回图片地址 |
| 历史结果 | `POST /production/editImage/getImageHistory` | 打开历史弹窗 | `projectId`, `scriptId`, `targetType`, `targetId` | 获取历史图片 |
| 画布读取 | `POST /production/editImage/getImageFlow` | 选择历史结果前 | `id` | 获取现有画布 nodes/edges |
| 画布保存 | `POST /production/editImage/saveImageFlow` | 选择历史结果、编辑画布保存 | `flowId`, `targetType`, `targetId`, `nodes`, `edges`, `selectedImageUrl` | 保存画布并同步最终图 |

## 20. 端到端交互流程

### 20.1 AI 生成分镜

1. 用户在生产台聊天中触发生成。
2. `productionAgent` Socket 接收 XML。
3. `storyboardTable` 标签写入分镜表 Markdown。
4. `storyboardItem` 标签完成时追加分镜。
5. 前端调用 `/production/storyboard/batchAddStoryboardInfo` 落库。
6. 后端返回分镜 id 和分组字段。
7. 前端回填到 `flowData.storyboard`。
8. 节流调用 `/production/saveFlowData`。

### 20.2 生成分镜图片

1. 用户选择一张、多张或一组分镜。
2. 前端调用 `/production/storyboard/batchGenerateImage`。
3. 后端创建异步图片任务并返回初始状态。
4. 前端更新 `state/src`。
5. 如果存在 `生成中` 分镜，store 自动轮询 `/production/storyboard/pollingImage`。
6. 后端返回终态后，前端更新展示。

### 20.3 编辑分镜图片

1. 用户点击某个分镜图片的编辑按钮。
2. 前端构造 `currentRow`，包含目标 id、已有结果图和参考图。
3. 打开图片编辑画布。
4. 用户在画布中生成或选择结果。
5. 画布保存后触发 `save({ imageUrl, flowId })`。
6. 前端更新该分镜 `src/state/flowId`。

### 20.4 选择历史结果

1. 用户打开历史弹窗。
2. 前端调用 `/production/editImage/getImageHistory`。
3. 用户点击某张历史图。
4. 前端读取旧画布 `nodes/edges`。
5. 调用 `/production/editImage/saveImageFlow`，传入 `selectedImageUrl`。
6. 后端事务同步画布最终图和分镜当前图。
7. 前端更新本地分镜展示。

### 20.5 预览和下载

1. 用户点击“九宫格预览”。
2. 前端筛选已完成分镜。
3. 在九宫格或时间线中浏览。
4. 点击下载整集预览。
5. 前端调用 `/production/storyboard/downPreviewImage`。
6. Blob 下载为 PNG。

## 21. 状态与错误处理规范

### 21.1 状态判断

当前前端业务判断依赖中文 `state`：

- `未生成`：可生成，可编辑。
- `生成中`：显示 loading，禁止重复生成。
- `已完成`：显示图片，可预览、编辑、历史选择。
- `生成失败`：展示失败状态和 `reason`。

后续建议逐步迁移到标准状态字段：

```ts
type TaskStatus = "pending" | "queued" | "submitting" | "processing" | "completed" | "failed" | "cancelled";
```

中文 `state` 保留用于展示，业务判断使用 `status`。

### 21.2 错误处理

- 保存分镜信息失败：提示错误，不回滚用户输入。
- 上传参考图失败：提示上传失败。
- 图片生成失败：分镜状态显示 `生成失败`，tooltip 展示 `reason`。
- 预览下载失败：提示图片加载失败。
- 删除失败：保留本地列表并提示错误。

## 22. 维护注意事项

1. `associateAssetsIds` 只存资产 id，不直接存资产图片 URL。
2. `referenceImages` 只存本地上传参考图。
3. 图片编辑画布保存时必须携带 `targetType="storyboard"` 和 `targetId`。
4. 分镜图片当前图以 `src` 为主，预览高清图优先使用 `originalUrl/imageUrl/url`。
5. 后端必须保证生成任务终态稳定返回，否则前端轮询不会停止。
6. `storyboardTable` 是 Markdown 文本，不等同于结构化 `storyboard` 数组。
7. 插入新分镜后需要同时更新后端分镜表和前端 `flowData`。
8. 大批量分镜生成时，前端轮询按 20 个一批滚动请求，后端接口需要支持部分 id 查询。

## 23. 回归测试建议

### 23.1 分镜表

- AI 生成后能展示 Markdown 分镜表。
- 手动编辑保存后刷新仍保留。
- 粘贴图片/视频不会写入 Markdown。

### 23.2 表格视图

- 分镜能按轨道分组。
- 分组折叠、展开正常。
- 提示词失焦保存。
- 参考资产添加、删除正常。
- 本地参考图上传、删除正常。
- 时长加减和输入保存正常。
- 单张删除和批量删除正常。

### 23.3 网格视图

- 网格缩放正常。
- 勾选状态与批量操作同步。
- 点击图片能进入编辑画布。
- 生成中、失败、未生成状态展示正确。

### 23.4 图片生成

- 单张重新生成能进入 `生成中`。
- 分组生成只生成当前组。
- 批量生成只生成已选分镜。
- 轮询能更新成功图片和失败原因。
- 页面隐藏后轮询间隔变长，回到前台后恢复。

### 23.5 编辑画布

- 已有分镜打开画布能带入当前图和参考图。
- 资产参考图使用缩略图展示，原图用于生成。
- 保存结果后分镜 `src/state/flowId` 更新。
- 插入新分镜后顺序正确，刷新后仍存在。
- 历史结果可打开、可选择，选择后画布和分镜当前图一致。

### 23.6 预览

- 九宫格只展示已完成分镜。
- 无分组时按 9 张分页。
- 有轨道分组时按组切换。
- 时间线主图、信息区、底部缩略条联动。
- 下载整集预览能得到 PNG。
