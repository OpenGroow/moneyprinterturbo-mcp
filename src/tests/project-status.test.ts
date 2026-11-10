import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProduceVideoTools } from "../mcp/tools/produce-video.js";
import { MptClientError } from "../mpt/client.js";
import { loadEnv } from "../config.js";
import { fakeMptClient } from "./helpers/fake-mpt-client.js";

async function status(deps: Parameters<typeof registerProduceVideoTools>[1]) {
  const server = new McpServer({ name: "t", version: "1.0.0" });
  registerProduceVideoTools(server, deps);
  const client = new Client({ name: "c", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const res = (await client.callTool({ name: "get_project_status", arguments: {} })) as {
    content: Array<{ text: string }>;
  };
  return JSON.parse(res.content[0]!.text) as { configured: boolean; message?: string };
}

describe("get_project_status", () => {
  it("is configured when MoneyPrinterTurbo answers", async () => {
    const out = await status({ mptClient: fakeMptClient(), publicBaseUrl: "https://mcp.example.com" });
    expect(out).toEqual({ configured: true });
  });

  it("is not configured, with the reason, when MoneyPrinterTurbo is unreachable", async () => {
    const out = await status({
      mptClient: fakeMptClient({
        getTask: async () => {
          throw new MptClientError(502, "MoneyPrinterTurbo unreachable at http://mpt: ECONNREFUSED");
        },
      }),
      publicBaseUrl: "https://mcp.example.com",
    });
    expect(out.configured).toBe(false);
    expect(out.message).toContain("unreachable");
  });

  it("is configured in dry-run without calling MoneyPrinterTurbo", async () => {
    const out = await status({
      mptClient: fakeMptClient({
        getTask: async () => {
          throw new Error("must not be called");
        },
      }),
      dryRun: true,
      publicBaseUrl: "https://mcp.example.com",
    });
    expect(out.configured).toBe(true);
  });
});

describe("PUBLIC_BASE_URL env parsing", () => {
  const base: NodeJS.ProcessEnv = { MPT_BASE_URL: "http://mpt", MCP_API_KEY: "key" };
  it("defaults to this server on localhost, empty or unset", () => {
    expect(loadEnv(base).publicBaseUrl).toBe("http://localhost:4600");
    expect(loadEnv({ ...base, PORT: "5000", PUBLIC_BASE_URL: "" }).publicBaseUrl).toBe("http://localhost:5000");
  });
  it("keeps the configured origin", () => {
    expect(loadEnv({ ...base, PUBLIC_BASE_URL: "https://mcp.example.com" }).publicBaseUrl).toBe("https://mcp.example.com");
  });
});
