import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { apiKeyMiddleware } from "../middleware/api-key.js";

function appWithKey(key: string) {
  const app = new Hono();
  app.get("/protected", apiKeyMiddleware(key), (c) => c.json({ ok: true }));
  return app;
}

describe("apiKeyMiddleware", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await appWithKey("secret").request("/protected");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong key, including one of a different length", async () => {
    const app = appWithKey("secret");
    for (const bad of ["wrong", "secre", "secret-longer"]) {
      const res = await app.request("/protected", { headers: { Authorization: `Bearer ${bad}` } });
      expect(res.status).toBe(401);
    }
  });

  it("allows the right key", async () => {
    const res = await appWithKey("secret").request("/protected", { headers: { Authorization: "Bearer secret" } });
    expect(res.status).toBe(200);
  });
});
