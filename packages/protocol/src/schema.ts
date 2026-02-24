import {
  PROTOCOL_VERSION,
  type BridgeEventEnvelope,
  type BridgeMessage,
  type BridgeRequestEnvelope,
  type BridgeResponseEnvelope,
  type JsonSchema,
  type MethodDescriptor,
  type RequestType
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

const baseEnvelopeSchema: JsonSchema = {
  type: "object",
  required: ["protocolVersion", "kind", "requestId", "sessionId", "timestamp"],
  properties: {
    protocolVersion: { type: "string" },
    kind: { type: "string" },
    requestId: { type: "string" },
    sessionId: { type: "string" },
    timestamp: { type: "number" }
  },
  additionalProperties: true
};

const methodDescriptorSchema: JsonSchema = {
  type: "object",
  required: ["name"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    namespace: { type: "string" },
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    tags: { type: "array", items: { type: "string" } },
    requiresAuth: { type: "boolean" }
  },
  additionalProperties: true
};

const payloadSchemas: Record<RequestType, JsonSchema> = {
  listMethods: {
    type: "object",
    properties: {
      namespace: { type: "string" },
      includeSchemas: { type: "boolean" }
    },
    additionalProperties: false
  },
  invokeMethod: {
    type: "object",
    required: ["method"],
    properties: {
      method: { type: "string" },
      args: {},
      timeoutMs: { type: "number" }
    },
    additionalProperties: false
  },
  subscribeEvent: {
    type: "object",
    required: ["topics"],
    properties: {
      topics: { type: "array", items: { type: "string" } }
    },
    additionalProperties: false
  },
  unsubscribeEvent: {
    type: "object",
    required: ["subscriptionId"],
    properties: {
      subscriptionId: { type: "string" }
    },
    additionalProperties: false
  },
  ping: {
    type: "object",
    properties: {
      value: { type: "string" }
    },
    additionalProperties: false
  }
};

export const protocolSchemas = {
  baseEnvelope: baseEnvelopeSchema,
  methodDescriptor: methodDescriptorSchema,
  payloads: payloadSchemas
} as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function hasString(value: UnknownRecord, key: string): boolean {
  return typeof value[key] === "string";
}

function hasNumber(value: UnknownRecord, key: string): boolean {
  return typeof value[key] === "number" && Number.isFinite(value[key] as number);
}

function isMethodDescriptor(value: unknown): value is MethodDescriptor {
  return isRecord(value) && typeof value.name === "string" && value.name.length > 0;
}

function isRequestType(value: unknown): value is RequestType {
  return (
    value === "listMethods" ||
    value === "invokeMethod" ||
    value === "subscribeEvent" ||
    value === "unsubscribeEvent" ||
    value === "ping"
  );
}

export function validateBridgeMessage(input: unknown): ValidationResult<BridgeMessage> {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["Message must be an object."] };
  }

  if (!hasString(input, "protocolVersion")) {
    errors.push("protocolVersion must be a string.");
  } else if (input.protocolVersion !== PROTOCOL_VERSION) {
    errors.push(`protocolVersion mismatch. expected=${PROTOCOL_VERSION}`);
  }

  if (!hasString(input, "requestId")) {
    errors.push("requestId must be a string.");
  }
  if (!hasString(input, "sessionId")) {
    errors.push("sessionId must be a string.");
  }
  if (!hasNumber(input, "timestamp")) {
    errors.push("timestamp must be a finite number.");
  }
  if (!hasString(input, "kind")) {
    errors.push("kind must be a string.");
  }

  const kind = input.kind;
  if (kind === "request") {
    if (!isRequestType(input.type)) {
      errors.push("request.type is invalid.");
    }
    if (!isRecord(input.payload)) {
      errors.push("request.payload must be an object.");
    }
    return errors.length === 0
      ? { ok: true, value: input as unknown as BridgeRequestEnvelope, errors: [] }
      : { ok: false, errors };
  }

  if (kind === "response") {
    if (!isRequestType(input.type)) {
      errors.push("response.type is invalid.");
    }
    if (typeof input.success !== "boolean") {
      errors.push("response.success must be boolean.");
    }
    return errors.length === 0
      ? { ok: true, value: input as unknown as BridgeResponseEnvelope, errors: [] }
      : { ok: false, errors };
  }

  if (kind === "event") {
    if (input.type !== "event") {
      errors.push("event.type must be 'event'.");
    }
    if (!hasString(input, "topic")) {
      errors.push("event.topic must be string.");
    }
    return errors.length === 0
      ? { ok: true, value: input as unknown as BridgeEventEnvelope, errors: [] }
      : { ok: false, errors };
  }

  errors.push("kind must be one of request|response|event.");
  return { ok: false, errors };
}

export function assertBridgeMessage(input: unknown): asserts input is BridgeMessage {
  const result = validateBridgeMessage(input);
  if (!result.ok) {
    throw new Error(`Invalid bridge message: ${result.errors.join(" ")}`);
  }
}

export function validateMethodDescriptors(input: unknown): ValidationResult<MethodDescriptor[]> {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ["methods must be an array."] };
  }
  const invalidIndex = input.findIndex((item) => !isMethodDescriptor(item));
  if (invalidIndex >= 0) {
    return { ok: false, errors: [`Invalid method descriptor at index ${invalidIndex}.`] };
  }
  return { ok: true, value: input, errors: [] };
}
