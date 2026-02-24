# Web-native MCP Framework

> 声明：本项目整体由 AI 生成，仅供参考。

[English Version](README.md)

一个 Web-native 的 MCP 框架，让 AI 直接调用页面内业务方法，而不是依赖脆弱的 DOM 点击自动化。

## 三分钟演示

使用 `docs/quick-demo.md` 快速跑通最小链路：

1. 启动 MCP 服务并打开已接入页面。
2. 调用 `listPageMethods`。
3. 调用 `invokePageMethod`。
4. 卸载/清理后验证安全失败。
5. 验证一次治理策略拦截（限流/会话/策略）。

演示素材建议：

- 将 GIF 放在 `docs/assets/demo.gif`，并在首页嵌入，提升可见度和转化率。

## 项目目标

- 用方法调用替代 UI 模拟（`listPageMethods` + `invokePageMethod`）。
- 一套协议支持两种接入方式：
  - SDK 模式（显式暴露方法，更安全，推荐）。
  - Extension 模式（更快改造历史项目）。
- 通过适配器与示例，降低历史系统改造成本。

## 核心能力

- 统一协议契约与运行时校验。
- MCP 服务工具 + 浏览器桥接网关。
- 组件级方法生命周期管理（`exposeMethods` disposer、`unexposeMethod(s)`）。
- 连接可靠性（断线消息队列 + 自动重连）。
- 安全与治理默认能力：
  - token 鉴权（优先 WebSocket subprotocol）、
  - origin / method allowlist、
  - 多会话时要求显式 `sessionId`、
  - 默认不重试写操作、
  - 按方法/会话限流。

## 快速开始

1. 安装依赖：

```bash
npm install
```

2. 启动 MCP 服务：

```ts
import { startFromEnvironment } from "@web-native-mcp/mcp-server";

await startFromEnvironment();
```

3. 在页面内暴露方法：

```ts
import { createWebMcpBridge } from "@web-native-mcp/web-bridge-sdk";

const bridge = createWebMcpBridge({
  sessionId: "my-app",
  gatewayUrl: "ws://127.0.0.1:8787",
  authToken: "optional-token"
});

const dispose = bridge.exposeMethods({
  "user.getById": { handler: (args) => userService.getById(args) }
});

bridge.start();
// 组件卸载时调用 dispose()
```

完整说明见 `docs/quick-start.md`。

## 包结构

- `packages/protocol`：共享消息类型与校验器。
- `packages/mcp-server`：MCP 工具宿主与桥接网关。
- `packages/web-bridge-sdk`：页面内运行时 API（`exposeMethods`、`unexposeMethod(s)`）。
- `packages/extension-bridge`：基于浏览器扩展的注入桥接。
- `packages/adapters`：历史项目迁移适配器（已含 React 适配器）。

## 示例

- React 历史项目：`examples/react-legacy/src/mcpExpose.ts`
- Vue 历史项目：`examples/vue-legacy/src/mcpExpose.ts`
- Vanilla 历史项目：`examples/vanilla-legacy/src/mcpExpose.js`

## 文档

- 架构说明：`docs/architecture.md`
- 快速上手：`docs/quick-start.md`
- 快速演示：`docs/quick-demo.md`
- 安全基线：`docs/security.md`
- 历史项目改造 Prompt：`docs/legacy-retrofit-prompt.md`
- 发布清单：`docs/release-checklist.md`
- 变更记录：`CHANGELOG.md`

## 安全建议

- 所有环境都配置 `WEB_MCP_BRIDGE_TOKEN`。
- 生产环境建议设置 `WEB_MCP_ALLOW_QUERY_TOKEN=false`。
- 通过 `WEB_MCP_ALLOWED_ORIGINS` 限制来源。
- 通过 `WEB_MCP_METHOD_ALLOWLIST` 收敛可调用方法面。

## 社区协作

- 贡献指南：`CONTRIBUTING.md`
- 安全策略：`SECURITY.md`
- 开源许可：`LICENSE`
