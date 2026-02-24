import {
  PROTOCOL_VERSION,
  validateBridgeMessage,
  type BridgeMessage,
  type BridgeRequestEnvelope,
  type BridgeResponseEnvelope,
  type JsonValue,
  type MethodDescriptor,
  type ProtocolError,
  type RequestPayloadMap,
  type RequestType
} from "@web-native-mcp/protocol";

export type ExposedMethod = (args: JsonValue, context: { method: string }) => Promise<JsonValue> | JsonValue;
export type Dispose = () => void;

export interface MethodRegistration {
  handler: ExposedMethod;
  descriptor?: Omit<MethodDescriptor, "name">;
  validateArgs?: (args: JsonValue) => void;
}

export interface BridgeTransport {
  send: (message: BridgeMessage) => void;
  close: () => void;
  onMessage: (listener: (message: unknown) => void) => void;
  onError?: (listener: (error: unknown) => void) => void;
  onClose?: (listener: () => void) => void;
}

export interface WebBridgeRuntimeOptions {
  sessionId: string;
  appId?: string;
  gatewayUrl: string;
  authToken?: string;
  reconnectAttempts?: number;
  reconnectBackoffMs?: number;
  methodAllowlist?: Array<string | RegExp>;
  transport?: BridgeTransport;
  logger?: RuntimeLogger;
}

export interface RuntimeLogger {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
}

interface EventSubscription {
  id: string;
  topics: Set<string>;
}

class WebSocketTransport implements BridgeTransport {
  private socket?: WebSocket;
  private readonly url: string;
  private readonly protocols: string[];
  private readonly reconnectAttempts: number;
  private readonly reconnectBackoffMs: number;
  private readonly messageListeners: Array<(message: unknown) => void> = [];
  private readonly errorListeners: Array<(error: unknown) => void> = [];
  private readonly closeListeners: Array<() => void> = [];
  private readonly sendQueue: string[] = [];
  private reconnectCount = 0;
  private manuallyClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: WebSocketTransportOptions) {
    this.url = options.url;
    this.protocols = buildWebSocketProtocols(options.authToken);
    this.reconnectAttempts = options.reconnectAttempts;
    this.reconnectBackoffMs = options.reconnectBackoffMs;
    this.connect();
  }

  send(message: BridgeMessage): void {
    const encoded = JSON.stringify(message);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(encoded);
      return;
    }
    this.sendQueue.push(encoded);
    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
      this.connect();
    }
  }

  close(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.socket?.close();
  }

  onMessage(listener: (message: unknown) => void): void {
    this.messageListeners.push(listener);
  }

  onError(listener: (error: unknown) => void): void {
    this.errorListeners.push(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  private connect(): void {
    const socket = new WebSocket(this.url, this.protocols);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectCount = 0;
      this.flushQueue();
    });

    this.socket.addEventListener("message", (event) => {
      try {
        this.messageListeners.forEach((listener) => listener(JSON.parse(String(event.data))));
      } catch (error) {
        this.errorListeners.forEach((listener) => listener(error));
      }
    });
    this.socket.addEventListener("error", (event) => {
      this.errorListeners.forEach((listener) => listener(event));
    });
    this.socket.addEventListener("close", () => {
      this.closeListeners.forEach((listener) => listener());
      this.socket = undefined;
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectCount >= this.reconnectAttempts) {
      return;
    }
    const waitMs = this.reconnectBackoffMs * Math.max(1, this.reconnectCount + 1);
    this.reconnectCount += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, waitMs);
  }

  private flushQueue(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    while (this.sendQueue.length > 0) {
      const payload = this.sendQueue.shift();
      if (!payload) {
        continue;
      }
      this.socket.send(payload);
    }
  }
}

export class WebBridgeRuntime {
  private readonly options: WebBridgeRuntimeOptions;
  private readonly methods = new Map<string, MethodRegistration>();
  private readonly subscriptions = new Map<string, EventSubscription>();
  private readonly transport: BridgeTransport;
  private readonly logger: RuntimeLogger;

  constructor(options: WebBridgeRuntimeOptions) {
    this.options = options;
    this.logger = options.logger ?? {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined
    };
    this.transport =
      options.transport ??
      new WebSocketTransport({
        url: this.buildGatewayUrl(),
        authToken: options.authToken,
        reconnectAttempts: Math.max(0, options.reconnectAttempts ?? 3),
        reconnectBackoffMs: Math.max(100, options.reconnectBackoffMs ?? 500)
      });
  }

  start(): void {
    this.transport.onMessage((message) => {
      this.handleMessage(message).catch((error) => {
        this.logger.error("bridge_handle_message_failed", { error: String(error) });
      });
    });
    this.transport.onError?.((error) => {
      this.logger.error("bridge_transport_error", { error: String(error) });
    });
    this.transport.onClose?.(() => {
      this.logger.warn("bridge_transport_closed");
    });
  }

  stop(): void {
    this.transport.close();
  }

  registerMethod(name: string, registration: MethodRegistration): Dispose {
    if (!name || typeof name !== "string") {
      throw new Error("Method name must be a non-empty string.");
    }
    const entry = registration;
    this.methods.set(name, entry);

    let disposed = false;
    return () => {
      if (disposed) {
        return;
      }
      disposed = true;
      const current = this.methods.get(name);
      // Avoid removing methods that were re-registered by another mounted component.
      if (current === entry) {
        this.methods.delete(name);
      }
    };
  }

  unregisterMethod(name: string): boolean {
    return this.methods.delete(name);
  }

  unregisterMethods(names: Iterable<string>): number {
    let removed = 0;
    for (const name of names) {
      if (this.unregisterMethod(name)) {
        removed += 1;
      }
    }
    return removed;
  }

  clearMethods(): void {
    this.methods.clear();
  }

  exposeMethods(methods: Record<string, MethodRegistration | ExposedMethod>): Dispose {
    const disposers: Dispose[] = [];
    for (const [name, value] of Object.entries(methods)) {
      if (typeof value === "function") {
        disposers.push(this.registerMethod(name, { handler: value }));
      } else {
        disposers.push(this.registerMethod(name, value));
      }
    }
    return () => {
      for (const dispose of disposers) {
        dispose();
      }
    };
  }

  emitEvent(topic: string, payload: JsonValue): void {
    const shouldPublish = [...this.subscriptions.values()].some((item) => item.topics.has(topic));
    if (!shouldPublish) {
      return;
    }

    const message: BridgeMessage = {
      protocolVersion: PROTOCOL_VERSION,
      kind: "event",
      requestId: createRequestId(),
      sessionId: this.options.sessionId,
      timestamp: Date.now(),
      type: "event",
      topic,
      payload: safeJson(payload)
    };
    this.transport.send(message);
  }

  private async handleMessage(input: unknown): Promise<void> {
    const validation = validateBridgeMessage(input);
    if (!validation.ok || !validation.value) {
      this.logger.warn("bridge_message_rejected", { errors: validation.errors });
      return;
    }
    if (validation.value.kind !== "request") {
      return;
    }

    const request = validation.value as BridgeRequestEnvelope<RequestType>;
    const response = await this.handleRequest(request);
    this.transport.send(response);
  }

  private async handleRequest(
    request: BridgeRequestEnvelope<RequestType>
  ): Promise<BridgeResponseEnvelope<RequestType>> {
    try {
      if (request.type === "listMethods") {
        const payload = request.payload as RequestPayloadMap["listMethods"];
        const namespace = payload.namespace;
        const methods = [...this.methods.entries()]
          .filter(([methodName]) => {
            if (!namespace) {
              return true;
            }
            return methodName.startsWith(`${namespace}.`);
          })
          .map(([name, item]) => ({
            name,
            ...item.descriptor
          }));
        return this.okResponse(request, { methods });
      }

      if (request.type === "invokeMethod") {
        const payload = request.payload as RequestPayloadMap["invokeMethod"];
        const methodName = payload.method;
        if (!this.isMethodAllowed(methodName)) {
          return this.errorResponse(request, {
            code: "METHOD_NOT_ALLOWED",
            message: `Method blocked by allowlist: ${methodName}`
          });
        }
        const method = this.methods.get(methodName);
        if (!method) {
          return this.errorResponse(request, {
            code: "METHOD_NOT_FOUND",
            message: `Method not exposed: ${methodName}`
          });
        }

        method.validateArgs?.(payload.args ?? null);
        const result = await method.handler(payload.args ?? null, { method: methodName });
        return this.okResponse(request, {
          method: methodName,
          result: safeJson(result)
        });
      }

      if (request.type === "subscribeEvent") {
        const payload = request.payload as RequestPayloadMap["subscribeEvent"];
        const id = createRequestId();
        this.subscriptions.set(id, {
          id,
          topics: new Set(payload.topics)
        });
        return this.okResponse(request, {
          subscriptionId: id,
          acceptedTopics: payload.topics
        });
      }

      if (request.type === "unsubscribeEvent") {
        const payload = request.payload as RequestPayloadMap["unsubscribeEvent"];
        this.subscriptions.delete(payload.subscriptionId);
        return this.okResponse(request, { ok: true });
      }

      return this.okResponse(request, { value: "pong", at: Date.now() });
    } catch (error) {
      return this.errorResponse(request, {
        code: "METHOD_EXECUTION_FAILED",
        message: String(error)
      });
    }
  }

  private okResponse<T extends RequestType>(
    request: BridgeRequestEnvelope<T>,
    payload: unknown
  ): BridgeResponseEnvelope<T> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      kind: "response",
      requestId: request.requestId,
      sessionId: this.options.sessionId,
      timestamp: Date.now(),
      type: request.type,
      success: true,
      payload: payload as BridgeResponseEnvelope<T>["payload"]
    };
  }

  private errorResponse<T extends RequestType>(
    request: BridgeRequestEnvelope<T>,
    error: ProtocolError
  ): BridgeResponseEnvelope<T> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      kind: "response",
      requestId: request.requestId,
      sessionId: this.options.sessionId,
      timestamp: Date.now(),
      type: request.type,
      success: false,
      error
    };
  }

  private isMethodAllowed(method: string): boolean {
    const allowlist = this.options.methodAllowlist ?? [];
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

  private buildGatewayUrl(): string {
    const url = new URL(this.options.gatewayUrl);
    url.searchParams.set("sessionId", this.options.sessionId);
    if (this.options.appId) {
      url.searchParams.set("appId", this.options.appId);
    }
    return url.toString();
  }
}

interface WebSocketTransportOptions {
  url: string;
  authToken?: string;
  reconnectAttempts: number;
  reconnectBackoffMs: number;
}

function buildWebSocketProtocols(authToken?: string): string[] {
  const protocols = ["web-native-mcp.v1"];
  if (authToken) {
    protocols.push(`auth.${encodeBase64Url(authToken)}`);
  }
  return protocols;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const item of bytes) {
    binary += String.fromCharCode(item);
  }
  const encoded = btoa(binary);
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
