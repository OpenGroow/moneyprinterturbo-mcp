import crypto from "node:crypto";
import type { Hono } from "hono";
import { logger } from "../logger.js";
import type { MptClient } from "../mpt/client.js";
import type { Project } from "../projects.js";
import { buildPostizSettings, isPostizPlatform, type PostizPlatform } from "../postiz/settings.js";

// POST /publish -- uploads the rendered reel to Postiz, then schedules one
// post per requested platform. Real Postiz contract (two-step upload +
// schedule, `integration.id` per channel), ported from demo-video-mcp's
// src/providers/publish.ts -- not the flat `{video_url, platforms}` shape
// this route used to have, which never matched Postiz's actual API.
//
// The Postiz account/token is this server's own (env, shared across every
// caller), but it holds channels for several brands (Loveyoumake, Rezon,
// ...). Which brand a request is for is already known from the bearer key
// it authenticated with (projectApiKeyMiddleware sets `project` on the
// context -- see projects.ts): the channelId per platform is resolved from
// `project.postizChannelIds`, never passed by the caller.
const PUBLISH_DELAY_MS = 5 * 60 * 1000;

export interface PublishDeps {
  mptClient: MptClient;
  postizApiUrl: string;
  postizUploadUrl: string;
  postizToken: string;
  postizGroup?: string;
  fetchImpl?: typeof fetch;
}

interface PublishBody {
  run_id: string;
  caption?: string;
  platforms?: string[];
}

interface PlatformResult {
  platform: PostizPlatform;
  ok: boolean;
  id?: string;
  error?: string;
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

async function uploadMedia(
  fetchImpl: typeof fetch,
  uploadUrl: string,
  token: string,
  video: { buffer: Buffer; contentType?: string },
): Promise<{ id: string; path: string }> {
  const formData = new FormData();
  formData.append("file", new File([video.buffer], "reel.mp4", { type: video.contentType ?? "video/mp4" }));

  const res = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: { Authorization: token, Accept: "application/json" },
    body: formData,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Postiz media upload failed with status ${res.status}`);
  }
  const id = body["id"] as string | undefined;
  const path = body["path"] as string | undefined;
  if (!id || !path) {
    throw new Error("Postiz upload response missing id/path");
  }
  return { id, path };
}

async function scheduleOne(
  fetchImpl: typeof fetch,
  deps: PublishDeps,
  platform: PostizPlatform,
  channelId: string,
  caption: string,
  uploaded: { id: string; path: string },
): Promise<PlatformResult> {
  const payload = {
    type: "schedule",
    tags: [],
    shortLink: false,
    date: new Date(Date.now() + PUBLISH_DELAY_MS).toISOString(),
    posts: [
      {
        integration: { id: channelId },
        ...(deps.postizGroup ? { group: deps.postizGroup } : {}),
        settings: buildPostizSettings(platform),
        value: [{ id: randomId(), content: caption, image: [uploaded] }],
      },
    ],
  };

  try {
    const res = await fetchImpl(deps.postizApiUrl, {
      method: "POST",
      headers: { Authorization: deps.postizToken, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { platform, ok: false, error: `Postiz schedule failed with status ${res.status}` };
    }
    return { platform, ok: true, id: body["id"] as string | undefined };
  } catch (err) {
    logger.error({ err, platform }, "Postiz schedule failed");
    return { platform, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function registerPublishRoutes(app: Hono, deps: PublishDeps) {
  const fetchImpl = deps.fetchImpl ?? fetch;

  app.post("/publish", async (c) => {
    const project = (c as unknown as { get(key: "project"): Project }).get("project");
    const body = (await c.req.json()) as PublishBody;
    const requested = body.platforms ?? [];

    if (requested.length === 0 || !requested.every(isPostizPlatform)) {
      const invalid = requested.filter((p) => !isPostizPlatform(p));
      return c.json({ error: "Invalid platforms", invalid }, 400);
    }
    const platforms = requested as PostizPlatform[];

    const missingChannels = platforms.filter((p) => !project.postizChannelIds[p]);
    if (missingChannels.length > 0) {
      return c.json(
        { error: `No Postiz channel configured for ${project.name} on platform(s)`, platforms: missingChannels },
        400,
      );
    }

    const video = await deps.mptClient.fetchFinalVideoBuffer(body.run_id);
    if (!video) {
      return c.json({ error: "Not found" }, 404);
    }

    const uploaded = await uploadMedia(fetchImpl, deps.postizUploadUrl, deps.postizToken, video);

    const caption = body.caption ?? "";
    const results = await Promise.all(
      platforms.map((platform) =>
        scheduleOne(fetchImpl, deps, platform, project.postizChannelIds[platform]!, caption, uploaded),
      ),
    );

    return c.json({ results });
  });
}
