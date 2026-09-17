import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["dotenv/config"],
    include: ["src/tests/**/*.test.ts"],
    exclude: ["src/tests/e2e/**"],
  },
});
