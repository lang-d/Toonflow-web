# 配乐本地音频上传对接契约

## 目的

将用户本地音频保存为配乐领域的正式候选，而非普通资产、分镜私有媒体或临时 URL。上传后的记录必须和模型生成的候选一样可试听、下载、手动选版、项目内复用及截取。

当前 `/production/music/library/trim` 不能复用为上传接口：它必须接收已经存在的 `sourceLibraryVersionId`，并从服务端文件派生 `short_edit`。上传需要先接收文件、创建音频资产和新的原始版本。

## 接口

所有接口保持 JSON 请求，使用当前项目的 100MB 请求体限制；前端提交 `data:audio/...;base64,...`。后端不得信任文件名或 MIME，必须基于实际音频文件校验格式和时长。

### 上传为项目音乐版本

`POST /production/music/library/version/upload`

```ts
{
  projectId: number;
  editionId: number;
  base64Data: string;
  name: string;
}
```

成功响应：

```ts
{ libraryVersion: MusicLibraryVersion }
```

行为：

- 校验 `editionId` 属于项目。
- 保存原始音频，创建标准 `o_assets` 父子音频资产和可播放媒体响应。
- 使用真实媒体时长写入 `generationDurationSec`、`effectiveMusicDurationSec`。
- 创建该 `editionId` 下递增的新版本，`state: "complete"`、`derivationType: "uploaded"`、`model: null`、`promptVersionId: null`。
- 不自动更新 `selectedVersionId`，不创建任务中心任务，不伪造模型、Prompt 或审核结果。

### 上传为 Cue 候选音频

`POST /production/music/cue/asset/upload`

```ts
{
  projectId: number;
  cueId: number;
  base64Data: string;
  name: string;
}
```

成功响应：

```ts
{ musicCueAsset: MusicCueAsset }
```

行为：

- 校验 Cue 属于项目。
- 保存标准音频资产，创建该 Cue 下递增的候选版本。
- 返回 `state: "complete"`、`selected: false`、`model: null`；`compiledPromptJson` 可为 `{}`，不得伪造 Prompt。
- 不自动执行 `selectAsset`、不更改 Cue 绑定、也不创建任务中心任务。

## 共用实现与校验

- 两个接口复用现有 `persistAudioAsset`、音频媒体响应、下载和时长探测逻辑；不要复用 `/library/trim` 的 HTTP 入参或 `short_edit` 语义。
- 支持 `aac`、`aiff`、`flac`、`m4a`、`mp3`、`ogg`、`wav`；拒绝无法解码或时长无效的文件，返回可展示 `message`。
- 保存失败时清理已写入但尚未关联的文件/资产，不留下 `complete` 空版本。
- `list/detail` 返回的上传版本必须包含 `audioAsset`，以便前端直接复用现有试听、下载和截取入口。
- 在版本投影中允许 `derivationType: "uploaded"`；已有 `generated`、`trimmed`、`legacy` 数据保持不变。

## 前端消费约定

- 前端在当前项目作品版本或当前 Cue 中打开同一上传弹窗。
- 成功后刷新对应列表，不自动选版；用户可用现有“选为当前版本”明确选择。
- 后端尚未上线接口时，前端将显示接口错误，不应退回为普通资产上传或将本地文件仅保存在浏览器内。
