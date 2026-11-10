import { z } from "zod";

// This server has no internal infrastructure of its own (no DB, no
// pipeline) -- every env var here is a credential/address for a system it
// calls: the bearer key and the already-running MPT instance
// it drives. MPT_API_KEY is optional (MPT only enforces it when its own
// config.toml sets `api_key`; defaults to "").
//
// MCP_API_KEY is the bearer key that protects /mcp (one key, no per-caller config).

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
  // Defaults for produce_video when the caller omits the field.
  MPT_DEFAULT_VIDEO_SOURCE: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  MPT_DEFAULT_VOICE_NAME: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  // Public origin of this server, for get_video's URL (a tunnel when local). Defaults to http://localhost:<PORT>.
  PUBLIC_BASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  MCP_API_KEY: z.string().min(1),
});

export function loadEnv(raw: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment variables: ${issues}`);
  }
  const e = parsed.data as Record<string, string | number | undefined>;

  return {
    port: e.PORT as number,
    mptBaseUrl: e.MPT_BASE_URL as string,
    mptApiKey: e.MPT_API_KEY as string,
    mptDryRun: e.MPT_DRY_RUN === "true",
    maxClips: e.MPT_MAX_CLIPS as number | undefined,
    defaultVideoSource: e.MPT_DEFAULT_VIDEO_SOURCE as string | undefined,
    defaultVoiceName: e.MPT_DEFAULT_VOICE_NAME as string | undefined,
    publicBaseUrl: (e.PUBLIC_BASE_URL as string | undefined) ?? `http://localhost:${e.PORT}`,
    apiKey: e.MCP_API_KEY as string,
  };
}

export const env = loadEnv();
