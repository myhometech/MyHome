import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.git', '.cache'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'html', 'lcov'],
      lines: 85,
      functions: 85,
      branches: 80,
      statements: 85,
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/test/**',
        '**/node_modules/**',
        '**/dist/**'
      ]
    },
    pool: 'threads',
    maxConcurrency: 4,
    testTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@assets': path.resolve(__dirname, './attached_assets'),
    },
  },
})