import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProduceVideoTools } from "../mcp/tools/produce-video.js";
import type { MptClient } from "../mpt/client.js";
import { MptClientError } from "../mpt/client.js";
import { fakeMptClient } from "./helpers/fake-mpt-client.js";

async function connect(mptClient: MptClient, dryRun = false, publicBaseUrl = "https://mcp.example.com") {
  const server = new McpServer({ name: "moneyprinterturbo-mcp", version: "1.0.0" });
  registerProduceVideoTools(server, { mptClient, dryRun, publicBaseUrl });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0" });
  await client.connect(clientTransport);
  return client;
}

function parse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

describe("produce_video dry-run", () => {
  it("answers without calling MPT", async () => {
    const client = await connect(
      fakeMptClient({
        createVideo: async () => {
          throw new Error("MPT must not be called");
        },
      }),
      true,
    );

    const result = await client.callTool({ name: "produce_video", arguments: { video_subject: "cats" } });
    const body = parse(result as never);

    expect(body).toMatchObject({ status: "started", dryRun: true });
    expect(body.runId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

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

describe("get_video", () => {
  const RUN = "11111111-1111-4111-8111-111111111111";
  const call = (client: Awaited<ReturnType<typeof connect>>) =>
    client.callTool({ name: "get_video", arguments: { runId: RUN } });

  it("returns the public URL of the final video of a completed run", async () => {
    const client = await connect(
      fakeMptClient({ getTask: async (taskId) => ({ taskId, status: "completed", videos: ["http://mpt/tasks/x/final-1.mp4"] }) }),
      false,
      "https://mcp.example.com/",
    );

    expect(parse((await call(client)) as never)).toEqual({
      runId: RUN,
      videoUrl: `https://mcp.example.com/videos/${RUN}/final`,
    });
  });

  it.each(["pending", "running", "failed"] as const)("is not_ready while the run is %s", async (status) => {
    const client = await connect(
      fakeMptClient({ getTask: async (taskId) => ({ taskId, status, videos: [] }) }),
      false,
      "https://mcp.example.com",
    );

    const result = await call(client);

    expect(result.isError).toBe(true);
    expect(parse(result as never)).toMatchObject({ errorCategory: "not_ready" });
  });

  it("is not_ready when the run completed without a video file", async () => {
    const client = await connect(
      fakeMptClient({ getTask: async (taskId) => ({ taskId, status: "completed", videos: [] }) }),
      false,
      "https://mcp.example.com",
    );

    expect(parse((await call(client)) as never)).toMatchObject({ errorCategory: "not_ready" });
  });

  it("returns not_found for an unknown run", async () => {
    const client = await connect(fakeMptClient({ getTask: async () => null }), false, "https://mcp.example.com");

    expect(parse((await call(client)) as never)).toMatchObject({ errorCategory: "not_found" });
  });

  it("answers in dry-run without calling MPT", async () => {
    const client = await connect(
      fakeMptClient({
        getTask: async () => {
          throw new Error("MPT must not be called");
        },
      }),
      true,
      "https://mcp.example.com",
    );

    expect(parse((await call(client)) as never)).toMatchObject({
      videoUrl: `https://mcp.example.com/videos/${RUN}/final`,
      dryRun: true,
    });
  });
});
