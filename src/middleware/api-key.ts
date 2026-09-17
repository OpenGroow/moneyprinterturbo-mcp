import { timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";

// Inbound bearer-key auth checked against a single env var (MCP_API_KEY) --
// this repo has no DB, so there is no per-Project key to resolve, unlike
// demo-video-mcp's DB-backed apiKeyMiddleware. Matches openmontage-mcp's
// check_bearer (src/openmontage_mcp/auth.py): constant-time compare, same
// Bearer shape.
export function apiKeyMiddleware(expectedKey: string) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const provided = header.slice("Bearer ".length);
    if (!constantTimeEqual(provided, expectedKey)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
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
