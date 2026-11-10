import { describe, expect, it } from "vitest";
import { buildApp } from "../server.js";
import type { MptClient } from "../mpt/client.js";
import { fakeMptClient } from "./helpers/fake-mpt-client.js";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  // Megaclaw's real reachability host (see hostAllowlistMiddleware); a bare
  // Fetch Request built in-process (no real network layer) never gets an
  // implicit Host header the way a browser/undici client would, so it must
  // be supplied explicitly here for every test that isn't itself exercising
  // the allowlist.
  Host: "host.docker.internal:4600",
};

function initializeRequest(): RequestInit {
  return {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1.0" } },
    }),
  };
}

function callToolRequest(name: string, args: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  };
}

function testApp(mptClient: MptClient = fakeMptClient()) {
  return buildApp({
    apiKey: "mcp-secret",
    mptBaseUrl: "http://mpt.local",
    mptApiKey: "mpt-secret",
    mptClient,
  });
}

async function readJsonRpcResult(res: Response) {
  const text = await res.text();
  // Hono/the MCP transport may answer with plain JSON or an SSE stream
  // (`event: message\ndata: {...}\n\n`) depending on client Accept
  // negotiation -- Megaclaw's generic client must work with either (see
  // CONTEXT.md / prior research).
  const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
  const jsonLine = dataLine ? dataLine.slice("data:".length).trim() : text;
  return JSON.parse(jsonLine);
}

describe("POST /mcp", () => {
  it("returns 401 without the MCP bearer key", async () => {
    const res = await testApp().request("/mcp", initializeRequest());

    expect(res.status).toBe(401);
  });

  it("accepts a stateless single POST with a valid key, no prior initialize handshake required", async () => {
    const res = await testApp().request("/mcp", {
      ...callToolRequest("produce_video", { video_subject: "cats" }),
      headers: { ...MCP_HEADERS, Authorization: "Bearer mcp-secret" },
    });

    expect(res.status).not.toBe(401);
    expect(res.status).toBeLessThan(500);
  });

  it("rejects a Host header outside the allowlist with 421", async () => {
    const res = await testApp().request("/mcp", {
      ...initializeRequest(),
      headers: { ...MCP_HEADERS, Authorization: "Bearer mcp-secret", Host: "evil.example.com" },
    });

    expect(res.status).toBe(421);
  });

  it("round-trips produce_video -> get_run_status against the injected MptClient", async () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    const mptClient = fakeMptClient({
      createVideo: async () => ({ taskId }),
      getTask: async (id) => ({ taskId: id, status: "completed", videos: [`/tasks/${taskId}/final-1.mp4`] }),
    });
    const app = testApp(mptClient);
    const auth = { ...MCP_HEADERS, Authorization: "Bearer mcp-secret" };

    const produceRes = await app.request("/mcp", { ...callToolRequest("produce_video", { video_subject: "cats" }), headers: auth });
    const produceBody = await readJsonRpcResult(produceRes);
    const produceContent = JSON.parse(produceBody.result.content[0].text);
    expect(produceContent).toEqual({ runId: taskId, status: "started" });

    const statusRes = await app.request("/mcp", {
      ...callToolRequest("get_run_status", { runId: taskId }),
      headers: auth,
    });
    const statusBody = await readJsonRpcResult(statusRes);
    const statusContent = JSON.parse(statusBody.result.content[0].text);
    expect(statusContent).toMatchObject({ runId: taskId, status: "completed" });
  });
});

describe("GET /health", () => {
  it("is reachable with no Authorization header", async () => {
    const res = await testApp().request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
