import { defineConfig } from "vitest/config";

// Separate from vitest.config.ts / the default `test` script: these
// scenarios drive a real MoneyPrinterTurbo instance (real video generation,
// real wall-clock minutes) and are not part of the fast unit/integration
// suite run by default.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["dotenv/config"],
    include: ["src/tests/e2e/**/*.test.ts"],
    testTimeout: 10 * 60 * 1000,
  },
});
