# Video Prompt Skill 前端对接契约

## 目标

视频模型映射、Video Skill 与用户可选视频类型的职责必须分离：

```text
模型映射 / 本次选择的实际模型
  -> 后端解析该模型的 Video Skill
  -> Skill 给出该模型允许的视频类型
  -> 后端按模型 + 类型编译 Prompt
```

模型映射仍是业务能力到精确 `vendorId:modelName` 的唯一权威。Video Skill 是后端内部编译实现；前端不保存 Skill 模板、Skill ID 或模型到 Skill 的映射。

## 模型详情

扩展现有 `POST /modelSelect/getModelDetail`。视频生产页请求为：

```ts
{
  modelId: "vendorId:modelName";
  projectId?: number;
}
```

视频模型响应增加可选字段：

```ts
{
  model: "vendorId:modelName",
  videoPromptTypeCapability: {
    options: Array<{ value: string; label: string }>;
    defaultValue?: string;
  } | null,
  selectedVideoPromptType?: string | null
}
```

- `options` 是当前精确模型对应 Video Skill 的唯一类型词表；前端不使用旧的 `videoPromptTypes` 字段作为回退。
- 模型没有类型能力时返回 `videoPromptTypeCapability: null`。
- 当请求带 `projectId` 时，`selectedVideoPromptType` 是该项目对该精确模型已持久化的选择；不存在时可返回 `null`，前端显示 `defaultValue`。未带项目 ID 的既有调用可忽略该字段。
- 同名模型必须按完整 `vendorId:modelName` 区分，不能只按模型名返回能力。

## 项目级选择持久化

项目数据保存模型专属偏好：

```ts
videoPromptTypeSelections: Record<string, string | null>;
// 例如 { "zealman:minimax-h3-u06": "3d-animation-short" }
```

新增：

```ts
POST /project/updateVideoPromptTypeSelection
{
  projectId: number;
  model: "vendorId:modelName";
  videoPromptType: string | null;
}
```

成功响应：

```ts
{ selectedVideoPromptType: string | null }
```

后端必须用当前 `model` 对应 Skill 的 `options` 校验值。清空选择时保存 `null`。该接口仅更新该模型的偏好，不能覆盖同一项目其他模型的选择。

历史单值 `videoPromptType` 只可在后端能确认所属精确模型时迁入对应项；不能自动赋给其他供应商或模型。项目编辑接口应保留历史字段的兼容读取，直至迁移完成。

## 编译与生成请求

以下现有接口接受可选 `videoPromptType`：

- `POST /production/workbench/generateVideoPrompt`
- `POST /production/workbench/batchGeneratePrompt`
- `POST /production/workbench/generateVideo`
- `POST /production/workbench/batchGenerateVideo`

请求均包含本次实际模型和可选类型：

```ts
{
  model: "vendorId:modelName";
  videoPromptType?: string;
}
```

后端规则：

1. 以本次 `model` 解析实际 Video Skill，不可使用项目默认模型替代。
2. 无类型值时走该 Skill 的默认编译规则。
3. 有类型值时校验其属于该模型 Skill；不匹配时在建任务前返回可展示参数错误。
4. 当前模型没有类型能力时，前端会省略字段；后端走该模型原有编译路径。
5. 任务、Prompt 编译结果及候选版本记录实际模型和最终生效的 Skill/类型，便于追溯，但 Skill 内部标识不要求前端提交。

## 前端已实现行为

- 项目编辑页不再出现绑定项目默认模型的固定 H3 类型控件。
- 视频生产页仅在模型详情返回 `videoPromptTypeCapability` 时显示“视频类型”选择器。
- 类型选择按后端接口立即保存，连续变更在前端串行提交，避免旧请求覆盖最后选择。
- 单条和批量 Prompt 编译、单条和批量视频生成均透传当前后端声明的类型。
- 后端尚未提供新字段时，前端隐藏控件并保持既有生成链路；不会自行使用旧 H3 词表或伪造类型值。

## 验收

- 项目默认模型为 Seedance，视频生产页选择 H3 后，返回并显示 H3 的类型；切回 Seedance 不显示 H3 类型。
- 同一项目不同精确模型的类型选择独立恢复，跨供应商同名模型不串用。
- 无类型能力的模型正常生成且请求不带 `videoPromptType`。
- 非法类型请求被后端拒绝，不创建任务。
- 切换模型不会清空提示词、引用、轨道时长、分辨率、模式或候选视频。
