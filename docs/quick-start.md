# Quick Start

## 1) Install

```bash
npm install
```

## 2) Start MCP Server

Set environment variables as needed:

- `WEB_MCP_BRIDGE_PORT` (default `8787`)
- `WEB_MCP_BRIDGE_TOKEN` (optional but recommended)
- `WEB_MCP_ALLOW_QUERY_TOKEN` (default `true`, recommend `false` in production)
- `WEB_MCP_ALLOWED_ORIGINS` (comma-separated origin allowlist)
- `WEB_MCP_METHOD_ALLOWLIST` (comma-separated method names)
- `WEB_MCP_REQUIRE_EXPLICIT_SESSION` (default `true`)
- `WEB_MCP_RETRY_MUTATING_METHODS` (default `false`)
- `WEB_MCP_MAX_INVOCATIONS_PER_MINUTE` (default `60`)

Then start your MCP entry:

```ts
import { startFromEnvironment } from "@web-native-mcp/mcp-server";

await startFromEnvironment();
```

## 3) SDK Mode (recommended for controlled integration)

```ts
import { createWebMcpBridge } from "@web-native-mcp/web-bridge-sdk";

const bridge = createWebMcpBridge({
  sessionId: "my-app",
  gatewayUrl: "ws://127.0.0.1:8787",
  authToken: "optional-token"
});

const disposeUserMethods = bridge.exposeMethods({
  "user.getById": {
    description: "Get user by id",
    async handler(args) {
      return userService.getById(args);
    }
  }
});

bridge.start();

// Component/page unmount cleanup:
disposeUserMethods();
// or bridge.unexposeMethod("user.getById");
```

Runtime reliability defaults:
- reconnect attempts: `3`
- reconnect backoff: `500ms` incremental
- outbound messages are queued while socket is disconnected

React pattern:

```ts
useEffect(() => {
  const dispose = bridge.exposeMethods({
    "cart.addItem": { handler: (args) => cartService.addItem(args) }
  });
  return () => dispose();
}, []);
```

Vue pattern:

```ts
import { useVueLegacyMcpBridge } from "../examples/vue-legacy/src/mcpExpose";

setup() {
  useVueLegacyMcpBridge(legacyServices);
}
```

## 4) Extension Mode (faster for legacy globals)

```ts
import { startExtensionBridge } from "@web-native-mcp/extension-bridge";

startExtensionBridge({
  gatewayUrl: "ws://127.0.0.1:8787",
  sessionId: "legacy-app",
  authToken: "optional-token",
  globalMethods: [
    { name: "cart.addItem", path: "legacyApi.cart.addItem" }
  ]
});
```

## 5) Run from MCP Client

1. Call `listPageMethods` to inspect available methods.
2. Call `invokePageMethod` with method name and args.
3. Optionally subscribe to events via `subscribeEvent`.

## Migration Recipes

- **React store/service**: use `createReactAdapter` to map existing store methods.
- **Vue legacy service**: call `useVueLegacyMcpBridge(...)` in `setup`, and rely on unmount cleanup.
- **Vanilla old app**: expose a small `window.legacyApi` facade, then map paths in extension config.
- **Incremental rollout**: start read-only methods first, then controlled write methods with allowlist.
