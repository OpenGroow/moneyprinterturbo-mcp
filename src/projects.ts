// Static, code-level project registry: no DB, no dashboard. A "project"
// here is a brand calling this server; its bearer key is a secret and lives
// in env as MCP_API_KEY_<NAME> (see config.ts). Onboarding a new brand means
// adding an entry here plus its env var.
export interface Project {
  name: string;
}

export const PROJECTS: Record<string, Project> = {
  loveyoumake: { name: "loveyoumake" },
  rezon: { name: "rezon" },
};
