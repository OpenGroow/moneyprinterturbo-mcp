import { timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { Project } from "../projects.js";

// Inbound bearer-key auth: one MCP_API_KEY_<NAME> per brand (see
// projects.ts/config.ts) -- the key itself identifies which Project a
// request is for, so handlers downstream (e.g. /publish) can read it via
// c.get("project") instead of being told the brand some other way.
export function projectApiKeyMiddleware(projectsByKey: Record<string, Project>) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const provided = header.slice("Bearer ".length);

    // Linear scan with a constant-time compare per entry: the key space is
    // a handful of brands (code-level registry), not a DB of users, so
    // there's no lookup-time side channel worth avoiding here.
    const match = Object.entries(projectsByKey).find(([key]) => constantTimeEqual(provided, key));
    if (!match) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("project", match[1]);
    await next();
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on mismatched lengths -- pad the shorter one so
  // comparison time doesn't leak the expected key's length either.
  if (bufA.length !== bufB.length) {
    const padded = Buffer.alloc(bufA.length);
    timingSafeEqual(bufA, padded);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
