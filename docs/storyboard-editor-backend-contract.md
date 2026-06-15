# 分镜列表提示词编辑与图片画布同步后端契约

## 1. 目标与边界

本契约只处理一条分镜记录及其关联图片画布：

```text
storyboardId -> flowId -> 当前画布 nodes / edges
```

前端不会扫描或修改其他分镜、其他图片画布或生产台其他节点。

图片生成任务仍由现有异步任务链路负责。提示词和引用同步不得覆盖生成节点的
`taskId`、`status`、`state`、`result`、`historyId` 等任务字段。

## 2. 数据定义

### 2.1 主生成节点

生成节点数据增加可持久化标识：

```ts
interface GeneratedNodeData {
  isPrimary?: boolean;
}
```

同一画布最多只能有一个 `generated` 节点的 `isPrimary === true`。

主节点解析顺序：

1. 最终选中图片所属的生成节点。
2. 画布中 `isPrimary === true` 的生成节点。
3. 画布只有一个生成节点时，该节点自动成为主节点。
4. 多个生成节点且没有主节点时，前端要求用户选择，不得默认使用数组第一个节点。

生成失败不改变主节点。删除主节点后，仅在剩余一个生成节点时自动接管；否则保持未指定。

### 2.2 引用素材

上传节点和分镜本地引用统一保存来源信息：

```ts
interface ReferenceImage {
  source: "asset" | "local" | "storyboard";
  sourceId?: number | string;
  image: string;
  previewImage?: string;
  label?: string;
  group?: string;
  type?: "image" | "video" | "audio" | "text";
}
```

字段语义：

- `image`：原图地址，生成任务使用。
- `previewImage`：缩略图地址，仅用于 UI。
- `sourceId`：资产 ID、本地引用 ID 或分镜 ID。
- `label`：资产名称或上传文件名。
- `group`：角色、场景、道具、片段、本地上传等展示分组。

后端保存和返回画布时必须原样保留这些字段。

## 3. 接口要求

### 3.1 保存图片画布

```http
POST /api/production/editImage/saveImageFlow
```

请求：

```ts
{
  flowId: number | null;
  projectId: number;
  scriptId: number;
  targetType: "storyboard";
  targetId: number; // storyboardId
  nodes: Array<{
    id: string;
    type: "upload" | "generated";
    position: { x: number; y: number };
    data: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
  selectedImageUrl?: string;
}
```

响应：

```ts
{
  data: {
    flowId: number;
  }
}
```

后端要求：

1. 新画布创建后返回真实 `flowId`，并关联当前 `storyboardId`。
2. 更新已有画布时保存完整 `nodes`、`edges` 和节点扩展字段。
3. `selectedImageUrl` 存在时，在同一事务内更新画布最终图片和当前分镜最终图片。
4. 保存普通编辑快照时，不得用前端旧值覆盖任务服务维护的任务字段。
5. 如果节点存在于数据库任务记录中，任务字段应以任务表为事实来源进行合并。
6. 校验同一画布最多一个主节点；发现多个主节点时返回明确的参数错误。

建议错误响应：

```ts
{
  code: 400;
  message: "图片画布数据校验失败";
  data: {
    issues: Array<{
      path: string;
      message: string;
    }>;
  };
}
```

### 3.2 读取图片画布

```http
POST /api/production/editImage/getImageFlow
```

请求：

```ts
{
  id: number; // flowId
}
```

响应必须包含：

```ts
{
  data: {
    id: number;
    flowId?: number;
    targetType: "storyboard";
    targetId: number;
    selectedImageUrl?: string;
    nodes: Array<{
      id: string;
      type: "upload" | "generated";
      position: { x: number; y: number };
      data: Record<string, any>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
    }>;
  }
}
```

重点：

- 上传节点必须返回 `source/sourceId/image/previewImage/label/group/type`。
- 生成节点必须返回 `isPrimary`。
- 任务字段必须返回后端最新状态。
- 不得因缺少最终图片而省略已有节点和连线。

### 3.3 保存分镜信息

```http
POST /api/production/storyboard/editStoryboardInfo
```

请求：

```ts
{
  id: number;
  prompt: string;
  videoDesc: string;
  duration: number;
  associateAssetsIds: number[];
  referenceImages: Array<{
    id: string;
    source: "local" | "storyboard";
    sourceId?: number | string;
    url: string;
    previewUrl?: string;
    name: string;
    type?: "role" | "tool" | "scene" | "clip" | "image";
  }>;
}
```

后端必须完整保存：

- 图片提示词 `prompt`。
- 视频描述 `videoDesc`。
- 时长 `duration`。
- 有序资产 ID `associateAssetsIds`。
- 有序本地/分镜引用 `referenceImages`。

不得只更新 `prompt/videoDesc` 而忽略引用和时长。读取生产台数据时也必须返回上述字段。

## 4. 推荐事务接口

当前前端按顺序调用：

1. `saveImageFlow`
2. `editStoryboardInfo`

为消除中间状态，建议后端后续新增事务接口：

```http
POST /api/production/storyboard/saveStoryboardEditor
```

请求同时包含：

```ts
{
  storyboard: {
    id: number;
    prompt: string;
    videoDesc: string;
    duration: number;
    associateAssetsIds: number[];
    referenceImages: StoryboardReference[];
  };
  flow: {
    flowId: number | null;
    nodes: Node[];
    edges: Edge[];
    primaryNodeId?: string;
    selectedImageUrl?: string;
  };
}
```

事务内完成：

1. 校验目标分镜和画布归属。
2. 校验 `primaryNodeId` 属于当前画布。
3. 合并任务事实字段。
4. 保存画布节点和连线。
5. 保存分镜提示词、引用和时长。
6. 同步最终图片。
7. 一次性提交或整体回滚。

## 5. 兼容与数据修复

历史上传节点可能只有：

```ts
{ image: string }
```

前端当前会按 URL 与分镜已有引用进行一次来源反推，但后端仍建议执行数据修复：

1. 根据分镜 `associateAssetsIds` 匹配资产原图 URL，补齐 `source: "asset"` 和 `sourceId`。
2. 根据 `referenceImages.url` 匹配本地引用，补齐 `source/sourceId`。
3. 单生成节点画布补齐 `isPrimary: true`。
4. 多生成节点画布仅在最终图片能唯一匹配时补齐主节点。
5. 无法唯一判断时保持未指定，不得按数组顺序选择。

## 6. 验收清单

- 保存后重新进入，提示词、资产顺序、本地引用和缩略图信息完整。
- 多生成节点没有主节点时，后端不擅自指定第一个节点。
- 主节点失败后，`isPrimary` 不发生变化。
- 生成任务执行期间修改其他节点，不覆盖任务最新状态和结果。
- `selectedImageUrl`、分镜最终图片和主节点保持一致。
- 删除主节点后不残留失效的主节点 ID。
- 参数错误返回 `message` 和 `data.issues`，前端可直接展示。
