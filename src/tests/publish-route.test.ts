import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { projectApiKeyMiddleware } from "../middleware/api-key.js";
import { registerPublishRoutes, type PublishDeps } from "../routes/publish.js";
import type { Project } from "../projects.js";
import { fakeMptClient } from "./helpers/fake-mpt-client.js";

const VIDEO = { buffer: Buffer.from("fake-mp4-bytes"), contentType: "video/mp4" };

const TEST_PROJECT: Project = {
  name: "testbrand",
  postizChannelIds: { instagram: "channel-ig", tiktok: "channel-tt" },
};

function buildApp(
  deps: Partial<PublishDeps> & { fetchImpl: typeof fetch },
  projectsByKey: Record<string, Project> = { "mcp-secret": TEST_PROJECT },
) {
  const app = new Hono();
  app.use("/publish", projectApiKeyMiddleware(projectsByKey));
  registerPublishRoutes(app, {
    mptClient: fakeMptClient({ fetchFinalVideoBuffer: async () => VIDEO }),
    postizApiUrl: "http://postiz.local/api/posts",
    postizUploadUrl: "http://postiz.local/upload",
    postizToken: "postiz-secret",
    ...deps,
  });
  return app;
}

const AUTH = { Authorization: "Bearer mcp-secret" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Routes every call by URL: uploadUrl -> media upload response, apiUrl -> schedule response.
function fetchRouter(uploadResult: unknown, scheduleResult: (url: string, body: unknown) => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "http://postiz.local/upload") {
      return jsonResponse(uploadResult);
    }
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    return jsonResponse(scheduleResult(url, body));
  }) as unknown as typeof fetch;
}

describe("POST /publish", () => {
  it("requires a valid project bearer key", async () => {
    const app = buildApp({ fetchImpl: vi.fn() as unknown as typeof fetch });

    const res = await app.request("/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", platforms: ["instagram"] }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects an unknown platform", async () => {
    const app = buildApp({ fetchImpl: vi.fn() as unknown as typeof fetch });

    const res = await app.request("/publish", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", platforms: ["youtube"] }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid platforms", invalid: ["youtube"] });
  });

  it("rejects a platform with no Postiz channel configured for this project", async () => {
    const projectsByKey = { "mcp-secret": { name: "testbrand", postizChannelIds: { instagram: "channel-ig" } } };
    const app = buildApp({ fetchImpl: vi.fn() as unknown as typeof fetch }, projectsByKey);

    const res = await app.request("/publish", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", platforms: ["instagram", "tiktok"] }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "No Postiz channel configured for testbrand on platform(s)",
      platforms: ["tiktok"],
    });
  });

  it("returns 404 when the run has no final video on MPT", async () => {
    const app = buildApp({
      mptClient: fakeMptClient({ fetchFinalVideoBuffer: async () => null }),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    const res = await app.request("/publish", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", platforms: ["instagram"] }),
    });

    expect(res.status).toBe(404);
  });

  it("uploads once then schedules one post per requested platform with the right channel and settings", async () => {
    const fetchImpl = fetchRouter({ id: "media-1", path: "/media-1.mp4" }, (url, body) => {
      const b = body as { posts: Array<{ integration: { id: string } }> };
      return { id: `post-for-${b.posts[0]!.integration.id}` };
    });
    const app = buildApp({ fetchImpl });

    const res = await app.request("/publish", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", caption: "look at this", platforms: ["instagram", "tiktok"] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ platform: string; ok: boolean; id?: string }> };
    expect(body.results).toEqual(
      expect.arrayContaining([
        { platform: "instagram", ok: true, id: "post-for-channel-ig" },
        { platform: "tiktok", ok: true, id: "post-for-channel-tt" },
      ]),
    );

    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const uploadCalls = calls.filter(([url]) => url === "http://postiz.local/upload");
    expect(uploadCalls).toHaveLength(1);
    expect((uploadCalls[0]![1]!.headers as Record<string, string>)["Authorization"]).toBe("postiz-secret");

    const scheduleCalls = calls.filter(([url]) => url === "http://postiz.local/api/posts");
    expect(scheduleCalls).toHaveLength(2);
    const payloads = scheduleCalls.map(([, init]) => JSON.parse(init.body as string));

    const instagramPayload = payloads.find((p) => p.posts[0].integration.id === "channel-ig");
    expect(instagramPayload.posts[0].settings).toEqual({ __type: "instagram", post_type: "post" });
    expect(instagramPayload.posts[0].value[0].content).toBe("look at this");
    expect(instagramPayload.posts[0].value[0].image).toEqual([{ id: "media-1", path: "/media-1.mp4" }]);

    const tiktokPayload = payloads.find((p) => p.posts[0].integration.id === "channel-tt");
    expect(tiktokPayload.posts[0].settings).toMatchObject({
      __type: "tiktok",
      privacy_level: "PUBLIC_TO_EVERYONE",
      content_posting_method: "UPLOAD",
    });
  });

  it("reports a failure on one platform without blocking the other", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "http://postiz.local/upload") {
        return jsonResponse({ id: "media-1", path: "/media-1.mp4" });
      }
      const body = JSON.parse(init!.body as string) as { posts: Array<{ integration: { id: string } }> };
      if (body.posts[0]!.integration.id === "channel-tt") {
        return jsonResponse({ message: "bad channel" }, 400);
      }
      return jsonResponse({ id: "post-ig" });
    }) as unknown as typeof fetch;
    const app = buildApp({ fetchImpl });

    const res = await app.request("/publish", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", platforms: ["instagram", "tiktok"] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<{ platform: string; ok: boolean; id?: string; error?: string }> };
    expect(body.results).toEqual(
      expect.arrayContaining([
        { platform: "instagram", ok: true, id: "post-ig" },
        { platform: "tiktok", ok: false, error: "Postiz schedule failed with status 400" },
      ]),
    );
  });
});
