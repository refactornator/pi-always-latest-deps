import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // makes test APIs global (like describe, it, expect)
    environment: 'node', // Test in Node.js environment
    include: ['extensions/**/*.test.ts', 'claude-code/**/*.test.mjs'], // Pi extension tests + Claude Code hook tests
    clearMocks: true, // Automatically clear mock calls and instances between tests
  },
});
