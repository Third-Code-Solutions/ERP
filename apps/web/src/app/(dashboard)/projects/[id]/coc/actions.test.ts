import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  select: vi.fn(),
  update: vi.fn(),
  createSigningSession: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  requireUserProfile: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, update: mocks.update },
}))

vi.mock('@/lib/operations/integrations/docuseal', () => ({
  createSigningSession: mocks.createSigningSession,
}))

vi.mock('@/lib/audit', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { sendCocForSignature } from './actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const COC_ID = '44444444-4444-4444-8444-444444444444'

function selectRows(...rows: unknown[][]): void {
  mocks.selectResults.push(...rows)
}

describe('sendCocForSignature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResults.length = 0
    mocks.requireUserProfile.mockResolvedValue({
      role: 'sd_pm_pe',
      tenantId: TENANT_ID,
      user: { id: '55555555-5555-4555-8555-555555555555' },
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockImplementation(() => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(mocks.selectResults.shift() ?? []) }) }),
    }))
    mocks.update.mockImplementation(() => ({ set: () => ({ where: () => Promise.resolve() }) }))
    mocks.createSigningSession.mockResolvedValue({
      mechanism: 'docuseal',
      token: 'submission-1',
      url: 'https://sign.example.test/submission-1',
      is_dev_stub: false,
    })
    mocks.writeAuditLog.mockResolvedValue(undefined)
  })

  it('does not start signing when the project has no linked client account', async () => {
    selectRows([{ id: COC_ID, status: 'draft' }], [{ account_id: null }])

    await expect(sendCocForSignature(PROJECT_ID)).resolves.toEqual({
      error: 'Link a client account to this project before sending the COC for signature.',
    })
    expect(mocks.createSigningSession).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it.each([
    { contacts: [] },
    { contacts: [{ full_name: 'Client Representative', email: 'invalid-address' }] },
  ])(
    'does not start signing without a valid primary contact email',
    async ({ contacts }) => {
      selectRows(
        [{ id: COC_ID, status: 'draft' }],
        [{ account_id: ACCOUNT_ID }],
        contacts,
      )

      const result = await sendCocForSignature(PROJECT_ID)

      expect(result.error).toMatch(/valid email.*primary contact/)
      expect(mocks.createSigningSession).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    },
  )

  it('uses the tenant-linked primary contact and advances the draft after signing starts', async () => {
    selectRows(
      [{ id: COC_ID, status: 'draft' }],
      [{ account_id: ACCOUNT_ID }],
      [{ full_name: 'Ana Client', email: ' ana@client.test ' }],
    )

    await expect(sendCocForSignature(PROJECT_ID)).resolves.toEqual({
      url: 'https://sign.example.test/submission-1',
    })
    expect(mocks.createSigningSession).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      entityType: 'coc',
      entityId: COC_ID,
      signerEmail: 'ana@client.test',
      signerName: 'Ana Client',
    })
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledOnce()
    // The signing link is a bearer credential and never reaches the tenant-readable audit log.
    const audited = JSON.stringify(mocks.writeAuditLog.mock.calls[0]?.[0])
    expect(audited).not.toContain('signing_url')
    expect(audited).not.toContain('https://sign.example.test/submission-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/coc`)
  })
})
