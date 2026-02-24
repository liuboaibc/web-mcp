# 3-Minute Quick Demo

This runbook helps contributors verify the core workflow quickly.

## Goal

Demonstrate that AI can discover and invoke page methods through MCP without click automation.

## Prerequisites

- Node.js 18+
- Dependencies installed: `npm install`
- A demo web app integrated with SDK mode or extension mode

## Steps

1. Start the MCP server:

```bash
npm run build
```

Then run the project entry that calls `startFromEnvironment()` (see `docs/quick-start.md`).

2. Open a page that exposes methods (`bridge.exposeMethods(...)`).

3. From your MCP client, run:

- `listPageMethods` and verify method list is returned.
- `invokePageMethod` for at least 2 readonly methods and 1 mutating method.

4. Validate lifecycle cleanup:

- Unmount/dispose the component that registered a method.
- Invoke the removed method again and confirm safe failure (e.g. `METHOD_NOT_FOUND`).

5. Validate governance controls:

- Trigger session ambiguity (multiple sessions) and verify explicit session enforcement.
- Trigger rate limit and verify request rejection.

## Demo Recording Checklist

Record a short clip/GIF showing:

1. `listPageMethods` success
2. `invokePageMethod` success
3. cleanup-safe failure after unmount
4. one policy rejection case
