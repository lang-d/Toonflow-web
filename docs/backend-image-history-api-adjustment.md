# 图片历史接口后端调整评估

> 状态：评估提案，后端尚未实施。

## 目标

图片历史分为两套独立数据源，不合并存储：

- 普通资产图片历史：`o_image`，正式接口为 `POST /api/assets/getImage`
- 图片编辑器和分镜生成历史：`o_editImageTask`，正式接口为 `POST /api/production/editImage/getImageHistory`

废弃接口 `POST /api/production/editImage/getAssetImageHistory` 仅保留兼容，不再新增前端调用。

## 1. `/assets/getImage`

### 请求

保持现有请求结构：

```json
{
  "assetsId": 1781193527941
}
```

### 建议响应

保持 `tempAssets` 结构兼容，在每张图片上补充规范媒体和最新任务信息：

```json
{
  "id": 1781193527941,
  "imageId": 458,
  "tempAssets": [
    {
      "id": 458,
      "assetsId": 1781193527941,
      "type": "tool",
      "state": "已完成",
      "status": "completed",
      "selected": true,
      "taskId": "cf8281a7-35ce-4072-9d51-43effe31e689",
      "legacyTaskId": 2067,
      "media": {
        "type": "image",
        "path": "1781970050416/props/example.jpg",
        "url": "http://127.0.0.1:10588/oss/1781970050416/props/example.jpg",
        "previewUrl": "http://127.0.0.1:10588/oss/1781970050416/props/example.jpg?size=20"
      }
    }
  ]
}
```

### 查询与映射

- 查询 `o_image.assetsId = assetsId` 的全部图片记录。
- 一次性按图片 ID 查询 `o_tasks`，避免逐图片查询：
  - `businessType = "image"`
  - `businessId IN (imageIds)`
- 每张图片取 `updateTime` 最新的任务记录。
- 字段映射：
  - `taskId = o_tasks.taskId`
  - `legacyTaskId = o_tasks.id`
  - `status = o_tasks.status`
  - 无关联任务时，由 `o_image.state` 转换为统一状态。
- `media` 使用 `mediaRef.toMediaRef(o_image.filePath)` 生成。
- `selected` 由 `o_assets.imageId === o_image.id` 判断。
- 建议按 `o_image.id DESC` 返回，保证最新图片优先。
- 资产不存在时返回 `404`，不要对空资产使用非空断言。

### 兼容要求

- 保留 `id/imageId/tempAssets/state/selected`。
- 可暂时保留旧 `filePath`，但 `media` 是正式媒体来源。
- 活动态必须保留原始统一状态：`queued/submitting/processing`，不能全部压成 `processing`。

## 2. `/cornerScape/getAllAssets`

该接口只负责资产列表、当前主图和音频关联，不再附带图片历史。

建议移除当前循环中的：

- 按每个父资产查询 `o_image` 的 N+1 查询
- `historyImages` 响应字段
- 历史图片 URL 转换

原因：

- 塑角造景将按当前资产 ID 调用 `/assets/getImage`。
- 现有逻辑只查询顶层资产，无法可靠返回衍生资产历史。
- 全局媒体契约会将 `historyImages` 改为 `historyMediaList`，与现有前端字段不一致。

## 3. `/production/editImage/getImageHistory`

### 请求

分镜：

```json
{
  "projectId": 1781970050416,
  "scriptId": 123,
  "targetType": "storyboard",
  "targetId": 795
}
```

衍生资产：

```json
{
  "projectId": 1781970050416,
  "scriptId": 123,
  "targetType": "deriveAsset",
  "targetId": 456
}
```

### 建议响应项

```json
{
  "id": 1001,
  "historyId": 1001,
  "media": {
    "type": "image",
    "path": "1781970050416/imageFlow/example.jpg",
    "url": "http://127.0.0.1:10588/oss/1781970050416/imageFlow/example.jpg",
    "previewUrl": "http://127.0.0.1:10588/oss/1781970050416/imageFlow/example.jpg?size=20"
  },
  "prompt": "...",
  "model": "...",
  "ratio": "16:9",
  "quality": "2K",
  "createTime": 1782058316987
}
```

### 实现要求

- 保持现有项目、剧集、目标类型和目标 ID 过滤。
- 只返回已完成且存在结果路径的 `o_editImageTask`。
- 直接通过 `mediaRef.toMediaRef(task.url)` 返回 `media`。
- 列表使用 `media.previewUrl`，选择和保存使用 `media.path/media.url`。
- 过渡期可保留 `url = media.url`，但 `media` 应为正式字段。
- 不再先生成缩略图 URL，再依赖全局响应中间件反推原图。

## 4. 废弃接口

`/production/editImage/getAssetImageHistory`：

- 保留现有兼容路由。
- 内部继续转调 `getImageHistory()`。
- 保留 deprecated 日志。
- 不删除路由，不新增前端调用。

## 验收测试

1. `/assets/getImage` 同时覆盖父资产和衍生资产，各自只返回自己的 `o_image` 记录。
2. 排队、提交、生成、完成、失败任务返回正确统一状态和任务 ID。
3. 当前选中图片的 `selected` 与 `o_assets.imageId` 一致。
4. `/cornerScape/getAllAssets` 不再执行逐资产历史查询。
5. `getImageHistory` 返回的 `media.url` 为原图，`media.previewUrl` 为列表预览图。
6. storyboard 与 deriveAsset 的历史数据按 `projectId/scriptId/targetType/targetId` 隔离。
7. 废弃接口仍能返回与正式接口等价的数据。
8. 运行后端 `npm run lint`、相关 API 测试和 `npm run build`。

## 风险提示

- `o_tasks.businessId` 对资产生图表示 `o_image.id`，关联时必须同时限制 `businessType = "image"`。
- 不要用 `targetId` 关联图片记录；资产任务的 `targetId` 是资产 ID。
- 媒体字段应在服务层明确生成，避免业务代码依赖全局响应转换的隐式改名行为。
