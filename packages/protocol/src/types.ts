export const PROTOCOL_VERSION = "1.0.0";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: JsonPrimitive[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
}

export interface MethodDescriptor {
  name: string;
  description?: string;
  namespace?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  tags?: string[];
  requiresAuth?: boolean;
}

export interface ProtocolError {
  code: string;
  message: string;
  details?: JsonValue;
  retryable?: boolean;
}

export interface ListMethodsPayload {
  namespace?: string;
  includeSchemas?: boolean;
}

export interface ListMethodsResult {
  methods: MethodDescriptor[];
}

export interface InvokeMethodPayload {
  method: string;
  args?: JsonValue;
  timeoutMs?: number;
}

export interface InvokeMethodResult {
  method: string;
  result: JsonValue;
}

export interface SubscribeEventPayload {
  topics: string[];
}

export interface SubscribeEventResult {
  subscriptionId: string;
  acceptedTopics: string[];
}

export interface UnsubscribeEventPayload {
  subscriptionId: string;
}

export interface PingPayload {
  value?: string;
}

export interface PingResult {
  value: string;
  at: number;
}

export type RequestType =
  | "listMethods"
  | "invokeMethod"
  | "subscribeEvent"
  | "unsubscribeEvent"
  | "ping";

export type RequestPayloadMap = {
  listMethods: ListMethodsPayload;
  invokeMethod: InvokeMethodPayload;
  subscribeEvent: SubscribeEventPayload;
  unsubscribeEvent: UnsubscribeEventPayload;
  ping: PingPayload;
};

export type ResponsePayloadMap = {
  listMethods: ListMethodsResult;
  invokeMethod: InvokeMethodResult;
  subscribeEvent: SubscribeEventResult;
  unsubscribeEvent: { ok: true };
  ping: PingResult;
};

interface BaseEnvelope {
  protocolVersion: string;
  requestId: string;
  sessionId: string;
  timestamp: number;
}

export interface BridgeRequestEnvelope<TType extends RequestType = RequestType> extends BaseEnvelope {
  kind: "request";
  type: TType;
  payload: RequestPayloadMap[TType];
}

export interface BridgeResponseEnvelope<TType extends RequestType = RequestType> extends BaseEnvelope {
  kind: "response";
  type: TType;
  success: boolean;
  payload?: ResponsePayloadMap[TType];
  error?: ProtocolError;
}

export interface BridgeEventEnvelope extends BaseEnvelope {
  kind: "event";
  type: "event";
  topic: string;
  payload: JsonValue;
}

export type BridgeMessage = BridgeRequestEnvelope | BridgeResponseEnvelope | BridgeEventEnvelope;
