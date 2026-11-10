import { z } from "zod";
import { PROJECTS, type Project } from "./projects.js";

// This server has no internal infrastructure of its own (no DB, no
// pipeline) -- every env var here is a credential/address for a system it
// calls: Megaclaw's own per-project keys, the already-running MPT instance
// it drives, and Postiz for /publish. All required at boot except
// MPT_API_KEY (MPT only enforces it when its own config.toml sets
// `api_key`; defaults to "") and POSTIZ_GROUP (non-secret, omitted from the
// schedule payload if unset).
//
// There is no single MCP_API_KEY: one MCP_API_KEY_<NAME> per brand in
// projects.ts's PROJECTS registry (uppercased name), for both /mcp and
// /publish -- the key itself identifies the brand, so Megaclaw never needs
// to tell this server which Postiz channel a reel belongs to (see
// CONTEXT.md).
const projectKeyEnvVars = Object.fromEntries(
  Object.keys(PROJECTS).map((name) => [projectKeyEnvVarName(name), z.string().min(1)]),
);

const envSchema = z.object({
  PORT: z.coerce.number().default(4600),
  MPT_BASE_URL: z.string().min(1),
  MPT_API_KEY: z.string().default(""),
  // Test mode: produce_video logs what it received and answers without calling MPT.
  MPT_DRY_RUN: z.enum(["true", "false"]).default("false"),
  // Test lever: caps video_terms to N entries; MPT generates one ComfyUI clip per term, so N=1 means one clip.
  MPT_MAX_CLIPS: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  // Public origin of this server, for get_video's URL (a tunnel when local).
  PUBLIC_BASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  POSTIZ_TOKEN: z.string().min(1),
  POSTIZ_API_URL: z.string().min(1),
  POSTIZ_UPLOAD_URL: z.string().min(1),
  POSTIZ_GROUP: z.string().min(1).optional(),
  ...projectKeyEnvVars,
});

export function projectKeyEnvVarName(projectName: string): string {
  return `MCP_API_KEY_${projectName.toUpperCase()}`;
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment variables: ${issues}`);
  }
  const e = parsed.data as Record<string, string | number | undefined>;

  const projectsByKey: Record<string, Project> = {};
  for (const [name, project] of Object.entries(PROJECTS)) {
    const key = e[projectKeyEnvVarName(name)] as string;
    projectsByKey[key] = project;
  }

  return {
    port: e.PORT as number,
    mptBaseUrl: e.MPT_BASE_URL as string,
    mptApiKey: e.MPT_API_KEY as string,
    mptDryRun: e.MPT_DRY_RUN === "true",
    maxClips: e.MPT_MAX_CLIPS as number | undefined,
    publicBaseUrl: e.PUBLIC_BASE_URL as string | undefined,
    postizToken: e.POSTIZ_TOKEN as string,
    postizApiUrl: e.POSTIZ_API_URL as string,
    postizUploadUrl: e.POSTIZ_UPLOAD_URL as string,
    postizGroup: e.POSTIZ_GROUP as string | undefined,
    projectsByKey,
  };
}

export const env = loadEnv();
