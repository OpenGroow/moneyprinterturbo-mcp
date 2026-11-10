import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { capVideoTerms, registerProduceVideoTools } from "../mcp/tools/produce-video.js";
import { fakeMptClient } from "./helpers/fake-mpt-client.js";
import { loadEnv } from "../config.js";

describe("capVideoTerms", () => {
  it("keeps only the first N terms of an array", () => {
    expect(capVideoTerms(["a", "b", "c"], 1)).toEqual(["a"]);
  });
  it("splits a comma-separated string before capping", () => {
    expect(capVideoTerms("a, b, c", 2)).toEqual(["a", "b"]);
  });
  it("is a no-op when the cap exceeds the list length", () => {
    expect(capVideoTerms(["a", "b"], 5)).toEqual(["a", "b"]);
  });
  it("drops empty entries of a comma-separated string", () => {
    expect(capVideoTerms("a,, b ,", 5)).toEqual(["a", "b"]);
    expect(capVideoTerms("", 1)).toEqual([]);
  });
  it("leaves terms untouched without a cap or without terms", () => {
    expect(capVideoTerms(["a", "b"], undefined)).toEqual(["a", "b"]);
    expect(capVideoTerms(undefined, 1)).toBeUndefined();
  });
});

async function callProduce(maxClips: number | undefined, args: Record<string, unknown>) {
  const sent: Array<Record<string, unknown>> = [];
  const server = new McpServer({ name: "t", version: "1.0.0" });
  registerProduceVideoTools(server, {
    mptClient: fakeMptClient({
      createVideo: async (p: never) => {
        sent.push(p);
        return { taskId: "task-1" };
      },
    }),
    maxClips,
  });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "t", version: "1.0" });
  await client.connect(ct);
  await client.callTool({ name: "produce_video", arguments: args });
  return sent[0]!;
}

describe("produce_video with maxClips", () => {
  it("caps video_terms sent to MPT", async () => {
    const sent = await callProduce(1, { video_subject: "x", video_terms: ["a", "b"] });
    expect(sent.video_terms).toEqual(["a"]);
  });
  it("does not add video_terms when absent", async () => {
    const sent = await callProduce(1, { video_subject: "x" });
    expect("video_terms" in sent).toBe(false);
  });
  it("leaves terms alone without a cap", async () => {
    const sent = await callProduce(undefined, { video_subject: "x", video_terms: ["a", "b"] });
    expect(sent.video_terms).toEqual(["a", "b"]);
  });
});

describe("MPT_MAX_CLIPS env parsing", () => {
  const base: NodeJS.ProcessEnv = {
    MPT_BASE_URL: "http://mpt",
    MCP_API_KEY_DEFAULT: "key-default",
  };
  it("parses a positive integer", () => {
    expect(loadEnv({ ...base, MPT_MAX_CLIPS: "2" }).maxClips).toBe(2);
  });
  it("treats empty and unset as undefined", () => {
    expect(loadEnv({ ...base, MPT_MAX_CLIPS: "" }).maxClips).toBeUndefined();
    expect(loadEnv(base).maxClips).toBeUndefined();
  });
  it("rejects 0 and non-numeric values", () => {
    expect(() => loadEnv({ ...base, MPT_MAX_CLIPS: "0" })).toThrow();
    expect(() => loadEnv({ ...base, MPT_MAX_CLIPS: "abc" })).toThrow();
  });
});

describe("produce_video defaults", () => {
  async function run(deps: { defaultVideoSource?: string; defaultVoiceName?: string }, args: Record<string, unknown>) {
    const sent: Array<Record<string, unknown>> = [];
    const server = new McpServer({ name: "t", version: "1.0.0" });
    registerProduceVideoTools(server, {
      mptClient: fakeMptClient({
        createVideo: async (p: never) => {
          sent.push(p);
          return { taskId: "task-1" };
        },
      }),
      ...deps,
    });
    const client = new Client({ name: "c", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    await client.callTool({ name: "produce_video", arguments: { video_subject: "s", ...args } });
    return sent[0]!;
  }

  it("fills video_source and voice_name when the caller omits them", async () => {
    const sent = await run({ defaultVideoSource: "comfyui", defaultVoiceName: "v" }, {});
    expect(sent.video_source).toBe("comfyui");
    expect(sent.voice_name).toBe("v");
  });
  it("never overrides what the caller sent", async () => {
    const sent = await run({ defaultVideoSource: "comfyui" }, { video_source: "pexels" });
    expect(sent.video_source).toBe("pexels");
  });
  it("sends nothing extra without defaults", async () => {
    const sent = await run({}, {});
    expect(sent.video_source).toBeUndefined();
    expect(sent.voice_name).toBeUndefined();
  });
});
