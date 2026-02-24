# Security Baseline

## Threat Model

This framework enables remote method execution in a live page. The primary risks are unauthorized invocation, overexposed methods, and sensitive data leakage.

## Mandatory Controls

1. **Auth token**  
   Configure `WEB_MCP_BRIDGE_TOKEN` and require every page/extension connection to provide it.  
   Prefer WebSocket subprotocol auth (default in SDK/extension) and disable query token in production (`WEB_MCP_ALLOW_QUERY_TOKEN=false`).

2. **Origin allowlist**  
   Restrict browser connection origins with `WEB_MCP_ALLOWED_ORIGINS`.

3. **Method allowlist**  
   Restrict callable methods with `WEB_MCP_METHOD_ALLOWLIST`.  
   Avoid wildcard exposure for write operations.

4. **Namespace partitioning**  
   Separate readonly and mutating methods by namespace:
   - `readonly.*`
   - `admin.*`
   - `order.*`

5. **Audit logs**  
   Persist gateway audit entries (`traceId`, method, session, status, duration).

## Recommended Controls

- Use short-lived tokens and rotate regularly.
- Redact sensitive payload fields before returning results.
- Add method-level argument validation in `validateArgs`.
- Add policy checks inside handlers for business authorization.
- Disable extension mode in production unless absolutely required.
- For extension mode, keep strict origin + channel secret checks enabled.

## Data Handling Rules

- Only JSON-serializable payloads should cross bridge boundaries.
- Never expose methods that directly return secrets or raw credentials.
- Hash or truncate high-risk args in external log sinks.

## Incident Response Hooks

- Revoke bridge token to immediately block all new sessions.
- Tighten allowlist to readonly methods only.
- Use audit `traceId` to correlate MCP calls with page-side logs.
