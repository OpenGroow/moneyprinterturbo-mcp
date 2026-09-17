import type { Hono } from "hono";
import type { MptClient } from "../mpt/client.js";
import { stripTrailingSlash } from "../util.js";

// GET /videos/:runId/final -- serves the rendered reel so the Megaclaw
// dashboard's <video src> (and Postiz, via /publish) can fetch it by URL.
// PUBLIC/unauthenticated (see CONTEXT.md): a plain <video> tag can't send an
// Authorization header, so the only guard is runId being an unguessable
// MPT task_id. Proxies server-to-server to MPT's own GET
// /api/v1/stream/{file_path} using MPT_API_KEY -- that key must never reach
// the browser.
const FORWARDED_RESPONSE_HEADERS = ["Content-Type", "Content-Range", "Accept-Ranges", "Content-Length"];

export interface VideoRouteDeps {
  mptClient: MptClient;
  mptBaseUrl: string;
  mptApiKey: string;
  fetchImpl?: typeof fetch;
}

export function registerVideoRoutes(app: Hono, deps: VideoRouteDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const mptBaseUrl = stripTrailingSlash(deps.mptBaseUrl);

  app.get("/videos/:runId/final", async (c) => {
    const runId = c.req.param("runId");
    const filePath = await deps.mptClient.resolveFinalFilePath(runId);
    if (!filePath) {
      return c.json({ error: "Not found" }, 404);
    }

    const upstreamHeaders: Record<string, string> = { "x-api-key": deps.mptApiKey };
    const range = c.req.header("Range");
    if (range) upstreamHeaders["Range"] = range;

    const upstream = await fetchImpl(`${mptBaseUrl}/api/v1/stream/${filePath}`, { headers: upstreamHeaders });

    const headers = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  });
}
