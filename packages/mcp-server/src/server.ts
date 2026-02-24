import { BridgeGateway, type BridgeGatewayOptions } from "./gateway/bridgeGateway.js";
import { buildInvokePageMethodTool } from "./tools/invokePageMethod.js";
import { buildListPageMethodsTool } from "./tools/listPageMethods.js";
import { type ToolDefinition, type ToolExecutionResult } from "./tools/types.js";

interface McpToolHost {
  tool?: (
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: (input: Record<string, unknown>) => Promise<ToolExecutionResult>
  ) => void | Promise<void>;
  registerTool?: (
    name: string,
    definition: {
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
    },
    handler: (input: Record<string, unknown>) => Promise<ToolExecutionResult>
  ) => void | Promise<void>;
}

export interface WebNativeMcpServerOptions extends BridgeGatewayOptions {
  serverName?: string;
  serverVersion?: string;
}

export class WebNativeMcpServer {
  readonly gateway: BridgeGateway;
  readonly serverName: string;
  readonly serverVersion: string;
  private readonly tools: ToolDefinition<any>[];

  constructor(options: WebNativeMcpServerOptions) {
    this.serverName = options.serverName ?? "web-native-mcp";
    this.serverVersion = options.serverVersion ?? "0.1.0";
    this.gateway = new BridgeGateway(options);
    this.tools = [buildListPageMethodsTool(this.gateway), buildInvokePageMethodTool(this.gateway)];
  }

  async startGateway(): Promise<void> {
    await this.gateway.start();
  }

  async stopGateway(): Promise<void> {
    await this.gateway.stop();
  }

  getTools(): ToolDefinition[] {
    return [...this.tools];
  }

  async registerTools(host: McpToolHost): Promise<void> {
    for (const tool of this.tools) {
      const execute = tool.execute as (input: Record<string, unknown>) => Promise<ToolExecutionResult>;
      if (host.tool) {
        await host.tool(tool.name, tool.description, tool.inputSchema, execute);
        continue;
      }
      if (host.registerTool) {
        await host.registerTool(
          tool.name,
          {
            title: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          },
          execute
        );
        continue;
      }
      throw new Error("Provided MCP host does not expose tool registration methods.");
    }
  }
}

interface DynamicMcpServer {
  connect: (transport: unknown) => Promise<void>;
  tool: McpToolHost["tool"];
}

type DynamicImporter = (specifier: string) => Promise<unknown>;

function createDynamicImporter(): DynamicImporter {
  return new Function("specifier", "return import(specifier);") as DynamicImporter;
}

export async function startStdioMcpServer(options: WebNativeMcpServerOptions): Promise<void> {
  const importer = createDynamicImporter();
  const mcpModule = (await importer("@modelcontextprotocol/sdk/server/mcp.js")) as {
    McpServer: new (info: { name: string; version: string }) => DynamicMcpServer;
  };
  const transportModule = (await importer("@modelcontextprotocol/sdk/server/stdio.js")) as {
    StdioServerTransport: new () => unknown;
  };

  const frameworkServer = new WebNativeMcpServer(options);
  await frameworkServer.startGateway();

  const mcpServer = new mcpModule.McpServer({
    name: frameworkServer.serverName,
    version: frameworkServer.serverVersion
  });

  await frameworkServer.registerTools(mcpServer);
  const transport = new transportModule.StdioServerTransport();
  await mcpServer.connect(transport);
}

export async function startFromEnvironment(): Promise<void> {
  const port = Number(process.env.WEB_MCP_BRIDGE_PORT ?? 8787);
  const authToken = process.env.WEB_MCP_BRIDGE_TOKEN;
  const allowQueryToken = process.env.WEB_MCP_ALLOW_QUERY_TOKEN !== "false";
  const allowedOrigins = process.env.WEB_MCP_ALLOWED_ORIGINS
    ? process.env.WEB_MCP_ALLOWED_ORIGINS.split(",").map((item) => item.trim())
    : [];
  const allowlist = process.env.WEB_MCP_METHOD_ALLOWLIST
    ? process.env.WEB_MCP_METHOD_ALLOWLIST.split(",").map((item) => item.trim())
    : [];
  const retryMutatingMethods = process.env.WEB_MCP_RETRY_MUTATING_METHODS === "true";
  const requireExplicitSessionWhenMultiple =
    process.env.WEB_MCP_REQUIRE_EXPLICIT_SESSION !== "false";
  const maxInvocationsPerMinute = Number(process.env.WEB_MCP_MAX_INVOCATIONS_PER_MINUTE ?? 60);

  await startStdioMcpServer({
    port,
    authToken,
    allowQueryToken,
    allowedOrigins,
    methodAllowlist: allowlist,
    retryMutatingMethods,
    requireExplicitSessionWhenMultiple,
    maxInvocationsPerMinute
  });
}
