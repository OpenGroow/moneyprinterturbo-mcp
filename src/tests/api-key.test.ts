import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { projectApiKeyMiddleware } from "../middleware/api-key.js";
import type { Project } from "../projects.js";

const LOVEYOUMAKE: Project = { name: "loveyoumake", postizChannelIds: { instagram: "ig-1" } };
const REZON: Project = { name: "rezon", postizChannelIds: { instagram: "ig-2" } };

function appWithProjects(projectsByKey: Record<string, Project>) {
  const app = new Hono();
  app.get("/protected", projectApiKeyMiddleware(projectsByKey), (c) => {
    const project = (c as unknown as { get(key: "project"): Project }).get("project");
    return c.json({ project: project.name });
  });
  return app;
}

describe("projectApiKeyMiddleware", () => {
  it("rejects a request with no Authorization header", async () => {
    const app = appWithProjects({ secret: LOVEYOUMAKE });

    const res = await app.request("/protected");

    expect(res.status).toBe(401);
  });

  it("rejects a request with a key that matches no project", async () => {
    const app = appWithProjects({ secret: LOVEYOUMAKE });

    const res = await app.request("/protected", { headers: { Authorization: "Bearer wrong" } });

    expect(res.status).toBe(401);
  });

  it("allows a request whose key matches a project, and exposes that project downstream", async () => {
    const app = appWithProjects({ secret: LOVEYOUMAKE });

    const res = await app.request("/protected", { headers: { Authorization: "Bearer secret" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ project: "loveyoumake" });
  });

  it("resolves the matching project among several, not just the first", async () => {
    const app = appWithProjects({ "secret-loveyoumake": LOVEYOUMAKE, "secret-rezon": REZON });

    const res = await app.request("/protected", { headers: { Authorization: "Bearer secret-rezon" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ project: "rezon" });
  });
});
