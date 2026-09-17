import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { apiKeyMiddleware } from "../middleware/api-key.js";

function appWithProtectedRoute(expectedKey: string) {
  const app = new Hono();
  app.get("/protected", apiKeyMiddleware(expectedKey), (c) => c.json({ ok: true }));
  return app;
}

describe("apiKeyMiddleware", () => {
  it("rejects a request with no Authorization header", async () => {
    const app = appWithProtectedRoute("secret");

    const res = await app.request("/protected");

    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong bearer key", async () => {
    const app = appWithProtectedRoute("secret");

    const res = await app.request("/protected", { headers: { Authorization: "Bearer wrong" } });

    expect(res.status).toBe(401);
  });

  it("allows a request with the correct bearer key", async () => {
    const app = appWithProtectedRoute("secret");

    const res = await app.request("/protected", { headers: { Authorization: "Bearer secret" } });

    expect(res.status).toBe(200);
  });
});
