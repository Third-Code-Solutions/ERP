import { beforeEach, describe, expect, it, vi } from 'vitest'
import { boms, invoices, projects, scopeItems } from '@third-code-erp/database/schema'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  auditActivityReadsUseCoreApi: vi.fn(),
  getAuditActivityThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.requireUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('@/lib/erp-core-client', () => ({
  auditActivityReadsUseCoreApi: mocks.auditActivityReadsUseCoreApi,
  getAuditActivityThroughCoreApi: mocks.getAuditActivityThroughCoreApi,
}))

import ProjectAuditPage from './page'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('ProjectAuditPage sensitive query planning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.auditActivityReadsUseCoreApi.mockReturnValue(true)
    mocks.getAuditActivityThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { rows: [], total: 0, page: 1, limit: 25, totalPages: 1 },
    })
  })

  for (const [role, expectedTables] of [
    ['finance', [projects, scopeItems, invoices]],
    ['viewer', [projects, scopeItems, boms, invoices]],
  ] as const) {
    it(`limits entity discovery to authorized domains for ${role}`, async () => {
      const queriedTables: unknown[] = []
      mocks.requireUserProfile.mockResolvedValue({
        tenantId: TENANT_ID,
        role,
      })
      mocks.from.mockImplementation((table: unknown) => {
        queriedTables.push(table)
        if (table === projects) {
          return {
            where: async () => [{ id: PROJECT_ID, name: 'Visible project' }],
          }
        }
        if (table === scopeItems || table === boms || table === invoices) {
          return { where: async () => [] }
        }
        throw new Error('Unexpected denied-domain query')
      })

      await expect(
        ProjectAuditPage({
          params: Promise.resolve({ id: PROJECT_ID }),
          searchParams: Promise.resolve({}),
        }),
      ).resolves.toBeTruthy()

      expect(queriedTables).toEqual(expectedTables)
      if (role === 'finance') expect(queriedTables).not.toContain(boms)
      expect(mocks.getAuditActivityThroughCoreApi).toHaveBeenCalledWith(
        expect.objectContaining({ entityIds: [PROJECT_ID] }),
      )
    })
  }
})
