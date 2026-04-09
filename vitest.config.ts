import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.{ts,js}'],
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./tests/setup.ts'],
    // Roda testes em sequência (não em paralelo) pra evitar race no DB compartilhado
    pool: 'forks',
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
