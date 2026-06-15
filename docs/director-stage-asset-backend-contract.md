# 3D 导演台资产化后端对接说明

## 背景

3D 导演台现在是图片编辑画布内部的可编辑引用节点，不是生产台主流程节点。它生成的场景图、站位图、机位截图需要作为可复用资产保存，后续可被多个生成节点、其他画布、分镜台和视频生成台引用。

## 前端调用接口

```txt
POST /production/editImage/createDirectorAsset
```

请求体：

```ts
{
  base64Data: string; // 前端合成的截图，data:image/jpeg;base64,...
  projectId: number;
  scriptId?: number;
  flowId?: number | null;
  nodeId: string;
  targetType?: "deriveAsset" | "storyboard";
  targetId?: number | null;
  assetType: "sceneShot" | "blockingShot" | "cameraShot" | "compositionRef";
  name: string;
  promptFragment?: string;
  sourceRefs: Array<{
    source?: "asset" | "storyboard" | "local" | "generated" | "directorAsset";
    sourceId?: number | string;
    mediaPath?: string;
    order: number;
    label?: string;
  }>;
  camera?: {
    id: string;
    name: string;
    fov: number;
    x: number;
    y: number;
    zoom: number;
  };
  stageDraft?: unknown; // 后端可按正式导演场景契约保存或忽略
}
```

响应体建议：

```ts
{
  data: {
    id: number | string;
    name: string;
    assetType: "sceneShot" | "blockingShot" | "cameraShot" | "compositionRef";
    media: MediaRef;
  }
}
```

`media.source` 建议返回 `"directorAsset"`，`media.path` 是后续生成接口使用的原图路径，`media.url/previewUrl` 只用于前端展示。

## 行为要求

- 后端负责把截图入库为一种新资产，前端不保存本地磁盘路径。
- 删除画布节点不删除导演台资产，资产生命周期由资产库统一管理。
- 资产选择器后续需要能查询到 `directorAsset` 来源资产。
- 生成接口继续通过 `referenceMediaPaths` 使用 `media.path`，不需要识别前端临时 URL。
- 如果后端暂未支持该接口，前端会显示“导演台资产保存失败”，不会把临时截图伪装成已入库资产。
