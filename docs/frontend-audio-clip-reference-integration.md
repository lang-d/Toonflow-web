# 前端对接文档：分镜音频截取私有引用上传

## Summary

前端已支持音频试听和浏览器端截取 UI。角色/资产绑定场景的截取结果可以复用现有 `/assets/addAudioAssets` 创建新的音频资产，再通过 `/cornerScape/updateAssetsAudio` 绑定到角色。

分镜台引用场景的截取结果不应进入资产中心，也不应修改原角色绑定音频。前端需要后端提供一个“生产台私有媒体上传”接口，用于把截取后的音频片段保存为当前分镜的 `referenceImages` 私有引用。

## Required API

### `POST /production/editImage/uploadMedia`

用于上传生产台/分镜私有引用媒体。第一阶段前端只需要 `type: "audio"`。

Request:

```ts
{
  projectId: number;
  scriptId: number;
  type: "audio";
  base64Data: string; // data:audio/wav;base64,...
  name?: string;
}
```

Response:

```ts
{
  media: {
    id?: number | string;
    type: "audio";
    path: string;
    url: string;
    previewUrl?: string;
    mime?: string;
    name?: string;
    duration?: number;
    source?: "local";
    sourceId?: number | string;
  }
}
```

## Frontend Save Shape

接口返回后，前端会把音频片段写入当前分镜 `referenceImages`，不写入 `associateAssetsIds`：

```ts
{
  id: string;
  source: "local";
  sourceId: string | number;
  url: media.url;
  previewUrl: media.previewUrl || media.url;
  media;
  name: string;
  type: "audio";
}
```

## Behavior Boundary

- 角色绑定截取：创建新的音频资产，并绑定到角色。
- 分镜引用截取：只创建当前分镜私有引用，不进入资产中心。
- 原音频资产不覆盖、不删除、不修改。
- 前端不长期保存音频 base64 到 `referenceImages`。
- 用户上传音频格式不由前端新增限制；前端只在浏览器可解码时启用截取。

## Compatibility

如果后端希望复用已有 `/production/editImage/uploadImage`，建议同时调整命名或提供前端可调用的通用包装语义。前端期望接口能根据 `type: "audio"` 返回标准 `MediaRef`，避免把音频上传逻辑混入图片专用命名中。
