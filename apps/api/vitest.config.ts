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
    // Nest HTTP-contract specs create a full application per file. Bound the
    // worker count so CI and developer machines do not starve those app.init()
    // calls and turn valid contracts into 5-second harness timeouts.
    minWorkers: 1,
    maxWorkers: 1,
  },
})
