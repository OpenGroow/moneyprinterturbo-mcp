import type { PostizPlatform } from "./postiz/settings.js";

// Static, code-level project registry: no DB, no dashboard. A "project"
// here is a brand publishing through this server's shared Postiz account
// (see CONTEXT.md) -- its Postiz channel IDs are non-secret, so they live
// here in code; the matching bearer key is a secret and lives in env as
// MCP_API_KEY_<NAME> (see config.ts). Onboarding a new brand means adding
// an entry here plus its env var -- no redeploy of a dashboard, no
// migration.
export interface Project {
  name: string;
  postizChannelIds: Partial<Record<PostizPlatform, string>>;
}

export const PROJECTS: Record<string, Project> = {
  loveyoumake: {
    name: "loveyoumake",
    postizChannelIds: {
      instagram: "cmsg8sr5m000ono6x0jnwh4x9",
      tiktok: "cmt7e1edo0003mo6y6glrtp3z",
    },
  },
  rezon: {
    name: "rezon",
    postizChannelIds: {
      instagram: "cmsgfjvb0000tno6xr4tdea3u",
    },
  },
};
