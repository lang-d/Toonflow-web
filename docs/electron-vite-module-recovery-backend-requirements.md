# Electron + Vite 动态模块加载失败后端/Electron 配合文档

## 背景
Electron 开发模式 `dev:gui-vite` 下，主窗口加载 `http://127.0.0.1:50188` 时，首页 HTML 和 `@vite/client` 可能已经可访问，但首屏动态路由模块仍处于 Vite transform、HMR 更新或缓存失效阶段。

前端会看到类似错误：

```text
Failed to fetch dynamically imported module:
http://127.0.0.1:50188/src/pages/workbench/index.vue?t=...
```

这不是业务后端 API 错误，也不是项目数据错误。它属于 Electron Main 与 Vite dev server 的启动/热更新时序问题。

## 前端已处理
- 前端动态模块加载失败时，会做短退避自动恢复。
- 恢复逻辑会按失败模块 URL 探测，模块恢复后自动刷新当前路由。
- 连续失败后才展示“页面资源加载失败”诊断页。
- 用户点击“重新加载”或“返回项目列表”会清理恢复状态。

## 后端/Electron 需要配合
### 1. Vite Ready 检测不要只检查首页
Electron Main 在创建主窗口前，应确认以下资源都可访问：

```text
GET http://127.0.0.1:50188/
GET http://127.0.0.1:50188/@vite/client
GET http://127.0.0.1:50188/src/pages/workbench/index.vue
```

建议把待检测路径抽成数组，后续如果首屏入口变更，只改配置：

```ts
const readinessPaths = [
  "/",
  "/@vite/client",
  "/src/pages/workbench/index.vue",
];
```

全部返回 `2xx` 后，再执行：

```ts
win.loadURL(VITE_DEV_ORIGIN)
```

否则继续停留 loading 窗口，并显示“前端服务正在启动”。

### 2. Vite Ready 检测需要 no-store
检测请求应使用：

```ts
fetch(url, {
  cache: "no-store",
  signal: AbortSignal.timeout(2000),
})
```

避免读取旧缓存，把已经失效的动态模块误判为可用。

### 3. 主窗口加载失败仍保留重试页
如果 `loadURL` 主框架失败：
- 开发模式显示 Vite 启动诊断页。
- 用户点击重试后重新执行完整 ready 检测。
- 不要直接展示空白主窗口。

### 4. 不需要后端业务接口调整
本问题不涉及：
- `/api` 业务接口。
- 项目详情接口。
- 图片或媒体 URL。
- 任务队列接口。

只需要 Electron Main 对 Vite dev server 的 ready 判定更严格。

## 验收标准
- 启动 `dev:gui-vite` 时，Electron 不会在 `workbench/index.vue` 未可用时打开主窗口。
- Vite 热更新或重启过程中，主窗口不会长期停留在动态模块错误页。
- 手动访问以下地址返回 `200` 后，Electron 才进入主页面：

```text
http://127.0.0.1:50188/src/pages/workbench/index.vue
```

- 后端 API 正常但 Vite 模块未就绪时，界面提示应归类为“前端开发服务未就绪”，不要提示成 API 或业务错误。

## 建议修改位置
后端/Electron 仓库：

```text
E:/codex_workspace/Toonflow-app/scripts/main.ts
```

建议修改函数：

```ts
isViteReady()
```

把原本检测 `"/"`、`"/@vite/client"` 的逻辑扩展为检测 `readinessPaths`。
