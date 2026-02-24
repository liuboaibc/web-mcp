import type { JsonValue } from "@web-native-mcp/protocol";
import type { ExposeMethodMap } from "@web-native-mcp/web-bridge-sdk";

type MethodBinder<TTarget> =
  | keyof TTarget
  | ((target: TTarget, args: JsonValue) => Promise<JsonValue> | JsonValue);

export interface ReactAdapterConfig<TTarget extends object> {
  namespace: string;
  getTarget: () => TTarget;
  methods: Record<string, MethodBinder<TTarget>>;
  descriptions?: Record<string, string>;
}

export function createReactAdapter<TTarget extends object>(
  config: ReactAdapterConfig<TTarget>
): ExposeMethodMap {
  const exposed: ExposeMethodMap = {};

  for (const [name, binder] of Object.entries(config.methods)) {
    const fqMethod = `${config.namespace}.${name}`;
    exposed[fqMethod] = {
      description: config.descriptions?.[name] ?? `Invoke ${fqMethod}`,
      namespace: config.namespace,
      async handler(args: JsonValue) {
        const target = config.getTarget();
        if (typeof binder === "function") {
          return safeJson(await binder(target, args));
        }

        const candidate = (target as Record<string, unknown>)[binder as string];
        if (typeof candidate !== "function") {
          throw new Error(`Target property is not callable: ${String(binder)}`);
        }

        const value = Array.isArray(args)
          ? (candidate as (...items: unknown[]) => unknown)(...args)
          : (candidate as (input: unknown) => unknown)(args);
        return safeJson(await Promise.resolve(value));
      }
    };
  }

  return exposed;
}

function safeJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
