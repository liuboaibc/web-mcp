import { type BridgeGateway } from "../gateway/bridgeGateway.js";
import { type ToolDefinition } from "./types.js";

interface ListPageMethodsInput {
  sessionId?: string;
  namespace?: string;
}

export function buildListPageMethodsTool(gateway: BridgeGateway): ToolDefinition<ListPageMethodsInput> {
  return {
    name: "listPageMethods",
    description:
      "List allowlisted methods exposed by a connected webpage. Use this before invoking methods.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Optional target browser session id." },
        namespace: { type: "string", description: "Optional namespace filter." }
      },
      additionalProperties: false
    },
    async execute(input) {
      try {
        const methods = await gateway.listMethods(input.sessionId, input.namespace);
        return {
          content: [{ type: "text", text: JSON.stringify(methods, null, 2) }],
          structuredContent: methods
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: `listPageMethods failed: ${String(error)}` }]
        };
      }
    }
  };
}
