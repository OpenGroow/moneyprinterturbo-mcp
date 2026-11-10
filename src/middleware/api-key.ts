import { timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { logger } from "../logger.js";

// Inbound bearer-key auth for /mcp: a single shared key (MCP_API_KEY).
export function apiKeyMiddleware(expectedKey: string) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header("Authorization");
    // Never the key itself: only what tells a missing key from a wrong one.
    if (!header?.startsWith("Bearer ")) {
      logger.warn({ hasAuthorization: header !== undefined, path: c.req.path }, "unauthorized /mcp request: no Bearer key");
      return c.json({ error: "Unauthorized" }, 401);
    }
    const provided = header.slice("Bearer ".length);
    if (!constantTimeEqual(provided, expectedKey)) {
      logger.warn(
        { providedLength: provided.length, expectedLength: expectedKey.length, path: c.req.path },
        "unauthorized /mcp request: the Bearer key does not match MCP_API_KEY",
      );
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
