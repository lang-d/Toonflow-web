# 结构化分镜 V3 后端实施说明

## 1. 文档目的与实施边界

本文档用于指导 `Toonflow-app` 后端、分镜表 Agent、分镜图 Prompt 编译器、视频 Prompt 编译器和审核链路实现结构化分镜 V3。

本轮前端已具备 V1、V2、V3 的严格分版本读取能力，但后端在完成本文档的写入能力声明前，前端不会默认创建 V3 分镜。后端实施必须遵守以下边界：

- V1、V2、V3 是三份独立事实契约，不是同一结构的可选字段集合。
- 不自动迁移历史 V1/V2，不在读取、Markdown、导出、列表投影或下游编译时把 `picture + action` 拼成 `shotDescription`。
- 新 Agent Revision 整表写 V3；历史正式 Revision 原样保留。
- `tableRowJson` 始终是正式事实源，扁平字段只是与版本一致的接口投影。
- 分镜图 Prompt、分镜图片和视频 Prompt 是派生内容。来源改变时标记 stale，不删除、不清空、不自动取消选版。
- 不强制先生成分镜图才能生成视频。
- 不修改导演规划 `axis-map`，不恢复逐镜坐标、复杂机位签名或全面站位描述。

## 2. 为什么需要 V3

### 2.1 V2 的真实问题不是 Skill 缺少定义

V2 要求 Agent 同时维护：

- `picture`：静态开拍画面；
- `action`：从该画面开始、在同一连续镜头内完成的变化。

现有 Skill 已经解释了两者分工，但真实 Revision 20 仍反复出现：

- 同一动作在 `picture` 和 `action` 重复；
- `picture` 提前写入动作完成后的状态；
- `picture` 本身包含连续动作，无法作为稳定首帧；
- `action` 又重新描述主体、景别、构图和开拍状态；
- 两个字段分别成立，组合后却要求互不兼容的空间视角。

这说明问题不是再增加一段自然语言规则就能稳定解决。模型需要同时判断“静态状态”“动态变化”“字段边界”和“镜头可执行性”，额外字段反而增加了重复和矛盾机会。

### 2.2 主要质量问题

本次人工反馈集中在以下问题，而不是轴线信息不足：

1. 一个镜头塞入多个独立信息中心，例如人物反应、手机内容和空间关系同时发生。
2. 同一镜头要求不可兼容的拍摄方向，例如近景主体与远处另一人物同时清晰可见。
3. 景别与可见内容冲突，例如近景只能拍到雨布，却又要求同时交代糖糖。
4. 相邻镜头动作重复，上一镜已经进屋，下一镜再次“进屋”。
5. 建立镜头或位置关系已经交代，却被无意义重复展示。
6. 信息发生了真正的视觉中心切换，却没有硬切、反打或新镜头。

手机、信件、屏幕并不是固定拆镜关键词。如果一次连续推近、越肩、摇移或焦点变化可以保持同一拍摄单元、方向和可读性，就可以保留为一个镜头。审核不能用“出现手机就拆镜”之类的关键词规则替代镜头判断。

### 2.3 轴线与站位策略

轴线继续弱化：

- 仅在反打、跨侧、出入口、视线关系和真实连续性需要时记录简洁机位信息。
- 不要求每镜重复人物坐标、完整站位、朝向签名或复杂轴线说明。
- 不因为模型空间理解有限而堆叠更多空间字段。
- 审核应关注“当前描述是否可由一个连续拍摄单元完成”，而不是形式上是否填写了足够多的轴线术语。

## 3. 本次“提交故障”的真实分类

本次两轮返修执行没有调用：

```text
prepare_storyboard_table
begin_storyboard_table_generation
append_storyboard_table_rows
commit_storyboard_table_generation
```

因此：

- 没有 `generationId`；
- 没有 prepare/begin/append/commit 的后端错误；
- 没有失败草稿；
- 正式 Revision 没有被提交链路修改；
- 所谓“提交故障”实际是执行模型在工具调用前输出长篇逐镜规划并耗尽输出预算，上层错误分类不准确。

后端必须把“未尝试写入”和“写入失败”分开：

| 场景 | 正确结果 |
|---|---|
| 从未出现 `storyboard_prepare_started` | `STORYBOARD_EXECUTION_NO_WRITE_ATTEMPT` |
| prepare 校验失败 | 返回 prepare 的结构化错误，不创建 generation |
| begin 后 append 失败 | generation 标记 failed，返回真实 generationId |
| commit 校验失败 | generation 标记 invalid/failed，正式 Revision 不变 |
| 流中断且 begin 已成功 | generation 标记 failed，正式 Revision 不变 |

任何没有 `generationId` 的执行都不得报告“提交失败”。

## 4. V3 正式数据契约

```ts
type StoryboardTableRowV3 = {
  version: 3;
  index: number;
  sceneNo?: string;
  groupKey: string;
  beatId: string;
  durationSec: number;
  location: string;
  timeOfDay: string;
  sceneContinuityId?: string;
  shotDescription: string;
  shotSize: string;
  cameraMove?: string;
  cameraAngle?: string;
  transitionFromPrevious?: string;
  dialogue: Array<{
    speaker: string;
    text: string;
    voiceTone?: string;
  }>;
  soundEffects: string[];
  requiredAssets: Array<{
    assetId: number;
    name: string;
    type: "role" | "scene" | "tool" | "clip";
    order: number;
  }>;
};
```

### 4.1 字段规则

`shotDescription` 描述一个连续拍摄单元，按镜头内可见时间顺序包含：

1. 主体和必要环境；
2. 开拍时已经成立的状态；
3. 镜头内发生的可见变化；
4. 镜头结束时的可见状态。

它不应重复以下独立字段：

- 台词正文；
- 声音清单；
- 景别名称；
- 运镜枚举；
- 机位说明；
- 资产清单。

这些信息继续分别由 `dialogue`、`soundEffects`、`shotSize`、`cameraMove`、`cameraAngle`、`requiredAssets` 承担。

### 4.2 V3 禁止字段

V3 `tableRowJson` 不得包含：

```text
picture
action
characters
visibleEmotion
groupName
groupIntent
```

`groupName/groupIntent` 可以继续作为轨道/分组的接口投影返回，但不得写入 V3 行 JSON。

### 4.3 版本与事实源

- `tableRowJson.version = 3`。
- 对应接口投影 `factVersion = 3`。
- `tableRowJson` 是唯一正式事实源。
- V3 可投影 `shotDescription`，但不得为兼容旧前端伪造 `picture/action`。
- V1/V2 使用各自原有解析、Markdown 和导出实现。
- V3 使用独立解析、Markdown 和导出实现。
- 禁止在任何读取链路中通过旧字段构造 V3。

## 5. 版本兼容矩阵

| 行版本 | 正式视觉字段 | 编辑后版本 | Markdown/导出 | 自动迁移 |
|---|---|---|---|---|
| V1 | `picture/action/characters/visibleEmotion` | 保持既有 V1 兼容路径 | V1 渲染器 | 否 |
| V2 | `picture/action` | V2 | V2 渲染器 | 否 |
| V3 | `shotDescription` | V3 | V3 渲染器 | 不适用 |

兼容明确禁止：

- V1/V2 查询结果里补 `shotDescription`；
- V3 查询结果里补 `picture/action`；
- Markdown 或导出阶段把 V1/V2 拼接为“镜头描述”；
- 保存旧行时隐式升级 V3；
- 批量读取时后台静默迁移历史 Revision。

## 6. 接口实施要求

### 6.1 能力声明

以下项目/剧集工作区响应增加：

```ts
storyboardFactWriteVersion: 2 | 3;
```

至少包括：

- `POST /production/getFlowData`
- 视频工作台/分镜列表中承载同一剧集事实的响应

发布规则：

- 后端未准备好 V3 新增、编辑、Agent 整表提交前返回 `2` 或不返回。
- 全部 V3 写链路、Markdown、导出和下游编译上线后返回 `3`。
- 前端仅在值严格等于 `3` 时创建 V3 新行；缺失或未知值默认 V2。

### 6.2 分镜读取

V3 行必须返回：

```ts
{
  factVersion: 3,
  tableRowJson: "{...version:3...}",
  shotDescription: string,
  // 其他同版本字段
}
```

V3 不要求、也不应返回伪造的 `picture/action/characters/visibleEmotion`。

无法解析或校验失败时沿用现有 `draft/legacy` 状态，不依据字段是否存在猜版本。错误响应应包含实际 `factVersion`、行 ID、用户镜头号和结构化 issues。

### 6.3 新增分镜

新增接口接受：

- V2：现有兼容字段；
- V3：`factVersion: 3` 和 `tableRowJson.version: 3`。

V3 新增是一个新的空白/草稿事实，不是由相邻 V1/V2 转换：

- 可继承轨道归属、连续性和基础场景上下文；
- 不得复制、拼接或改写相邻行 `picture/action` 到 `shotDescription`；
- 空 `shotDescription` 应保存为 draft，等待用户或 Agent 补齐。

### 6.4 编辑分镜

V3 编辑请求：

- 必须接收完整 V3 `tableRowJson`；
- 拒绝同一 JSON 同时含 `shotDescription` 与 `picture/action`；
- 保存后仍为 V3；
- 更新事实来源哈希并计算派生 stale 状态。

V1/V2 请求继续走旧路径，不因服务端已支持 V3 而隐式升级。

### 6.4.1 前端保存边界：正式事实与分镜图面板必须解耦

旧的 `POST /production/storyboard/editStoryboardInfo` 是历史混合接口。V3 前端不得再以它同时保存正式事实、图片 Prompt、参考资产或图片生成开关；两个独立接口的职责如下。

#### 分镜图面板（派生图片工作流）

```ts
POST /production/storyboard/panel/update

{
  projectId: number;
  scriptId: number;
  storyboardId: number;
  prompt: string;
  shouldGenerateImage: boolean;
  associateAssetsIds: number[];
  referenceImages: StoryboardReference[];
}
```

- 该接口不得接受 `tableRowJson`、`picture`、`action`、`shotDescription`、时长、`videoDesc` 或任何正式事实投影字段。
- 它只更新图片 Prompt、参考资产和是否生成图片；不得改变 `factRevision`。
- 图片画布的 `saveImageFlow` 是同一派生工作流中的前置保存步骤，但不是正式事实 Revision 的一部分。
- 画布已保存而本接口失败时，前端保留弹窗与本地输入，提示“画布已保存，但分镜图面板信息未保存，可重试”。

#### 正式分镜事实

```ts
POST /production/storyboard/facts/update

{
  projectId: number;
  scriptId: number;
  storyboardId: number;
  tableRowJson: StoryboardTableRowV1 | StoryboardTableRowV2 | StoryboardTableRowV3;
}
```

- 请求必须携带完整、原生且版本自洽的 `tableRowJson`；V3 只能包含 V3 字段，V1/V2 继续保留各自字段。
- 不接收图片 Prompt、参考图、画布、选图、生成开关或 `videoDesc`。
- 成功后递增/返回 `factRevision`、`factStatus` 与派生内容 stale 标记；这些服务端返回值是唯一事实源。
- 两个接口可并发调用，任一接口不得覆盖另一接口所属的数据。

### 6.5 Markdown 与导出

V3 渲染建议列为：

```text
序号 / 分镜组 / 组意图 / 节拍 / 时长 / 地点 / 时间 /
镜头描述 / 景别 / 运镜 / 机位 / 台词 / 音效 / 所需资产
```

其中分组名称与意图来自轨道投影，不写回 V3 行 JSON。V1/V2 继续使用原列结构。不得为了“统一表头”把 V1/V2 数据拼成 V3。

## 7. 分镜面板和分镜图 Prompt

### 7.1 来源工具返回

V3 面板来源工具返回：

```ts
{
  version: 3,
  shotDescription: string,
  shotSize: string,
  cameraAngle?: string,
  requiredAssets: StoryboardRequiredAssetFact[]
}
```

V2 继续返回：

```ts
{
  version: 2,
  picture: string,
  shotSize: string,
  cameraAngle?: string,
  requiredAssets: StoryboardRequiredAssetFact[]
}
```

工具必须按版本分支，不从 V3 寻找 `picture`，也不从 V2 构造 `shotDescription`。

### 7.2 V3 首帧派生

V3 分镜图 Prompt 编译器应在单镜上下文内，从 `shotDescription` 选择：

- 最早明确；
- 视觉可拍；
- 能自然启动后续变化；
- 不提前完成动作；
- 与 `shotSize/cameraAngle/requiredAssets` 一致

的首帧状态。

该首帧只存在于派生 Prompt，不写回正式 `tableRowJson`，也不新增 `picture` 字段。

## 8. 视频 Prompt 编译器

### 8.1 有正式分镜图

- 分镜图是视觉起点。
- `shotDescription` 提供镜头内完整可见变化与结束状态。
- `shotSize/cameraMove/cameraAngle` 提供拍摄约束。
- 编译器不重复描述图片中已确定的外观，但要保持人物、空间、资产和方向连续。

### 8.2 无正式分镜图

直接使用：

```text
shotDescription + shotSize + cameraAngle + cameraMove + requiredAssets
```

降级生成，不因缺少分镜图阻断视频生成。

### 8.3 历史版本

- V1/V2 继续沿用现有 `picture/action` 编译链路。
- 不在视频编译器内部把旧字段包装成 V3。

## 9. 派生内容来源跟踪与 stale 状态

### 9.1 返回字段

分镜/工作台接口支持可选返回：

```ts
promptStale?: boolean;
imageStale?: boolean;
videoPromptStale?: boolean;
sourceTracked?: boolean;
```

语义：

- `sourceTracked=true`：该派生内容保存过来源哈希，可准确判断 stale。
- `sourceTracked=false`：历史内容没有来源哈希；不得默认标记 stale。
- `promptStale`：分镜图 Prompt 的正式来源已变化。
- `imageStale`：已选分镜图片对应的 Prompt 或正式来源已变化。
- `videoPromptStale`：视频 Prompt 的分镜事实、引用、模型模式或正式风格来源已变化。

### 9.2 分镜图来源哈希

哈希输入至少包括：

- `factVersion`；
- 当前版本正式事实 JSON；
- `shotSize/cameraAngle`；
- 资产 ID、类型和顺序；
- 正式视觉原则/风格版本；
- Prompt 编译器版本。

V3 使用原始 `shotDescription`，V1/V2 使用各自原始字段。哈希输入不得先跨版本拼接。

### 9.3 视频 Prompt 来源哈希

至少包括：

- 当前轨道所有正式分镜事实及顺序；
- 正式分镜图和普通引用的来源类型、ID、顺序；
- 视频模型和引用模式；
- 正式视频风格来源及版本；
- 视频 Prompt 编译器版本。

### 9.4 stale 行为

来源变化后：

- 只更新 stale 标志；
- 不删除 Prompt、图片、视频；
- 不自动取消当前选版；
- 不自动重新编译；
- 用户主动重新编译成功后更新哈希并清除相应 stale 标志。

前端不计算来源哈希，后端是 stale 状态唯一事实源。

## 10. Agent 写入与执行协议

### 10.1 强制工具优先

分镜表 Agent 读取上下文后必须优先调用：

```text
prepare_storyboard_table
```

禁止在首次工具调用前输出完整逐镜方案。允许在 prepare 前做极短的内部判断，但不得把输出预算消耗在逐镜复述。

### 10.2 原子写入链路

正式写入固定为：

```text
prepare
  -> begin
  -> append（每批 5–10 行）
  -> commit
```

要求：

- `prepare` 明确目标版本为 3，并返回预期行数、现有 Revision、校验要求。
- `begin` 创建 generationId，但不修改正式 Revision。
- `append` 只接受 V3，逐批校验索引、结构和引用。
- `commit` 对整表做最终校验，成功后原子替换正式 Revision。
- 任一失败不修改旧正式 Revision。

### 10.3 无工具调用重试

1. 首次执行没有 `storyboard_prepare_started`：允许一次精简重试。
2. 重试提示只说明“立即调用 prepare，不输出完整规划”。
3. 第二次仍无工具调用：结束并返回 `STORYBOARD_EXECUTION_NO_WRITE_ATTEMPT`。
4. 不得将该状态描述为数据库、网络或 commit 故障。

### 10.4 错误返回

prepare、append、commit 错误至少返回：

```ts
{
  code: string;
  message: string;
  generationId?: string;
  phase: "prepare" | "begin" | "append" | "commit" | "execution";
  issues: Array<{
    rowIndex?: number;
    shotNumber?: number;
    field?: string;
    code: string;
    message: string;
  }>;
}
```

用户镜头号统一为 `index + 1`。技术日志同时记录：

```text
镜头 N（index N-1）
```

## 11. V3 审核重点

审核应使用语义与镜头可执行性判断，不使用关键词硬判静态/动态。至少覆盖：

1. 一个镜头是否包含需要硬切的多个独立信息中心。
2. 当前景别是否能看见描述中的所有关键事实。
3. 拍摄方向、主体位置和视线是否可在一个连续镜头中兼容。
4. 是否重复上一镜已经完成的动作或空间变化。
5. 是否无意义重复建立空间、车辆位置或离场信息。
6. 台词是否归属正确，是否需要反打或画外音。
7. 资产是否真实参与画面，而非仅因文本提及就加入。
8. 相邻镜结束状态与下一镜开拍状态是否连续。

“一次连续拍摄能否自然完成”是主要标准；手机、信件、屏幕、看向某物等关键词本身不是拆镜条件。

## 12. 人工反馈回归案例

以下案例必须纳入 Agent 和审核回归集。镜头号均为用户镜头号，日志同时记录零基 index。

| 镜头 | 原问题 | 验收方向 |
|---|---|---|
| 7 | 小白绕到院门边与苏晴反应被塞进同一视觉中心 | 拆为小白近景 + 苏晴镜头，或保留小白近景并使用苏晴画外音 |
| 9 | 近景只足以拍雨布，却要求同时拍到糖糖 | 修改景别/构图，或拆镜，不允许可见性矛盾 |
| 10 | 一个镜头承担两个空间上不兼容的动作 | 拆为两个连续镜头 |
| 12 | 信息重点适合近景 | 使用能明确承载主体信息的近景 |
| 22 | 车辆已停在院内，动作与连续性事实不符且镜头价值弱 | 删除冗余镜或重写为有新信息的镜头 |
| 23 | 屋檐下行走、目视、手机屏幕三个信息中心 | 通常拆为三个镜头；若采用明确连续调度，必须证明单镜可读 |
| 25 | 低头看手机与手机消息特写 | 拆为人物动作镜头 + 内容特写，除非连续推近/越肩可完整读清 |
| 26 | 人物近景与对方反应 | 近景 + 反打，不在一个固定方向内强塞双主体信息 |
| 27 | 中景动作与对方反应 | 拆为中景 + 反打/近景 |
| 28 | 苏晴拿手机与屏幕内容 | 近景交代人物 + 反向/越肩屏幕特写 |
| 30 | 举起手机、屏幕、人物位置关系、院内车辆空镜 | 四个信息中心，按叙事必要性拆分；冗余信息可删除 |
| 31 | 举手机与目光特写 | 拆为近景 + 目光特写 |
| 32 | 陈秀兰拿手机、往内屋走、手机屏幕 | 拆为三个镜头或使用可验证的连续调度，不得描述互斥视角 |
| 33 | 上一镜已经进屋，本镜再次进屋 | 删除重复动作，以上一镜结束状态作为本镜开拍状态 |
| 34 | 交付过磅单与傍晚空镜 | 拆为人物动作镜头 + 时间/氛围空镜 |
| 36 | 主体动作与院门方向三轮车待行 | 三轮车信息若必要则独立镜头，否则删除重复交代 |
| 38 | 司机动作与三轮车位置关系 | 可拆两镜；若位置已建立且不再是重点，只保留司机动作 |
| 41 | 周明海动作与三轮车驶出院外 | 保留人物近景；已交代的离场信息不必重复 |
| 43 | 陈秀兰转向白鹅但白鹅信息未建立 | 增加能明确交代白鹅的反应/信息镜头 |
| 44–45 | 空间视角无实质变化，信息重复 | 合并为一镜；只有独立的鹅反应具有叙事价值时才分镜 |

此外，将“糖糖站在内门台阶摆手”的上下文案例加入回归集：人物站位建立与摆手反应应以可读近景承载，不能被远景杂项吞没。

## 13. 测试矩阵

### 13.1 数据契约

- 合法 V1/V2/V3 分别通过自己的解析器。
- V3 含 `picture/action/characters/visibleEmotion/groupName/groupIntent` 时拒绝。
- V2 含 `shotDescription` 时拒绝。
- 缺失必填字段、错误资产类型、错误对话结构、非整数 index 时返回结构化 issues。
- 读取历史 Revision 不触发数据库写入或版本迁移。

### 13.2 接口

- `storyboardFactWriteVersion` 缺失/2 时，新建仍走 V2。
- 能力为 3 时，新建 V3，编辑 V3 后仍为 V3。
- V1/V2 编辑请求不隐式升级。
- V3 响应没有伪造 `picture/action`，前端仍正常显示。
- Markdown、导出和工作台接口均按真实版本展示。

### 13.3 Agent 原子写入

- 正常 `prepare → begin → append → commit` 创建一份 V3 正式 Revision。
- 首次无工具调用触发一次短重试。
- 两次无工具调用返回 `STORYBOARD_EXECUTION_NO_WRITE_ATTEMPT`。
- append 中断后 generation failed，旧正式 Revision 不变。
- commit 校验失败返回真实 generationId 和逐行 issues。
- 不完整 generation 永不出现在正式列表。

### 13.4 下游

- V3 分镜图编译只派生首帧 Prompt，不回写正式事实。
- 有分镜图和无分镜图的视频编译均可执行。
- V1/V2 下游结果与升级前一致。
- 来源变化只标记 stale，所有已生成内容和选版保持不变。
- 重新编译后更新来源哈希并清除相应 stale。

### 13.5 质量回归

- 逐项执行第 12 节镜头案例。
- 检查多信息中心、景别可见性、重复动作、相邻连续性和冗余建立镜头。
- 专门验证“看手机/信件/屏幕”既不会固定强拆，也不会把不可读信息强塞一镜。
- 专门验证轴线字段没有重新膨胀为逐镜坐标系统。

## 14. 发布顺序

1. 增加 V3 类型、解析器和校验器，但能力声明保持 `2`。
2. 增加 V3 数据库/Revision 原子写入及 V1/V2 独立兼容路径。
3. 增加 V3 Markdown、导出、列表投影和工作台接口。
4. 升级分镜面板来源工具、分镜图 Prompt 编译器和视频 Prompt 编译器。
5. 增加来源哈希与 stale 状态，只做提示，不做清理动作。
6. 升级 Agent Skill 与工具优先执行约束，加入无写入尝试错误分类。
7. 跑完整契约、原子写入、下游和人工镜头回归测试。
8. 仅在上述链路全部上线后，将 `storyboardFactWriteVersion` 切换为 `3`。
9. 观察一轮新 V3 Revision 的提交率、无工具调用率、校验失败率和人工拆镜反馈。

无需数据库批量迁移。历史 V1/V2 在其原版本长期可读。

## 15. 监控与验收指标

建议记录：

- `storyboard_prepare_started` / Agent 执行次数；
- `STORYBOARD_EXECUTION_NO_WRITE_ATTEMPT` 次数和首次重试成功率；
- prepare、append、commit 各阶段失败率；
- 每次 generation 的批次数、行数、耗时和最终状态；
- V3 结构校验 issue 分布；
- stale 标记数量与用户主动重新编译率；
- 人工审核中“多信息中心”“景别不可见”“动作重复”“连续性重叠”的命中率。

上线验收标准：

- 不再把无工具调用报告为提交故障；
- 正式 Revision 永远来自成功 commit；
- 新生成行全部为纯 V3，不混入旧字段；
- 历史 V1/V2 不发生静默变化；
- 所有下游按事实版本显式分支；
- 前端无需推导或拼接字段即可完整读取、编辑和展示 V3。
