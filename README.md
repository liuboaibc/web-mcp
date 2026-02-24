# Web-native MCP Framework

> Disclaimer: This entire project is AI-generated and is for reference only.

[中文版本 / Chinese Version](README.zh-CN.md)

Web-native MCP framework that lets AI call in-page business methods directly, instead of brittle DOM click automation.

## Demo (3 Minutes)

Use `docs/quick-demo.md` to run and record a minimal end-to-end demo:

1. Start MCP server and open an integrated page.
2. Call `listPageMethods`.
3. Call `invokePageMethod`.
4. Unmount/dispose and verify safe failure.
5. Verify one governance rejection (rate/session/policy).

Demo asset recommendation:

- Add your GIF at `docs/assets/demo.gif` and embed it here for project homepage visibility.

## Why This Project

- Replace UI simulation with direct method invocation (`listPageMethods` + `invokePageMethod`).
- Keep one protocol for both integration styles:
  - SDK mode (explicit method exposure, safer and recommended).
  - Extension mode (fast retrofit for legacy projects).
- Make legacy onboarding practical with adapters and ready-to-copy examples.

## Key Capabilities

- Unified protocol contract and runtime validation.
- MCP server tools backed by a browser bridge gateway.
- Component-friendly method lifecycle (`exposeMethods` with disposer, `unexposeMethod(s)`).
- Connection resilience (message queue + reconnect).
- Security and governance defaults:
  - token-based auth (WebSocket subprotocol preferred),
  - origin/method allowlists,
  - explicit session selection when multiple sessions exist,
  - mutating method retry disabled by default,
  - per-method/session rate limiting.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start MCP server:

```ts
import { startFromEnvironment } from "@web-native-mcp/mcp-server";

await startFromEnvironment();
```

3. Expose methods in your app:

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
// call dispose() on unmount
```

See full instructions in `docs/quick-start.md`.

## Package Layout

- `packages/protocol`: shared message types and validators.
- `packages/mcp-server`: MCP tool host and bridge gateway.
- `packages/web-bridge-sdk`: in-page runtime APIs (`exposeMethods`, `unexposeMethod(s)`).
- `packages/extension-bridge`: extension-based injection bridge.
- `packages/adapters`: migration helpers for legacy apps (React adapter included).

## Example Integrations

- React legacy app: `examples/react-legacy/src/mcpExpose.ts`
- Vue legacy app: `examples/vue-legacy/src/mcpExpose.ts`
- Vanilla legacy app: `examples/vanilla-legacy/src/mcpExpose.js`

## Documentation

- Architecture: `docs/architecture.md`
- Quick start: `docs/quick-start.md`
- Quick demo: `docs/quick-demo.md`
- Security baseline: `docs/security.md`
- Legacy retrofit prompt: `docs/legacy-retrofit-prompt.md`
- Release checklist: `docs/release-checklist.md`
- Changelog: `CHANGELOG.md`

## Security Notes

- Set `WEB_MCP_BRIDGE_TOKEN` for all environments.
- In production, prefer `WEB_MCP_ALLOW_QUERY_TOKEN=false`.
- Restrict origins with `WEB_MCP_ALLOWED_ORIGINS`.
- Restrict callable surface with `WEB_MCP_METHOD_ALLOWLIST`.

## Community

- Contributing guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- License: `LICENSE`
