import type { Hono } from "hono";
import { stripTrailingSlash } from "../util.js";

// POST /publish -- calls Postiz to publish the rendered reel. Same contract
// as openmontage-mcp's http_routes/publish.py, except the body's id field is
// `run_id` (not `project_id`): this repo has one identifier everywhere (see
// CONTEXT.md), MPT's task_id, already reachable at GET /videos/:runId/final.
// AUTH-REQUIRED, unlike that route: /publish is called by Megaclaw itself,
// never by a browser <video> tag.

export interface PublishDeps {
  postizUrl: string;
  postizApiKey: string;
  publicBaseUrl: string;
  fetchImpl?: typeof fetch;
}

interface PublishBody {
  run_id: string;
  caption?: string;
  platforms?: string[];
}

export function registerPublishRoutes(app: Hono, deps: PublishDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const postizUrl = stripTrailingSlash(deps.postizUrl);
  const publicBaseUrl = stripTrailingSlash(deps.publicBaseUrl);

  app.post("/publish", async (c) => {
    const body = (await c.req.json()) as PublishBody;
    const videoUrl = `${publicBaseUrl}/videos/${body.run_id}/final`;

    const upstream = await fetchImpl(`${postizUrl}/api/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.postizApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        video_url: videoUrl,
        caption: body.caption ?? "",
        platforms: body.platforms ?? [],
      }),
    });

    if (!upstream.ok) {
      return c.json({ error: "Postiz publish failed" }, 502);
    }
    return c.json(await upstream.json());
  });
}
