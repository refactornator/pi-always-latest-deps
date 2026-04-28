import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // makes test APIs global (like describe, it, expect)
    environment: 'node', // Test in Node.js environment
    include: ['extensions/**/*.test.ts'], // Pattern for test files within the extensions directory
    clearMocks: true, // Automatically clear mock calls and instances between tests
  },
});
