import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { registerVideoRoutes } from "../routes/videos.js";
import type { MptClient } from "../mpt/client.js";
import { fakeMptClient } from "./helpers/fake-mpt-client.js";

function buildApp(mptClient: MptClient, fetchImpl: typeof fetch) {
  const app = new Hono();
  registerVideoRoutes(app, { mptClient, mptBaseUrl: "http://mpt.local", mptApiKey: "mpt-secret", fetchImpl });
  return app;
}

describe("GET /videos/:runId/final", () => {
  it("requires no Authorization header at all", async () => {
    const fetchImpl = vi.fn(async () => new Response("video-bytes", { status: 200 })) as unknown as typeof fetch;
    const app = buildApp(fakeMptClient({ resolveFinalFilePath: async () => "task-1/final-1.mp4" }), fetchImpl);

    const res = await app.request("/videos/task-1/final");

    expect(res.status).toBe(200);
  });

  it("returns 404 when the run has no final video yet", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const app = buildApp(fakeMptClient({ resolveFinalFilePath: async () => null }), fetchImpl);

    const res = await app.request("/videos/task-1/final");

    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("proxies server-to-server to MPT's stream endpoint with the server's own MPT_API_KEY", async () => {
    const fetchImpl = vi.fn(async () => new Response("video-bytes", { status: 200 })) as unknown as typeof fetch;
    const app = buildApp(fakeMptClient({ resolveFinalFilePath: async () => "task-1/final-1.mp4" }), fetchImpl);

    await app.request("/videos/task-1/final");

    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://mpt.local/api/v1/stream/task-1/final-1.mp4");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("mpt-secret");
  });

  it("never leaks the MPT_API_KEY into the response headers sent to the caller", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("video-bytes", { status: 200, headers: { "Content-Type": "video/mp4" } }),
    ) as unknown as typeof fetch;
    const app = buildApp(fakeMptClient({ resolveFinalFilePath: async () => "task-1/final-1.mp4" }), fetchImpl);

    const res = await app.request("/videos/task-1/final");

    expect(res.headers.get("x-api-key")).toBeNull();
    expect([...res.headers.keys()]).not.toContain("x-api-key");
  });

  it("forwards a Range request header upstream and passes back 206/Content-Range", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("partial-bytes", {
          status: 206,
          headers: { "Content-Range": "bytes 0-99/1000", "Accept-Ranges": "bytes" },
        }),
    ) as unknown as typeof fetch;
    const app = buildApp(fakeMptClient({ resolveFinalFilePath: async () => "task-1/final-1.mp4" }), fetchImpl);

    const res = await app.request("/videos/task-1/final", { headers: { Range: "bytes=0-99" } });

    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Range"]).toBe("bytes=0-99");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-99/1000");
  });
});
