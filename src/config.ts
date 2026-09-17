import { z } from "zod";

// This server has no internal infrastructure of its own (no DB, no
// pipeline) -- every env var here is a credential/address for a system it
// calls: Megaclaw's own key (MCP_API_KEY), the already-running MPT instance
// it drives, and Postiz for /publish. All required at boot except
// PUBLIC_BASE_URL, which has a same-process default.
const envSchema = z.object({
  MCP_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(4600),
  MPT_BASE_URL: z.string().min(1),
  MPT_API_KEY: z.string(),
  PUBLIC_BASE_URL: z.string().min(1).optional(),
  POSTIZ_URL: z.string().min(1),
  POSTIZ_API_KEY: z.string().min(1),
});

export function loadEnv(raw: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment variables: ${issues}`);
  }
  const e = parsed.data;
  return {
    mcpApiKey: e.MCP_API_KEY,
    port: e.PORT,
    mptBaseUrl: e.MPT_BASE_URL,
    mptApiKey: e.MPT_API_KEY,
    publicBaseUrl: e.PUBLIC_BASE_URL ?? `http://localhost:${e.PORT}`,
    postizUrl: e.POSTIZ_URL,
    postizApiKey: e.POSTIZ_API_KEY,
  };
}

export const env = loadEnv();
