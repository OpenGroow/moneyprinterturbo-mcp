import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { apiKeyMiddleware } from "../middleware/api-key.js";
import { registerPublishRoutes } from "../routes/publish.js";

function buildApp(fetchImpl: typeof fetch) {
  const app = new Hono();
  app.use("/publish", apiKeyMiddleware("mcp-secret"));
  registerPublishRoutes(app, {
    postizUrl: "http://postiz.local",
    postizApiKey: "postiz-secret",
    publicBaseUrl: "http://localhost:4600",
    fetchImpl,
  });
  return app;
}

const AUTH = { Authorization: "Bearer mcp-secret" };

describe("POST /publish", () => {
  it("requires the MCP bearer key, unlike /videos/:runId/final", async () => {
    const app = buildApp(vi.fn() as unknown as typeof fetch);

    const res = await app.request("/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", caption: "hi", platforms: ["tiktok"] }),
    });

    expect(res.status).toBe(401);
  });

  it("posts to Postiz with a video_url built from PUBLIC_BASE_URL and run_id", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: "post-1" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const app = buildApp(fetchImpl);

    const res = await app.request("/publish", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", caption: "look at this", platforms: ["tiktok", "youtube"] }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "post-1" });

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://postiz.local/api/posts");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer postiz-secret");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      video_url: "http://localhost:4600/videos/task-1/final",
      caption: "look at this",
      platforms: ["tiktok", "youtube"],
    });
  });

  it("returns 502 when Postiz responds with a non-2xx status", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: "bad channel" }), { status: 400 }),
    ) as unknown as typeof fetch;
    const app = buildApp(fetchImpl);

    const res = await app.request("/publish", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "task-1", caption: "", platforms: [] }),
    });

    expect(res.status).toBe(502);
  });
});
