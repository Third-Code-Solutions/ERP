import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// API integration tests may import the Web parser to prove the cross-package
// evidence contract. The aliases mirror the Web Vitest environment without
// changing production build resolution.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '../web/src'),
      'server-only': resolve(__dirname, '../web/test/server-only.ts'),
      '@third-code-erp/auth/server': resolve(
        __dirname,
        '../../packages/auth/src/server.ts'
      ),
      '@third-code-erp/auth': resolve(
        __dirname,
        '../../packages/auth/src/index.ts'
      ),
    },
  },
  test: {
    environment: 'node',
    pool: 'forks',
  },
})
