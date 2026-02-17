import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Default to 'node' for unit/integration tests.
    // Component tests opt into jsdom via @vitest-environment jsdom comment.
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Use environmentMatchGlobs so component tests automatically get jsdom
    environmentMatchGlobs: [
      ['tests/components/**', 'happy-dom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['lib/**', 'app/**', 'components/**'],
      exclude: ['**/*.d.ts', '**/types.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
