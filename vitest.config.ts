import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Hermetic: the import-time `loadEnv()` in config.ts needs these, whatever a local .env holds.
    env: { MPT_BASE_URL: "http://mpt", MCP_API_KEY: "test-key" },
    setupFiles: ["dotenv/config"],
    include: ["src/tests/**/*.test.ts"],
    exclude: ["src/tests/e2e/**"],
  },
});
