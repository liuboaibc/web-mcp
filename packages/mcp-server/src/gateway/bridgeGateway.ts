import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import {
  PROTOCOL_VERSION,
  validateBridgeMessage,
  validateMethodDescriptors,
  type BridgeEventEnvelope,
  type BridgeRequestEnvelope,
  type BridgeResponseEnvelope,
  type JsonValue,
  type ListMethodsResult,
  type ProtocolError,
  type RequestPayloadMap,
  type RequestType,
  type ResponsePayloadMap
} from "@web-native-mcp/protocol";

interface PendingRequest<T extends RequestType = RequestType> {
  requestId: string;
  type: T;
  method?: string;
  startedAt: number;
  timeout: NodeJS.Timeout;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface SessionConnection {
  sessionId: string;
  appId?: string;
  socket: WebSocket;
  connectedAt: number;
  lastSeenAt: number;
  origin?: string;
}

export interface AuditLogEntry {
  traceId: string;
  operation: "connect" | "disconnect" | "request" | "event" | "error";
  status: "ok" | "error";
  sessionId: string;
  method?: string;
  timestamp: number;
  durationMs?: number;
  details?: JsonValue;
}

export interface BridgeGatewayOptions {
  port: number;
  host?: string;
  authToken?: string;
  allowQueryToken?: boolean;
  allowedOrigins?: string[];
  methodAllowlist?: Array<string | RegExp>;
  defaultTimeoutMs?: number;
  retryAttempts?: number;
  retryMutatingMethods?: boolean;
  mutationMethodPatterns?: Array<string | RegExp>;
  requireExplicitSessionWhenMultiple?: boolean;
  maxInvocationsPerMinute?: number;
  methodRateLimits?: Record<string, number>;
  maxPayloadBytes?: number;
  auditSink?: (entry: AuditLogEntry) => void;
}

export class BridgeGateway extends EventEmitter {
  private readonly options: Required<Omit<BridgeGatewayOptions, "authToken" | "auditSink">> &
    Pick<BridgeGatewayOptions, "authToken" | "auditSink">;
  private readonly sessions = new Map<string, SessionConnection>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly invocationHistory = new Map<string, number[]>();
  private server?: WebSocketServer;

  constructor(options: BridgeGatewayOptions) {
    super();
    this.options = {
      host: options.host ?? "127.0.0.1",
      allowQueryToken: options.allowQueryToken ?? true,
      allowedOrigins: options.allowedOrigins ?? [],
      methodAllowlist: options.methodAllowlist ?? [],
      defaultTimeoutMs: options.defaultTimeoutMs ?? 10_000,
      retryAttempts: Math.max(1, options.retryAttempts ?? 2),
      retryMutatingMethods: options.retryMutatingMethods ?? false,
      mutationMethodPatterns: options.mutationMethodPatterns ?? defaultMutationPatterns(),
      requireExplicitSessionWhenMultiple: options.requireExplicitSessionWhenMultiple ?? true,
      maxInvocationsPerMinute: Math.max(0, options.maxInvocationsPerMinute ?? 60),
      methodRateLimits: options.methodRateLimits ?? {},
      maxPayloadBytes: options.maxPayloadBytes ?? 1_000_000,
      port: options.port,
      authToken: options.authToken,
      auditSink: options.auditSink
    };
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({
      port: this.options.port,
      host: this.options.host,
      maxPayload: this.options.maxPayloadBytes
    });

    this.server.on("connection", (socket, req) => this.handleConnection(socket, req));
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Gateway stopped before response."));
    }
    this.pending.clear();

    for (const session of this.sessions.values()) {
      session.socket.close(1001, "Gateway stopping");
    }
    this.sessions.clear();

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = undefined;
  }

  getSessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  getConnectedSession(sessionId?: string): SessionConnection {
    const connectedIds = this.getSessionIds();
    const id =
      sessionId ??
      (() => {
        if (connectedIds.length === 1) {
          return connectedIds[0];
        }
        if (connectedIds.length > 1 && this.options.requireExplicitSessionWhenMultiple) {
          throw new Error(
            `Multiple sessions connected (${connectedIds.join(", ")}). Please specify sessionId explicitly.`
          );
        }
        return connectedIds[0];
      })();
    if (!id) {
      throw new Error("No connected browser session.");
    }
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not connected: ${id}`);
    }
    return session;
  }

  async listMethods(sessionId?: string, namespace?: string): Promise<ListMethodsResult> {
    const session = this.getConnectedSession(sessionId);
    const result = await this.requestWithRetry(session.sessionId, "listMethods", {
      namespace,
      includeSchemas: true
    });
    const validation = validateMethodDescriptors((result as ListMethodsResult).methods);
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }
    return result as ListMethodsResult;
  }

  async invokeMethod(
    method: string,
    args?: JsonValue,
    sessionId?: string,
    timeoutMs?: number
  ): Promise<JsonValue> {
    if (!this.isMethodAllowed(method)) {
      throw new Error(`Method blocked by allowlist policy: ${method}`);
    }

    const session = this.getConnectedSession(sessionId);
    this.enforceInvocationRateLimit(session.sessionId, method);
    const response = await this.requestWithRetry(
      session.sessionId,
      "invokeMethod",
      { method, args, timeoutMs },
      timeoutMs ?? this.options.defaultTimeoutMs,
      method
    );
    return (response as ResponsePayloadMap["invokeMethod"]).result;
  }

  async subscribe(
    topics: string[],
    sessionId?: string
  ): Promise<ResponsePayloadMap["subscribeEvent"]> {
    const session = this.getConnectedSession(sessionId);
    return this.requestWithRetry(session.sessionId, "subscribeEvent", { topics });
  }

  async unsubscribe(
    subscriptionId: string,
    sessionId?: string
  ): Promise<ResponsePayloadMap["unsubscribeEvent"]> {
    const session = this.getConnectedSession(sessionId);
    return this.requestWithRetry(session.sessionId, "unsubscribeEvent", { subscriptionId });
  }

  private async requestWithRetry<T extends RequestType>(
    sessionId: string,
    type: T,
    payload: RequestPayloadMap[T],
    timeoutMs = this.options.defaultTimeoutMs,
    method?: string
  ): Promise<ResponsePayloadMap[T]> {
    let lastError: Error | undefined;
    const maxAttempts =
      type === "invokeMethod" && method && this.isMutatingMethod(method) && !this.options.retryMutatingMethods
        ? 1
        : this.options.retryAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.request(sessionId, type, payload, timeoutMs, method);
      } catch (error) {
        lastError = error as Error;
        if (attempt >= maxAttempts) {
          break;
        }
        this.audit({
          traceId: randomUUID(),
          operation: "request",
          status: "error",
          sessionId,
          method,
          timestamp: Date.now(),
          details: {
            reason: "retry",
            attempt,
            maxAttempts,
            message: String(error)
          }
        });
      }
    }

    throw lastError ?? new Error(`Failed request: ${type}`);
  }

  private async request<T extends RequestType>(
    sessionId: string,
    type: T,
    payload: RequestPayloadMap[T],
    timeoutMs = this.options.defaultTimeoutMs,
    method?: string
  ): Promise<ResponsePayloadMap[T]> {
    const session = this.getConnectedSession(sessionId);
    const requestId = randomUUID();
    const startedAt = Date.now();

    const message: BridgeRequestEnvelope<T> = {
      protocolVersion: PROTOCOL_VERSION,
      kind: "request",
      requestId,
      sessionId,
      timestamp: startedAt,
      type,
      payload
    };

    return new Promise<ResponsePayloadMap[T]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        const error = new Error(`Timed out waiting for ${type} response.`);
        this.audit({
          traceId: requestId,
          operation: "request",
          status: "error",
          sessionId,
          method,
          timestamp: Date.now(),
          durationMs: Date.now() - startedAt,
          details: {
            reason: "timeout",
            timeoutMs
          }
        });
        reject(error);
      }, timeoutMs);

      this.pending.set(requestId, {
        requestId,
        type,
        method,
        startedAt,
        timeout,
        resolve: resolve as (value: unknown) => void,
        reject
      });

      session.socket.send(JSON.stringify(message), (error) => {
        if (!error) {
          return;
        }
        clearTimeout(timeout);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const sessionId = requestUrl.searchParams.get("sessionId") ?? randomUUID();
    const appId = requestUrl.searchParams.get("appId") ?? undefined;
    const protocolToken = this.extractProtocolToken(req.headers["sec-websocket-protocol"]);
    const queryToken = this.options.allowQueryToken ? requestUrl.searchParams.get("token") : undefined;
    const token = protocolToken ?? queryToken ?? req.headers["x-bridge-token"];
    const origin = req.headers.origin ?? undefined;

    if (!this.isAuthorized(token)) {
      socket.close(4001, "Unauthorized");
      return;
    }
    if (!this.isOriginAllowed(origin)) {
      socket.close(4003, "Origin not allowlisted");
      return;
    }

    const connection: SessionConnection = {
      sessionId,
      appId,
      socket,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      origin
    };
    this.sessions.set(sessionId, connection);
    this.audit({
      traceId: randomUUID(),
      operation: "connect",
      status: "ok",
      sessionId,
      timestamp: Date.now(),
      details: {
        ...(appId ? { appId } : {}),
        ...(origin ? { origin } : {})
      }
    });

    socket.on("message", (raw) => this.handleMessage(sessionId, raw.toString()));
    socket.on("close", () => {
      this.sessions.delete(sessionId);
      this.audit({
        traceId: randomUUID(),
        operation: "disconnect",
        status: "ok",
        sessionId,
        timestamp: Date.now()
      });
    });
    socket.on("error", (error) => {
      this.audit({
        traceId: randomUUID(),
        operation: "error",
        status: "error",
        sessionId,
        timestamp: Date.now(),
        details: { message: String(error) }
      });
    });
  }

  private handleMessage(sessionId: string, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.audit({
        traceId: randomUUID(),
        operation: "error",
        status: "error",
        sessionId,
        timestamp: Date.now(),
        details: { reason: "invalid_json" }
      });
      return;
    }

    const validation = validateBridgeMessage(parsed);
    if (!validation.ok || !validation.value) {
      this.audit({
        traceId: randomUUID(),
        operation: "error",
        status: "error",
        sessionId,
        timestamp: Date.now(),
        details: { reason: validation.errors.join(", ") }
      });
      return;
    }

    const message = validation.value;
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeenAt = Date.now();
    }

    if (message.kind === "event") {
      const eventMessage = message as BridgeEventEnvelope;
      this.audit({
        traceId: message.requestId,
        operation: "event",
        status: "ok",
        sessionId,
        timestamp: Date.now(),
        details: { topic: eventMessage.topic }
      });
      this.emit("page-event", {
        sessionId,
        topic: eventMessage.topic,
        payload: eventMessage.payload,
        timestamp: eventMessage.timestamp
      });
      return;
    }

    if (message.kind !== "response") {
      return;
    }

    const response = message as BridgeResponseEnvelope;
    const pending = this.pending.get(response.requestId);
    if (!pending) {
      return;
    }

    this.pending.delete(response.requestId);
    clearTimeout(pending.timeout);

    if (response.success) {
      this.audit({
        traceId: response.requestId,
        operation: "request",
        status: "ok",
        sessionId,
        method: pending.method,
        timestamp: Date.now(),
        durationMs: Date.now() - pending.startedAt
      });
      pending.resolve((response.payload ?? {}) as ResponsePayloadMap[typeof pending.type]);
      return;
    }

    const protocolError = response.error ?? {
      code: "BRIDGE_ERROR",
      message: "Unknown bridge error"
    };
    this.audit({
      traceId: response.requestId,
      operation: "request",
      status: "error",
      sessionId,
      method: pending.method,
      timestamp: Date.now(),
      durationMs: Date.now() - pending.startedAt,
      details: {
        code: protocolError.code,
        message: protocolError.message
      }
    });
    pending.reject(this.toError(protocolError));
  }

  private isAuthorized(token: string | string[] | undefined): boolean {
    if (!this.options.authToken) {
      return true;
    }
    if (!token) {
      return false;
    }
    if (Array.isArray(token)) {
      return token.includes(this.options.authToken);
    }
    return token === this.options.authToken;
  }

  private isOriginAllowed(origin?: string): boolean {
    if (this.options.allowedOrigins.length === 0) {
      return true;
    }
    if (!origin) {
      return false;
    }
    return this.options.allowedOrigins.includes(origin);
  }

  private isMethodAllowed(method: string): boolean {
    const allowlist = this.options.methodAllowlist;
    if (allowlist.length === 0) {
      return true;
    }
    return allowlist.some((rule) => {
      if (typeof rule === "string") {
        return rule === method;
      }
      return rule.test(method);
    });
  }

  private isMutatingMethod(method: string): boolean {
    return this.options.mutationMethodPatterns.some((rule) => {
      if (typeof rule === "string") {
        return method.includes(rule);
      }
      return rule.test(method);
    });
  }

  private enforceInvocationRateLimit(sessionId: string, method: string): void {
    const configuredLimit = this.options.methodRateLimits[method];
    const limit =
      configuredLimit !== undefined ? configuredLimit : this.options.maxInvocationsPerMinute;
    if (limit <= 0) {
      return;
    }

    const key = `${sessionId}::${method}`;
    const now = Date.now();
    const minTimestamp = now - 60_000;
    const history = this.invocationHistory.get(key) ?? [];
    const recent = history.filter((timestamp) => timestamp >= minTimestamp);
    if (recent.length >= limit) {
      throw new Error(`Rate limit exceeded for method ${method}: max ${limit}/min`);
    }
    recent.push(now);
    this.invocationHistory.set(key, recent);
  }

  private extractProtocolToken(header: string | string[] | undefined): string | undefined {
    if (!header) {
      return undefined;
    }
    const value = Array.isArray(header) ? header.join(",") : header;
    const protocols = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const authProtocol = protocols.find((item) => item.startsWith("auth."));
    if (!authProtocol) {
      return undefined;
    }
    const encoded = authProtocol.slice("auth.".length);
    try {
      return Buffer.from(encoded, "base64url").toString("utf8");
    } catch {
      return undefined;
    }
  }

  private toError(protocolError: ProtocolError): Error {
    const error = new Error(`[${protocolError.code}] ${protocolError.message}`);
    if (protocolError.details !== undefined) {
      (error as Error & { details?: JsonValue }).details = protocolError.details;
    }
    return error;
  }

  private audit(entry: AuditLogEntry): void {
    if (this.options.auditSink) {
      this.options.auditSink(entry);
      return;
    }
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}

function defaultMutationPatterns(): RegExp[] {
  return [
    /(^|\.)create/i,
    /(^|\.)update/i,
    /(^|\.)delete/i,
    /(^|\.)remove/i,
    /(^|\.)set/i,
    /(^|\.)add/i,
    /(^|\.)insert/i,
    /(^|\.)pay/i,
    /(^|\.)submit/i,
    /(^|\.)approve/i,
    /(^|\.)cancel/i,
    /(^|\.)rename/i,
    /(^|\.)write/i,
    /(^|\.)mutate/i
  ];
}
