# Web-native MCP Architecture

## Purpose

This framework allows AI agents to invoke browser page methods directly through MCP tools, instead of relying on flaky DOM click automation.

## Core Components

- `@web-native-mcp/protocol`: shared message contracts and runtime validation.
- `@web-native-mcp/mcp-server`: MCP tool host + WebSocket bridge gateway.
- `@web-native-mcp/web-bridge-sdk`: in-page runtime for explicit method exposure.
- `@web-native-mcp/extension-bridge`: legacy-friendly extension path using global method mapping.
- `@web-native-mcp/adapters`: helper adapters for fast migration (React first).

## System Architecture

```mermaid
flowchart LR
  aiClient[AIClient] --> mcpServer[MCPServer]
  mcpServer --> gateway[BridgeGateway]
  gateway --> sdkRuntime[SDKRuntime]
  gateway --> extRuntime[ExtensionRuntime]
  sdkRuntime --> appMethods[ExposedMethods]
  extRuntime --> appMethods
  appMethods --> appServices[BusinessServices]
  appServices --> appMethods
  appMethods --> gateway
```

## End-to-End Interaction

```mermaid
sequenceDiagram
  autonumber
  participant AI as AIAgent
  participant MCP as MCPClient
  participant GW as BridgeGateway
  participant Page as PageRuntimeSDKOrExtension
  participant App as AppService

  AI->>MCP: listPageMethods
  MCP->>GW: listMethods
  GW->>Page: listMethods request
  Page-->>GW: methods
  GW-->>MCP: methods
  MCP-->>AI: method catalog

  AI->>MCP: invokePageMethod(method,args)
  MCP->>GW: invokeMethod
  GW->>GW: policy checks
  GW->>Page: invoke request
  Page->>App: call business method
  App-->>Page: result
  Page-->>GW: response
  GW-->>MCP: result
  MCP-->>AI: final result

  App-->>Page: emit event
  Page-->>GW: event
  GW-->>MCP: event stream
  MCP-->>AI: event notification
```

## Security and Governance Controls

```mermaid
flowchart LR
  invokeReq[InvokeRequest] --> sessionCheck[SessionCheck]
  sessionCheck --> allowlistCheck[MethodAllowlist]
  allowlistCheck --> rateLimitCheck[RateLimit]
  rateLimitCheck --> retryPolicy[RetryPolicy]
  retryPolicy --> invokeExec[InvokeExecution]
  invokeExec --> auditLog[AuditLog]
  auditLog --> invokeResp[InvokeResponse]
```

Current defaults implemented in this repository:

1. Explicit `sessionId` is required when multiple sessions are connected.
2. Mutating methods do not retry by default.
3. Invocation is rate-limited per session and method.
4. Token auth prefers WebSocket subprotocol; query token can be disabled.
5. Extension bridge validates `origin` and `channelSecret`.

## Design Choices

- **Protocol-first**: all modes share one message contract and version.
- **Hybrid onboarding**: SDK mode (explicit, safer) + extension mode (faster retrofit).
- **Policy-driven security**: auth token, origin allowlist, method allowlist.
- **Operational visibility**: JSON audit logs with trace ids and durations.
