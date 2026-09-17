// Shared MCP tool-result envelope, matched to demo-video-mcp's shape
// (src/mcp/tools/result.ts) so both TS siblings return the same
// content/isError structure.

export type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

export function jsonContent(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

export function errorContent(category: string, message: string, details?: Record<string, unknown>): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ isError: true, errorCategory: category, message, ...(details ? { details } : {}) }),
      },
    ],
  };
}
