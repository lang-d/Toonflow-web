# 图片画布后端配合调整说明

## 目标与边界

前端已按照既有 API 契约处理画布初始化、异步任务轮询、保存退出和最终图片选择。后端需要负责：

- 异步任务状态和结果持久化。
- 防止前端全量保存覆盖任务刚写入的节点字段。
- 修复最终图片事务中的真实表字段错误。
- 一次性清理现有空画布及错误任务状态。

不新增业务接口，不改变现有请求字段。

## 状态契约

`status`是唯一业务状态，`state`只保留兼容展示。

```ts
type TaskStatus =
  | "pending"
  | "queued"
  | "submitting"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
```

- `pending`：节点尚未生成，不轮询，可以没有`taskId`。
- `queued / submitting / processing`：活跃任务，必须存在`taskId`。
- `completed / failed / cancelled`：终态，节点上的活动`taskId`应清空。
- 任务创建、完成和失败时，后端必须直接更新`o_imageFlow.flowData`中对应的真实`nodeId`。

## 必须修改

### 0. 衍生资产 prompt 来源

卡片生成衍生资产时，后端仍以`o_assets.prompt`作为生成提示词来源。

前端在画布“保存并退出”和卡片“生成”前会调用现有：

```txt
POST /assets/updateAssets
```

同步衍生资产的`prompt`。后端需要保持该接口可更新衍生资产行，不要只允许基础资产更新。

如果后端希望完全收口到`saveImageFlow`，可以在`saveImageFlow`保存`targetType="deriveAsset"`时，从目标 generated 节点同步`prompt`到`o_assets.prompt`；但这不是新增接口要求。

### 1. 修复最终图片事务

位置：`src/services/imageFlow.ts`中的`updateImageFlowTarget`。

真实数据库的`o_assets`没有`state`字段。衍生资产选择最终图片时：

```ts
await trx("o_image").where("id", imageId).update({
  filePath: stripUrl(selectedImageUrl),
  state: "已完成",
  assetsId: targetId,
});

await trx("o_assets").where("id", targetId).update({
  flowId,
  imageId,
});
```

禁止向`o_assets`写入`state`。`o_image.state`是衍生资产图片状态的唯一来源，`getFlowData`也应继续从`o_image.state`读取。

对应集成测试必须删除测试表中虚构的`o_assets.state`，并改为断言`o_image.state === "已完成"`。

### 2. 防止全量保存覆盖异步任务

`saveImageFlow`更新已有 flow 前，需要读取数据库中的当前节点及`o_editImageTask`。

以下字段由后端任务服务拥有：

```ts
[
  "taskId",
  "status",
  "state",
  "reason",
  "generatedImage",
  "historyId",
  "selectedResult",
]
```

处理规则：

- 前端提交的节点存在活动`taskId`时，以`o_editImageTask`当前记录重建上述字段。
- 前端提交活跃状态，但数据库节点或任务已经进入终态时，保留数据库终态和结果。
- 前端仍可更新节点位置、提示词、模型、引用图和连线，但不能把后端刚完成的结果覆盖成旧的`processing`快照。
- 多个生成节点必须按`flowId + nodeId`独立合并，不能按资产 ID 或数组下标匹配。

### 3. 轮询返回

`POST /production/editImage/pollImageTask`继续返回 HTTP 200 的统一响应。

任务不存在时必须返回结构化业务结果：

```ts
{
  taskId,
  nodeId: "",
  status: "failed",
  state: "生成失败",
  reason: "任务不存在"
}
```

任务完成必须包含：

```ts
{
  taskId,
  nodeId,
  status: "completed",
  state: "已完成",
  url,
  historyId
}
```

前端只根据`status`决定是否继续轮询。

## 一次性数据迁移

迁移应在数据库结构初始化完成后执行，并使用`o_setting`记录版本，例如：

```txt
key: migration:image-flow-contract-v2
```

执行步骤：

1. 若版本标记已存在，直接跳过。
2. 扫描确认存在异常后，将真实`db2.sqlite`备份到：

   ```txt
   backups/db2-before-image-flow-v2-<timestamp>.sqlite
   ```

3. 在一个事务中修复数据并写入版本标记。
4. 迁移必须幂等，不得重复创建节点或历史记录。

### 节点状态修复规则

- `pending + 有 generatedImage/selectedResult.url`改为`completed`。
- 合法的`pending + 无图片 + 无 taskId`保持`pending`。
- 活跃状态无`taskId`且有图片，改为`completed`。
- 活跃状态无`taskId`且无图片，改为`failed`并写明迁移原因。
- 有`taskId`时，以`o_editImageTask.status`为准。
- 所有终态节点清空活动`taskId`。

### 空画布重建

对被资产或分镜引用、但`flowData.nodes`为空的 flow：

- 衍生资产：
  - 从父资产当前图片重建 upload 节点。
  - 从衍生资产当前`o_image.filePath`重建 generated 节点。
  - 使用该 flow 最近一条完成任务恢复原`nodeId`、提示词、模型、比例、清晰度、`historyId`和`selectedResult`。
  - 父资产有图片时恢复 upload 到 generated 的连线。
- 分镜：
  - 使用`o_storyboard.filePath`和最近完成任务恢复 generated 节点。
- 已完成的历史任务只用于恢复，不复制、不删除。
- 仍活跃但找不到对应 flow/node 的任务标记为`failed`，原因写明“历史任务对应的画布节点不存在”。

当前已确认的异常样本：

- flow 43：节点和连线为空，但目标衍生资产和完成任务存在，需要重建。
- flow 45、46、75：有生成图片、无`taskId`，但`status=pending`，需要改为`completed`。

## 验收

后端测试至少覆盖：

- 使用真实`o_assets`结构执行最终图片事务。
- 两个生成节点并行时，保存画布不会串任务或覆盖结果。
- 前端旧`processing`快照不能覆盖数据库`completed`结果。
- 空画布能够从目标图片及最近完成任务恢复。
- 状态迁移重复执行不产生二次修改。

迁移后数据检查目标：

- 被有效目标引用且目标有图片的空画布数量为 0。
- `queued / submitting / processing`但无`taskId`的节点数量为 0。
- 活跃任务找不到对应 flow/node 的数量为 0。

运行：

```bash
yarn lint
yarn test:api
yarn api:check
```

`api:check`应保持无未分类接口漂移；Dreamina动态路由白名单不受本次调整影响。
