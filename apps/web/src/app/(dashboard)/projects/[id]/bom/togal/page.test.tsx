import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  select: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: (_role: string, capability: string) =>
    capability === 'project.read' || capability === 'opportunity.read',
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('@/components/bom/takeoff-import-wizard', () => ({
  TakeoffImportWizard: () => null,
}))

import ProjectBomTogalPage from './page'

describe('ProjectBomTogalPage authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: '22222222-2222-4222-8222-222222222222',
      role: 'sales',
    })
  })

  it('denies a direct BOM deep link before issuing a database query', async () => {
    await expect(
      ProjectBomTogalPage({
        params: Promise.resolve({
          id: '33333333-3333-4333-8333-333333333333',
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mocks.notFound).toHaveBeenCalledOnce()
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
