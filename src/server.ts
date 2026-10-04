import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { projectApiKeyMiddleware } from "./middleware/api-key.js";
import { hostAllowlistMiddleware } from "./middleware/host-allowlist.js";
import { registerProduceVideoTools } from "./mcp/tools/produce-video.js";
import { registerVideoRoutes } from "./routes/videos.js";
import { registerPublishRoutes } from "./routes/publish.js";
import { MptClient } from "./mpt/client.js";
import { logger } from "./logger.js";
import type { Project } from "./projects.js";

// No env/config singleton is read in this module: every value buildApp
// needs is a required argument, so tests construct a fully-isolated app
// without touching process.env or a DB (this server has neither) -- see
// index.ts for the one real caller that wires env.ts's values in.
export interface BuildAppDeps {
  projectsByKey: Record<string, Project>;
  mptBaseUrl: string;
  mptApiKey: string;
  postizApiUrl: string;
  postizUploadUrl: string;
  postizToken: string;
  postizGroup?: string;
  // Injected by tests; production always drives the real MPT instance.
  mptClient?: MptClient;
}

export function buildApp(deps: BuildAppDeps): Hono {
  const mptClient = deps.mptClient ?? new MptClient({ baseUrl: deps.mptBaseUrl, apiKey: deps.mptApiKey });

  const app = new Hono();

  app.onError((err, c) => {
    logger.error({ err, method: c.req.method, path: c.req.path }, "unhandled request error");
    return c.json({ error: "internal_error" }, 500);
  });

  // Public, unauthenticated: a <video src> tag can't send an Authorization
  // header. Guarded only by runId's unguessability (CONTEXT.md).
  registerVideoRoutes(app, { mptClient, mptBaseUrl: deps.mptBaseUrl, mptApiKey: deps.mptApiKey });

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Same per-project key space for /publish and /mcp -- see projects.ts:
  // the key a request authenticates with IS the brand it's acting for.
  app.use("/publish", projectApiKeyMiddleware(deps.projectsByKey));
  registerPublishRoutes(app, {
    mptClient,
    postizApiUrl: deps.postizApiUrl,
    postizUploadUrl: deps.postizUploadUrl,
    postizToken: deps.postizToken,
    postizGroup: deps.postizGroup,
  });

  app.use("/mcp", hostAllowlistMiddleware());
  app.use("/mcp", projectApiKeyMiddleware(deps.projectsByKey));
  app.post("/mcp", async (c) => {
    const mcpServer = new McpServer({ name: "moneyprinterturbo-mcp", version: "1.0.0" });
    registerProduceVideoTools(mcpServer, { mptClient });

    // Megaclaw's generic MCP client makes a single stateless POST per tool
    // call -- no prior `initialize` handshake, no Mcp-Session-Id -- so a
    // fresh McpServer+transport per request (no sessionIdGenerator) is
    // required, not just sufficient (see CONTEXT.md).
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);

    return transport.handleRequest(c.req.raw);
  });

  return app;
}
