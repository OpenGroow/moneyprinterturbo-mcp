import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hostAllowlistMiddleware } from "../middleware/host-allowlist.js";

function app() {
  const a = new Hono();
  a.use("/mcp", hostAllowlistMiddleware());
  a.post("/mcp", (c) => c.json({ ok: true }));
  return a;
}

describe("hostAllowlistMiddleware", () => {
  it("allows Megaclaw's own reachability host (host.docker.internal:<port>) from inside the OpenClaw container", async () => {
    const res = await app().request("/mcp", { method: "POST", headers: { Host: "host.docker.internal:4600" } });

    expect(res.status).toBe(200);
  });

  it("allows localhost and 127.0.0.1 for local dev", async () => {
    const res1 = await app().request("/mcp", { method: "POST", headers: { Host: "localhost:4600" } });
    const res2 = await app().request("/mcp", { method: "POST", headers: { Host: "127.0.0.1:4600" } });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it("rejects an arbitrary Host header with 421 (DNS rebinding protection)", async () => {
    const res = await app().request("/mcp", { method: "POST", headers: { Host: "evil.example.com" } });

    expect(res.status).toBe(421);
  });
});
