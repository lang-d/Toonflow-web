# 视频生成台分镜引用优化：后端对接文档

## 1. 文档目的

本文档用于后端实现视频生成台本次引用工作流升级所需的接口和数据兼容。

前端基础路径继续使用 `/api`，本文接口路径均省略 `/api` 前缀。例如：

```text
前端代码：POST /production/workbench/createMergedReference
实际请求：POST /api/production/workbench/createMergedReference
```

本次后端工作主要包含：

1. 新增“创建合图引用”接口。
2. 让现有文件 URL、提示词生成、视频生成接口识别 `sources: "merged"`。
3. 让提示词生成接口接收全局前置、后置提示词。
4. 确保 `getGenerateData` 返回最新、完整、可恢复的轨道引用数据。

以下功能完全由前端完成，不要求新增后端接口：

- 按 `projectId + scriptId` 恢复上次操作的 track。
- track 列表左右翻页。
- 前置、后置提示词的本地持久化。
- 引用素材拖拽排序的本地缓存。

## 2. 通用响应规范

前端 Axios 响应拦截器会直接返回 HTTP 响应体，因此后端继续使用项目统一响应结构：

```ts
interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}
```

成功示例：

```json
{
  "code": 200,
  "data": {},
  "message": "成功"
}
```

参数校验失败建议返回：

```json
{
  "code": 400,
  "data": {
    "issues": [
      {
        "path": "refs[0].id",
        "message": "引用素材不存在"
      }
    ]
  },
  "message": "参数校验失败"
}
```

前端会组合展示 `message` 和 `data.issues`。

## 3. 公共引用类型

### 3.1 来源类型

```ts
type UploadSource = "storyboard" | "assets" | "merged";
```

含义：

| sources | 含义 | ID 指向 |
| --- | --- | --- |
| `storyboard` | 分镜图片 | 分镜图片记录 |
| `assets` | 资产或衍生资产 | 资产图片记录 |
| `merged` | 后端创建的合图引用 | 合图引用记录 |

后端所有通过 `{ id, sources }` 解析文件的公共逻辑都必须增加 `merged` 分支。

### 3.2 前端引用结构

```ts
interface WorkbenchReference {
  id: number;
  sources: UploadSource;
  fileType: "image" | "video" | "audio";
  src?: string;
  prompt?: string;
  name?: string;
  category?: "role" | "scene" | "tool" | "clip" | "other";
  parentName?: string;
  index?: number;
  sourceRefs?: Array<{
    id: number;
    sources: "storyboard" | "assets";
    order: number;
  }>;
}
```

`merged` 当前固定为图片：

```ts
interface MergedReference extends WorkbenchReference {
  sources: "merged";
  fileType: "image";
  name: string;
}
```

## 4. 新增接口：创建合图引用

### 4.1 接口

```text
POST /production/workbench/createMergedReference
```

### 4.2 请求

```ts
interface CreateMergedReferenceRequest {
  projectId: number;
  scriptId: number;
  trackId: number;
  mergeType: "storyboard" | "assets";
  refs: Array<{
    id: number;
    sources: "storyboard" | "assets";
    src?: string;
    order: number;
    label?: string;
    category?: "role" | "scene" | "tool" | "clip" | "other";
    parentName?: string;
    name?: string;
    index?: number;
  }>;
}
```

分镜合图请求示例：

```json
{
  "projectId": 12,
  "scriptId": 34,
  "trackId": 56,
  "mergeType": "storyboard",
  "refs": [
    {
      "id": 101,
      "sources": "storyboard",
      "order": 2,
      "label": "P1",
      "index": 0
    },
    {
      "id": 102,
      "sources": "storyboard",
      "order": 3,
      "label": "P2",
      "index": 1
    }
  ]
}
```

资产合图请求示例：

```json
{
  "projectId": 12,
  "scriptId": 34,
  "trackId": 56,
  "mergeType": "assets",
  "refs": [
    {
      "id": 201,
      "sources": "assets",
      "order": 0,
      "label": "林若溪+常服",
      "category": "role",
      "parentName": "林若溪",
      "name": "常服"
    },
    {
      "id": 202,
      "sources": "assets",
      "order": 1,
      "label": "菜市场",
      "category": "scene",
      "name": "菜市场"
    }
  ]
}
```

### 4.3 响应

```ts
interface CreateMergedReferenceResponse {
  id: number;
  sources: "merged";
  src: string;
  fileType: "image";
  name: string;
  prompt?: string;
}
```

完整响应示例：

```json
{
  "code": 200,
  "data": {
    "id": 9001,
    "sources": "merged",
    "src": "http://127.0.0.1:3000/files/workbench/merged/9001.jpg",
    "fileType": "image",
    "name": "合并分镜图",
    "prompt": ""
  },
  "message": "成功"
}
```

`src` 必须可立即预览。可以返回完整 URL；后续前端缓存恢复会通过 `id + sources` 再调用 `getFileUrl`。

### 4.4 参数校验

后端必须校验：

- `projectId`、`scriptId`、`trackId` 存在且归属关系正确。
- `refs.length >= 2`。
- `mergeType === "storyboard"` 时，所有 `refs[].sources` 必须是 `storyboard`。
- `mergeType === "assets"` 时，所有 `refs[].sources` 必须是 `assets`。
- 每个引用记录真实存在，并归属于当前项目或允许当前项目使用。
- 每个引用必须是可读取的图片。
- 不信任前端传入的 `src` 作为本地文件路径，应根据 `id + sources` 从数据库解析真实文件。
- 对重复 ID、越权文件、缺失文件返回明确错误，不生成空白合图。

### 4.5 分镜合图规则

1. 按 `refs[].order` 从小到大排列。
2. 每张分镜图完整展示，不能拉伸变形。
3. 建议统一单元格尺寸，通过 `object-fit: contain` 等价算法留白。
4. 分镜图不要求显示长描述。
5. 可以显示简短编号 `P1/P2...`，编号优先使用 `label`，其次使用 `index + 1`。
6. 输出为一张普通图片文件。

推荐布局：

- 2 张：横向两列。
- 3 张：横向三列。
- 4 张：2×2。
- 5 至 6 张：3 列。
- 更多图片：按 3 或 4 列自动换行。

### 4.6 资产合图规则

分类顺序固定为：

```text
role -> scene -> tool -> clip -> other
```

同一分类内按 `refs[].order` 排列。

每张资产图下方必须显示资产名称：

- 普通资产：`name` 或 `label`。
- 角色父资产：父资产名。
- 角色衍生资产：`父资产名 + 衍生资产名`。
- 前端已经生成 `label`，后端仍应以数据库中的名称复核，避免错误或恶意文本。

输出建议：

- 分类之间增加小标题或明显间距。
- 图片保持比例，不裁掉人物或道具主体。
- 标签区域高度固定，长名称换行或省略。
- 中文字体使用项目内置字体或系统可用中文字体，避免生成方框字符。

### 4.7 合图文件和记录持久化

后端必须创建可持久解析的合图记录，不能只生成临时 URL。

建议至少保存：

```ts
interface MergedReferenceRecord {
  id: number;
  projectId: number;
  scriptId: number;
  trackId: number;
  mergeType: "storyboard" | "assets";
  name: string;
  filePath: string;
  fileType: "image";
  prompt?: string;
  sourceRefs: Array<{
    id: number;
    sources: "storyboard" | "assets";
    order: number;
    label?: string;
    category?: string;
  }>;
  createTime: number;
  updateTime: number;
}
```

创建接口应在同一事务或同一业务操作中：

1. 解析源图片。
2. 生成合图文件。
3. 创建合图数据库记录。
4. 保存 `sourceRefs`。
5. 如后端以 `track.medias` 作为权威数据，应将被合并引用替换为新的 `merged` 引用。
6. 任一步骤失败时删除未完成文件并回滚记录。

如果更新 `track.medias`：

- 只删除本次 `refs` 中明确参与合并的引用。
- 新 `merged` 引用插入到第一个被合并引用的位置。
- 不删除或重排其他未参与合并的引用。

注意：当前前端拖拽后的完整全局顺序保存在本地缓存，创建合图请求只提交参与合图的引用。若后端未来需要跨设备持久化所有引用顺序，应另行增加“保存完整轨道引用列表”接口，不能仅依靠本接口猜测所有素材的最终顺序。

## 5. 扩展接口：文件 URL 解析

### 5.1 接口

```text
POST /production/workbench/getFileUrl
```

请求：

```ts
{
  items: Array<{
    id: number;
    sources: "storyboard" | "assets" | "merged";
  }>;
}
```

请求示例：

```json
{
  "items": [
    { "id": 101, "sources": "storyboard" },
    { "id": 201, "sources": "assets" },
    { "id": 9001, "sources": "merged" }
  ]
}
```

当前前端缓存 store 读取的是嵌套 `data.data`，因此后端应返回：

```json
{
  "code": 200,
  "data": {
    "data": [
      {
        "id": 101,
        "sources": "storyboard",
        "url": "http://127.0.0.1:3000/files/storyboard/101.jpg"
      },
      {
        "id": 201,
        "sources": "assets",
        "url": "http://127.0.0.1:3000/files/assets/201.jpg"
      },
      {
        "id": 9001,
        "sources": "merged",
        "url": "http://127.0.0.1:3000/files/workbench/merged/9001.jpg"
      }
    ]
  },
  "message": "成功"
}
```

也支持对象映射形式：

```json
{
  "code": 200,
  "data": {
    "data": {
      "101:storyboard": "http://127.0.0.1:3000/files/storyboard/101.jpg",
      "201:assets": "http://127.0.0.1:3000/files/assets/201.jpg",
      "9001:merged": "http://127.0.0.1:3000/files/workbench/merged/9001.jpg"
    }
  },
  "message": "成功"
}
```

要求：

- `merged` 根据合图记录的 `filePath` 返回当前可访问 URL。
- 单项不存在时建议跳过该项或返回 `url: ""`，不要让整个批次 500。
- 返回顺序建议与请求顺序一致。

## 6. 扩展接口：生成页数据

### 6.1 接口

```text
POST /production/workbench/getGenerateData
```

请求不变：

```ts
{
  projectId: number;
  scriptId: number;
}
```

本次新增要求：

1. `trackList[].medias` 允许返回 `sources: "merged"`。
2. 返回最新数据库状态，不要使用已过期的进程内轨道引用缓存。
3. 资产图片发生变化后，重新请求必须返回最新素材 ID、路径或版本。
4. 如果合图已写入轨道引用，返回时必须包含该合图引用。

示例：

```json
{
  "code": 200,
  "data": {
    "storyboardList": [],
    "trackList": [
      {
        "id": 56,
        "prompt": "镜头缓慢推进。",
        "state": "未生成",
        "duration": 5,
        "selectVideoId": null,
        "videoList": [],
        "medias": [
          {
            "id": 9001,
            "sources": "merged",
            "fileType": "image",
            "src": "/files/workbench/merged/9001.jpg",
            "name": "合并分镜图",
            "sourceRefs": [
              { "id": 101, "sources": "storyboard", "order": 0 },
              { "id": 102, "sources": "storyboard", "order": 1 }
            ]
          }
        ]
      }
    ]
  },
  "message": "成功"
}
```

前端“刷新缓存”按钮不会传 `force` 参数，而是重新调用此接口后，强制使用返回的 `track.medias` 覆盖当前剧集本地缓存。因此本接口返回值就是刷新后的权威数据。

## 7. 扩展接口：单轨提示词生成

### 7.1 接口

```text
POST /production/workbench/generateVideoPrompt
```

请求扩展：

```ts
{
  projectId: number;
  trackId: number;
  info: Array<{
    id: number;
    sources: "storyboard" | "assets" | "merged";
  }>;
  model: string;
  mode: string;
  promptPrefix?: string;
  promptSuffix?: string;
}
```

示例：

```json
{
  "projectId": 12,
  "trackId": 56,
  "info": [
    { "id": 9001, "sources": "merged" },
    { "id": 201, "sources": "assets" }
  ],
  "model": "dreamina:multimodal2video:default",
  "mode": "[\"imageReference:9\",\"videoReference:3\"]",
  "promptPrefix": "保持写实电影摄影，人物外观一致。",
  "promptSuffix": "不要出现文字、水印和额外人物。"
}
```

后端处理要求：

- 按 `info` 数组原顺序解析引用。
- `merged` 作为一张普通图片引用参与生成。
- 不要把 `sourceRefs` 再展开为多张模型输入，否则会破坏“合并为一张引用”的语义。
- `promptPrefix`、`promptSuffix` 为空字符串或纯空白时忽略。
- 前后置提示词用于约束提示词生成过程。
- 返回给前端的 `data` 应是轨道提示词正文，不建议简单把前后置提示词原文重复拼入正文，以免污染轨道原始 prompt。

响应：

```json
{
  "code": 200,
  "data": "生成后的当前轨道视频提示词正文",
  "message": "成功"
}
```

## 8. 扩展接口：批量提示词生成

### 8.1 接口

```text
POST /production/workbench/batchGeneratePrompt
```

请求扩展：

```ts
{
  projectId: number;
  trackData: Array<{
    trackId: number;
    info: Array<{
      id: number;
      sources: "storyboard" | "assets" | "merged";
    }>;
  }>;
  model: string;
  mode: string;
  promptPrefix?: string;
  promptSuffix?: string;
  concurrentCount: number;
}
```

要求：

- `promptPrefix`、`promptSuffix` 应应用于本批次中的每一个轨道。
- 每个轨道的 `info` 顺序必须保持。
- `merged` 按单张图片解析。
- 继续沿用现有异步任务和 `/production/workbench/checkVideoPrompt` 轮询机制。
- 单轨失败不能错误覆盖其他轨道结果；按现有任务体系记录各轨道状态和失败原因。

## 9. 扩展接口：单轨视频生成

### 9.1 接口

```text
POST /production/workbench/generateVideo
```

请求结构不新增顶层字段，但 `uploadData.sources` 增加 `merged`：

```ts
{
  projectId: number;
  scriptId: number;
  uploadData: Array<{
    id: number;
    sources: "storyboard" | "assets" | "merged";
  }>;
  prompt: string;
  model: string;
  mode: string;
  resolution: string;
  duration: number;
  audio: boolean;
  trackId: number;
}
```

前端提交的 `prompt` 已经按以下规则组合：

```text
前置提示词

当前轨道提示词正文

后置提示词
```

空段落会被跳过。后端不得再次拼接前后置提示词，否则会重复。

后端处理要求：

- 按 `uploadData` 数组顺序向供应商传递引用。
- `merged` 解析为合图文件，并按一个图片输入计算。
- 模型引用数量校验中，单个 `merged` 只占一个图片引用名额。
- 不展开 `sourceRefs`。
- 保持现有异步视频生成、视频记录创建和轮询逻辑。

响应不变：

```json
{
  "code": 200,
  "data": 7001,
  "message": "成功"
}
```

`data` 是视频结果记录 ID。

## 10. 扩展接口：批量视频生成

### 10.1 接口

```text
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
  trackData: Array<{
    duration: number;
    prompt: string;
    uploadData: Array<{
      id: number;
      sources: "storyboard" | "assets" | "merged";
    }>;
    trackId: number;
  }>;
}
```

每个 `trackData[].prompt` 已经由前端完成前置、正文、后置提示词组合，后端直接使用。

响应不变：

```json
{
  "code": 200,
  "data": [
    {
      "trackId": 56,
      "videoId": 7001
    },
    {
      "trackId": 57,
      "videoId": 7002
    }
  ],
  "message": "成功"
}
```

## 11. 引用顺序语义

本次顺序规则非常重要：

- 前端不再自动把资产排在分镜之前。
- 用户选择顺序、拖拽顺序就是生成顺序。
- `generateVideoPrompt.info`、`generateVideo.uploadData`、批量接口中的对应数组都已按 UI 当前顺序提交。
- 后端不得按 `sources`、ID、创建时间重新排序。
- 首尾帧模式仍按数组前两项解释为首帧、尾帧。
- `singleImage` 只使用第一项。
- 多模态模式按数组顺序提交所有符合模型限制的引用。

## 12. 文件生命周期与删除策略

建议：

- 合图文件放在项目可管理的数据目录，不要放系统临时目录。
- 合图记录被轨道、生成任务或历史任务引用时不能直接物理删除。
- 删除项目或剧集时按现有级联规则清理合图记录和文件。
- 重新生成同一组合时可以新建记录；如需去重，可按源引用、顺序、源文件版本计算 hash。
- 资产原图发生变化时，旧合图默认保持当时快照，不应静默覆盖，以保证历史任务可复现。

## 13. 安全与稳定性要求

- 禁止直接读取前端提交的任意绝对路径。
- 所有源文件必须通过数据库记录解析并校验项目权限。
- 限制 `refs` 最大数量，例如 30 张。
- 限制单图像素和文件大小，避免内存溢出。
- 合图处理建议放在线程池、worker 或受控任务队列，避免阻塞主请求线程。
- 如果接口同步生成，建议设置明确超时并清理半成品。
- 输出图片建议设置最大宽高和最大文件体积。
- 保留原始异常日志，但 API 不返回本机绝对路径和堆栈。

## 14. 后端实施清单

### 必须完成

- [ ] 新增 `POST /production/workbench/createMergedReference`。
- [ ] 创建持久化合图记录和文件。
- [ ] `getFileUrl` 支持 `sources: "merged"`。
- [ ] `getGenerateData.trackList[].medias` 支持返回 `merged`。
- [ ] `generateVideoPrompt.info` 支持 `merged`。
- [ ] `batchGeneratePrompt.trackData[].info` 支持 `merged`。
- [ ] `generateVideo.uploadData` 支持 `merged`。
- [ ] `batchGenerateVideo.trackData[].uploadData` 支持 `merged`。
- [ ] 单轨和批量提示词生成接收 `promptPrefix/promptSuffix`。
- [ ] 所有引用解析和供应商提交过程保持数组顺序。

### 建议完成

- [ ] 合图创建后事务更新对应轨道的后端引用列表。
- [ ] 合图记录保存完整 `sourceRefs`，支持审计和问题排查。
- [ ] 对源文件变化增加版本或 hash。
- [ ] 为合图接口增加并发、大小和数量限制。
- [ ] 增加合图文件清理和项目删除级联策略。

## 15. 联调验收用例

### 15.1 分镜合图

1. 当前 track 引用三张分镜图。
2. 前端拖拽为 `P3、P1、P2`。
3. 点击“合并分镜图”。
4. 后端生成图片顺序必须是 `P3、P1、P2`。
5. 返回 `sources: "merged"`。
6. 使用返回 ID 调用 `getFileUrl` 能获得有效 URL。
7. 使用该引用生成提示词和视频均成功。

### 15.2 资产合图

1. 引用角色父资产、角色衍生资产、场景、道具。
2. 合图按 `角色、场景、道具、片段、其他` 分类。
3. 角色衍生资产显示“父资产名+衍生资产名”。
4. 图片和名称没有错位。

### 15.3 提示词

1. 设置前置提示词 A、后置提示词 B。
2. 单轨生成提示词时后端收到 A/B。
3. 批量生成提示词时每个轨道都应用 A/B。
4. 返回的轨道正文不重复堆叠 A/B。
5. 单轨和批量生成视频收到的 `prompt` 已是 `A + 正文 + B`，后端不二次拼接。

### 15.4 缓存刷新

1. 修改资产图片。
2. 前端点击“刷新缓存”。
3. `getGenerateData` 返回最新轨道引用。
4. `getFileUrl` 返回最新可访问 URL。
5. 前端缩略图和后续生成任务使用新图片。

### 15.5 顺序

1. 引用顺序从 `资产A、分镜B、资产C` 拖为 `分镜B、资产C、资产A`。
2. 单轨提示词请求 `info` 保持新顺序。
3. 单轨视频请求 `uploadData` 保持新顺序。
4. 批量接口中对应轨道保持相同顺序。
5. 后端日志和供应商实际输入顺序一致。

## 16. 当前前端代码位置

- 生成页主逻辑：`src/views/production/components/workbench/generate/index.vue`
- 引用选择和拖拽：`src/views/production/components/workbench/generate/components/imageSelect.vue`
- track 和批量生成：`src/views/production/components/workbench/generate/components/track.vue`
- 引用类型：`src/views/production/components/workbench/type/type.ts`
- 引用 URL 缓存：`src/stores/imageListCache.ts`
- 资产选择元数据：`src/utils/assetsCheck.ts`

