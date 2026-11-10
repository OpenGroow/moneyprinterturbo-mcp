// A "project" is a brand calling this server. Its bearer key is a secret and
// lives in env as MCP_API_KEY_<NAME>; the names themselves come from
// MCP_PROJECTS (comma-separated, see config.ts). Onboarding a brand means
// adding its name to MCP_PROJECTS plus its key.
export interface Project {
  name: string;
}
