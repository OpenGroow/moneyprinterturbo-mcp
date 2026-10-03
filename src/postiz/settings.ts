// Per-platform Postiz `settings` wire shape. Port of `buildPostizSettings`
// from demo-video-mcp's src/providers/publish.ts (the proven Postiz
// contract, ported from loveyoumake/orchestrator) -- reduced to the two
// platforms in scope here (Instagram, TikTok) and with their defaults
// hardcoded rather than read from a per-project Zod schema, since this
// server is mono-tenant (no per-project config -- see CONTEXT.md).

export type PostizPlatform = "instagram" | "tiktok";

export const POSTIZ_PLATFORMS: readonly PostizPlatform[] = ["instagram", "tiktok"];

export function isPostizPlatform(value: string): value is PostizPlatform {
  return (POSTIZ_PLATFORMS as readonly string[]).includes(value);
}

export function buildPostizSettings(platform: PostizPlatform): Record<string, unknown> {
  switch (platform) {
    case "instagram":
      return { __type: "instagram", post_type: "post" };
    case "tiktok":
      return {
        __type: "tiktok",
        privacy_level: "PUBLIC_TO_EVERYONE",
        content_posting_method: "UPLOAD",
        // Postiz validates these TikTok fields even in UPLOAD mode.
        duet: false,
        stitch: false,
        comment: false,
        autoAddMusic: "no",
        brand_content_toggle: false,
        brand_organic_toggle: false,
      };
  }
}
