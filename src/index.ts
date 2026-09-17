import "dotenv/config";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { buildApp } from "./server.js";
import { env } from "./config.js";
import { logger } from "./logger.js";

const app = buildApp({
  mcpApiKey: env.mcpApiKey,
  mptBaseUrl: env.mptBaseUrl,
  mptApiKey: env.mptApiKey,
  postizUrl: env.postizUrl,
  postizApiKey: env.postizApiKey,
  publicBaseUrl: env.publicBaseUrl,
});

const mcpCors = cors({
  origin: "*",
  allowMethods: ["POST", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type", "MCP-Protocol-Version", "Mcp-Session-Id"],
  maxAge: 86400,
});
app.use("/mcp*", mcpCors);

serve({ fetch: app.fetch, port: env.port }, () => {
  logger.info({ port: env.port }, "moneyprinterturbo-mcp started");
});
