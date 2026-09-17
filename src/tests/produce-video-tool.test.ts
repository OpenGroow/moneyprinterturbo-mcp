import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProduceVideoTools } from "../mcp/tools/produce-video.js";
import type { MptClient } from "../mpt/client.js";
import { MptClientError } from "../mpt/client.js";
import { fakeMptClient } from "./helpers/fake-mpt-client.js";

async function connect(mptClient: MptClient) {
  const server = new McpServer({ name: "moneyprinterturbo-mcp", version: "1.0.0" });
  registerProduceVideoTools(server, { mptClient });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0" });
  await client.connect(clientTransport);
  return client;
}

function parse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

describe("produce_video", () => {
  it("returns runId=taskId and status started as soon as MPT accepts the job", async () => {
    const client = await connect(fakeMptClient({ createVideo: async () => ({ taskId: "task-42" }) }));

    const result = await client.callTool({ name: "produce_video", arguments: { video_subject: "cats in space" } });

    expect(parse(result as never)).toEqual({ runId: "task-42", status: "started" });
  });

  it("passes video_subject and other fields through to MptClient.createVideo untouched", async () => {
    let received: Record<string, unknown> | undefined;
    const client = await connect(
      fakeMptClient({
        createVideo: async (params) => {
          received = params;
          return { taskId: "task-1" };
        },
      }),
    );

    await client.callTool({
      name: "produce_video",
      arguments: { video_subject: "cats", voice_name: "en-US-JennyNeural", video_aspect: "9:16" },
    });

    expect(received).toMatchObject({ video_subject: "cats", voice_name: "en-US-JennyNeural", video_aspect: "9:16" });
  });

  it("never accepts a caller-supplied video_count (the lever does not exist at the tool boundary)", async () => {
    let received: Record<string, unknown> | undefined;
    const client = await connect(
      fakeMptClient({
        createVideo: async (params) => {
          received = params;
          return { taskId: "task-1" };
        },
      }),
    );

    await client.callTool({
      name: "produce_video",
      arguments: { video_subject: "cats", video_count: 5 },
    });

    // video_count isn't declared in produce_video's inputSchema, so the MCP
    // SDK's validation strips it before the handler ever sees it -- it must
    // never reach MptClient.createVideo as a caller-controlled value.
    expect(received).not.toHaveProperty("video_count");
  });

  it("translates an MptClientError into an errorContent result instead of throwing", async () => {
    const client = await connect(
      fakeMptClient({
        createVideo: async () => {
          throw new MptClientError(429, "queue is full");
        },
      }),
    );

    const result = await client.callTool({ name: "produce_video", arguments: { video_subject: "cats" } });

    expect(result.isError).toBe(true);
    expect(parse(result as never)).toMatchObject({ errorCategory: "rate_limit", message: "queue is full" });
  });
});

describe("get_run_status", () => {
  it.each([
    ["completed", "completed"],
    ["failed", "failed"],
    ["running", "running"],
  ] as const)("passes through MptClient's %s status as %s", async (mptStatus, expected) => {
    const client = await connect(
      fakeMptClient({
        getTask: async (taskId) => ({ taskId, status: mptStatus, videos: [] }),
      }),
    );

    const result = await client.callTool({ name: "get_run_status", arguments: { runId: "11111111-1111-4111-8111-111111111111" } });

    expect(parse(result as never)).toMatchObject({ status: expected });
  });

  it("returns runId verbatim as MPT's own task_id -- there is no separate project_id", async () => {
    const client = await connect(
      fakeMptClient({
        getTask: async (taskId) => ({ taskId, status: "running", videos: [] }),
      }),
    );

    const result = await client.callTool({ name: "get_run_status", arguments: { runId: "11111111-1111-4111-8111-111111111111" } });

    expect(parse(result as never)).toMatchObject({ runId: "11111111-1111-4111-8111-111111111111" });
  });

  it("returns a not_found error when MptClient.getTask resolves null", async () => {
    const client = await connect(fakeMptClient({ getTask: async () => null }));

    const result = await client.callTool({ name: "get_run_status", arguments: { runId: "11111111-1111-4111-8111-111111111111" } });

    expect(result.isError).toBe(true);
    expect(parse(result as never)).toMatchObject({ errorCategory: "not_found" });
  });
});
