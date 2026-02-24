import { type JsonValue } from "@web-native-mcp/protocol";
import { type BridgeGateway } from "../gateway/bridgeGateway.js";
import { type ToolDefinition } from "./types.js";

interface InvokePageMethodInput {
  sessionId?: string;
  method: string;
  args?: JsonValue;
  timeoutMs?: number;
}

export function buildInvokePageMethodTool(gateway: BridgeGateway): ToolDefinition<InvokePageMethodInput> {
  return {
    name: "invokePageMethod",
    description:
      "Invoke a specific in-page business method directly. This bypasses UI clicks and drives app APIs.",
    inputSchema: {
      type: "object",
      required: ["method"],
      properties: {
        sessionId: { type: "string", description: "Optional target browser session id." },
        method: { type: "string", description: "Fully qualified method name." },
        args: {
          description: "JSON-serializable arguments passed to the method."
        },
        timeoutMs: { type: "number", description: "Optional request timeout in milliseconds." }
      },
      additionalProperties: false
    },
    async execute(input) {
      try {
        const result = await gateway.invokeMethod(
          input.method,
          input.args,
          input.sessionId,
          input.timeoutMs
        );
        return {
          content: [{ type: "text", text: JSON.stringify({ method: input.method, result }, null, 2) }],
          structuredContent: { method: input.method, result }
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `invokePageMethod failed: ${String(error)}` }]
        };
      }
    }
  };
}
