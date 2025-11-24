import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use node environment for testing
    environment: 'node',

    // Longer timeout for API calls (30 seconds)
    testTimeout: 30000,

    // Test file patterns
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],

    // Exclude patterns
    exclude: ['node_modules', 'dist', 'src'],

    // Display options
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
  },
});
