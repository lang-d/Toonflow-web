# 结构化分镜前端切换后的后端配套调整

## 目标

前端生产 Agent 已切换为：

- 不解析或保存 `<storyboardTable>`、`<storyboardItem>`。
- Agent 完成后只调用 `/production/getFlowData` 刷新事实数据。
- `tableRowJson` 是完整分镜事实，拆列字段用于常规展示。
- 用户手动编辑后重新请求 `getFlowData`，不在前端自行修改 `tableRowJson`。

后端需要保证手动编辑、手动新增和 Agent 生成的数据使用同一套 `StoryboardTableRowV2` 合同。

## 1. 扩展手动编辑接口

接口：

```text
POST /api/production/storyboard/editStoryboardInfo
```

请求在现有字段基础上增加：

```ts
{
  location?: string;
  timeOfDay?: string;
  sceneContinuityId?: string;
}
```

现有结构化字段继续支持：

```ts
{
  scene?: string;
  picture?: string;
  action?: string;
  shotSize?: string;
  cameraMove?: string;
  dialogue?: string;
  sound?: string;
  visibleEmotion?: string;
}
```

需要修改：

- `src/routes/production/storyboard/editStoryboardInfo.ts` 的 Zod 请求校验。
- `StoryboardEditorInput` 类型。

## 2. 编辑时同步重建 tableRowJson

当前 `saveStoryboardEditor` 只更新拆列字段，会造成：

```text
tableRowJson 仍是旧值
拆列字段已经更新
```

前端按 `tableRowJson -> 拆列字段` 展示后，会重新显示旧内容。

建议保存流程：

1. 按 `id` 读取完整 `o_storyboard` 记录，必须包含原 `tableRowJson`。
2. 将原记录、用户提交字段合并后传给 `buildStoryboardTableRowV2`。
3. 使用 `storyboardRowToDbPatch()` 同时生成：
   - `location/timeOfDay/sceneContinuityId`
   - `picture/action/shotSize/cameraMove`
   - `dialogue/sound/visibleEmotion`
   - `groupKey/groupName/groupIntent/beatId`
   - `duration/videoDesc`
   - `tableRowJson`
4. 单独保留用户提交的 `prompt`、引用图片和资产关联。
5. 不删除 `tableRowJson` 中未被编辑的人物、视觉事实、资产要求和安全备注。

参考形态：

```ts
const existing = await trx("o_storyboard").where("id", input.id).first();

const tableRow = buildStoryboardTableRowV2(
  {
    ...existing,
    ...input,
    tableRowJson: existing.tableRowJson,
    durationSec: input.duration,
  },
  Number(existing.index ?? 0),
);

await trx("o_storyboard").where("id", input.id).update({
  prompt: input.prompt,
  referenceImages: serializeStoryboardReferences(input.referenceImages),
  ...storyboardRowToDbPatch(tableRow),
});
```

注意：`buildStoryboardTableRowV2` 必须以原 `tableRowJson` 为底，再覆盖用户明确提交的字段，不能重新创建一个只有扁平字段的 JSON。

## 3. 手动新增接口结构化

接口：

```text
POST /api/production/storyboard/addStoryboard
```

请求校验增加：

```ts
{
  location?: string;
  timeOfDay?: string;
  sceneContinuityId?: string;
  tableRowJson?: StoryboardTableRowV2 | string;
}
```

新增记录也应调用：

```ts
buildStoryboardTableRowV2()
storyboardRowToDbPatch()
```

不要继续分别手写 `scene/picture/action/...` 数据库字段，否则新增分镜没有 `tableRowJson`，会被识别为历史 fallback。

手动新增允许部分字段为空，但应生成合法的最小 `StoryboardTableRowV2`，并设置正确的 `groupKey/trackId/index`。

## 4. 响应与刷新口径

`editStoryboardInfo` 和 `addStoryboard` 成功后建议返回保存后的完整 storyboard，至少包括：

```ts
{
  id: number;
  index?: number;
  trackId?: number;
  groupKey?: string;
  groupName?: string;
  groupIntent?: string;
  beatId?: string;
  location?: string;
  timeOfDay?: string;
  sceneContinuityId?: string;
  picture?: string;
  action?: string;
  shotSize?: string;
  cameraMove?: string;
  dialogue?: string;
  sound?: string;
  visibleEmotion?: string;
  tableRowJson?: string;
  factSource: "storyboardTable" | "minimalFallback";
}
```

当前前端保存成功后仍会重新调用 `/production/getFlowData`，所以响应扩展兼容现有前端。

## 5. 验收

1. Agent 生成分镜时，前端不调用 `batchAddStoryboardInfo`。
2. Agent 完成后，`getFlowData.storyboard` 返回完整结构化分镜。
3. 手动修改地点、时间、动作或对白后：
   - 拆列字段更新。
   - `tableRowJson` 同步更新。
   - 刷新页面后内容一致。
4. 修改普通字段时，原 JSON 中的 `characters/visualFacts/requiredAssets/safetyNotes` 不丢失。
5. 手动新增分镜返回 `factSource="storyboardTable"`，而不是 `minimalFallback`。
6. 通过后端：

```text
npm run lint
npm run api:check
npm run build
```
