import { createMiddleware } from "hono/factory";

// DNS-rebinding protection in front of /mcp. The MCP SDK's
// WebStandardStreamableHTTPServerTransport exposes allowedHosts/
// enableDnsRebindingProtection options directly, but they're marked
// deprecated in favor of external middleware -- this is that middleware,
// matching openmontage-mcp's TransportSecuritySettings allowlist
// (127.0.0.1/localhost/::1 plus host.docker.internal, since Megaclaw calls
// this server as http://host.docker.internal:<port>/mcp from inside its
// OpenClaw docker container).
const ALLOWED_HOST_PATTERNS = [
  /^127\.0\.0\.1(:\d+)?$/,
  /^localhost(:\d+)?$/,
  /^\[::1\](:\d+)?$/,
  /^host\.docker\.internal(:\d+)?$/,
];

export function hostAllowlistMiddleware() {
  return createMiddleware(async (c, next) => {
    const host = c.req.header("Host") ?? c.req.header("host") ?? "";
    if (!ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
      return c.json({ error: "Invalid Host header" }, 421);
    }
    await next();
  });
}
