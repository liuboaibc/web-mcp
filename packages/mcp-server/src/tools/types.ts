export interface ToolExecutionResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ToolDefinition<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: TInput) => Promise<ToolExecutionResult>;
}
