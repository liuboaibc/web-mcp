import type { JsonSchema, JsonValue } from "@web-native-mcp/protocol";
import {
  WebBridgeRuntime,
  type Dispose,
  type ExposedMethod,
  type MethodRegistration,
  type WebBridgeRuntimeOptions
} from "./runtime.js";

export interface ExposeMethodDefinition {
  handler: ExposedMethod;
  description?: string;
  namespace?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  tags?: string[];
  requiresAuth?: boolean;
  validateArgs?: (args: JsonValue) => void;
}

export type ExposeMethodMap = Record<string, ExposeMethodDefinition | ExposedMethod>;

interface MethodNameOptions {
  namespace?: string;
}

export interface WebMcpBridge {
  runtime: WebBridgeRuntime;
  start: () => void;
  stop: () => void;
  exposeMethods: (methods: ExposeMethodMap, defaults?: MethodNameOptions) => Dispose;
  unexposeMethod: (methodName: string, defaults?: MethodNameOptions) => boolean;
  unexposeMethods: (methodNames: string[], defaults?: MethodNameOptions) => number;
  clearExposedMethods: () => void;
  emitEvent: (topic: string, payload: JsonValue) => void;
}

export function createWebMcpBridge(options: WebBridgeRuntimeOptions): WebMcpBridge {
  const runtime = new WebBridgeRuntime(options);

  return {
    runtime,
    start: () => runtime.start(),
    stop: () => runtime.stop(),
    exposeMethods: (methods, defaults) => {
      const normalized: Record<string, MethodRegistration> = {};
      for (const [name, methodValue] of Object.entries(methods)) {
        const definition =
          typeof methodValue === "function" ? { handler: methodValue } : methodValue;
        const methodName = toQualifiedMethodName(name, definition.namespace ?? defaults?.namespace);
        normalized[methodName] = {
          handler: definition.handler,
          validateArgs: definition.validateArgs,
          descriptor: {
            description: definition.description,
            namespace: definition.namespace ?? defaults?.namespace,
            inputSchema: definition.inputSchema,
            outputSchema: definition.outputSchema,
            tags: definition.tags,
            requiresAuth: definition.requiresAuth
          }
        };
      }
      return runtime.exposeMethods(normalized);
    },
    unexposeMethod: (methodName, defaults) =>
      runtime.unregisterMethod(toQualifiedMethodName(methodName, defaults?.namespace)),
    unexposeMethods: (methodNames, defaults) =>
      runtime.unregisterMethods(
        methodNames.map((methodName) => toQualifiedMethodName(methodName, defaults?.namespace))
      ),
    clearExposedMethods: () => runtime.clearMethods(),
    emitEvent: (topic, payload) => runtime.emitEvent(topic, payload)
  };
}

function toQualifiedMethodName(name: string, namespace?: string): string {
  if (!namespace || name.includes(".")) {
    return name;
  }
  return `${namespace}.${name}`;
}
