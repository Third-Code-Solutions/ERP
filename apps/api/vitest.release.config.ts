import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// This contains the API mutation path whose existing policy requires at least
// 80% unit coverage. Database persistence remains separately replayed in the
// Postgres lane; this gate covers the API validation and command behavior.
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
    include: [
      'src/admin/user-role-assignment.service.spec.ts',
      'src/admin/user-role-assignment.controller.spec.ts',
    ],
    environment: 'node',
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 1,
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      reportsDirectory: 'tmp/release-coverage',
      include: [
        'src/admin/user-role-assignment.controller.ts',
        'src/admin/user-role-assignment.pipe.ts',
        'src/admin/user-role-assignment.service.ts',
      ],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 80,
        lines: 80,
      },
    },
  },
})
