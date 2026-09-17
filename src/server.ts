import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { apiKeyMiddleware } from "./middleware/api-key.js";
import { hostAllowlistMiddleware } from "./middleware/host-allowlist.js";
import { registerProduceVideoTools } from "./mcp/tools/produce-video.js";
import { registerVideoRoutes } from "./routes/videos.js";
import { registerPublishRoutes } from "./routes/publish.js";
import { MptClient } from "./mpt/client.js";

// No env/config singleton is read in this module: every value buildApp
// needs is a required argument, so tests construct a fully-isolated app
// without touching process.env or a DB (this server has neither) -- see
// index.ts for the one real caller that wires env.ts's values in.
export interface BuildAppDeps {
  mcpApiKey: string;
  mptBaseUrl: string;
  mptApiKey: string;
  postizUrl: string;
  postizApiKey: string;
  publicBaseUrl: string;
  // Injected by tests; production always drives the real MPT instance.
  mptClient?: MptClient;
}

export function buildApp(deps: BuildAppDeps): Hono {
  const mptClient = deps.mptClient ?? new MptClient({ baseUrl: deps.mptBaseUrl, apiKey: deps.mptApiKey });

  const app = new Hono();

  // Public, unauthenticated: a <video src> tag can't send an Authorization
  // header. Guarded only by runId's unguessability (CONTEXT.md).
  registerVideoRoutes(app, { mptClient, mptBaseUrl: deps.mptBaseUrl, mptApiKey: deps.mptApiKey });

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/publish", apiKeyMiddleware(deps.mcpApiKey));
  registerPublishRoutes(app, {
    postizUrl: deps.postizUrl,
    postizApiKey: deps.postizApiKey,
    publicBaseUrl: deps.publicBaseUrl,
  });

  app.use("/mcp", hostAllowlistMiddleware());
  app.use("/mcp", apiKeyMiddleware(deps.mcpApiKey));
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
