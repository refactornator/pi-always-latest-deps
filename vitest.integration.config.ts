import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["integration/**/*.test.mjs"],
    clearMocks: true,
    testTimeout: 60_000,
  },
});
