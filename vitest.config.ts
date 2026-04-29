import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // makes test APIs global (like describe, it, expect)
    environment: 'node', // Test in Node.js environment
    include: ['extensions/**/*.test.ts', 'shared/**/*.test.ts', 'claude/**/*.test.ts', 'setup/**/*.test.mjs'],
    clearMocks: true, // Automatically clear mock calls and instances between tests
  },
});
