import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  togalBomCommitWritesUseCoreApi: vi.fn(),
  commitTogalBomThroughCoreApi: vi.fn(),
  writeAuditLog: vi.fn(),
  db: { select: vi.fn(), transaction: vi.fn() },
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: mocks.db,
}))

vi.mock('@third-code-erp/database/schema', () => ({
  boms: {},
  bomLineItems: {},
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/erp-core-client', () => ({
  togalBomCommitWritesUseCoreApi: mocks.togalBomCommitWritesUseCoreApi,
  commitTogalBomThroughCoreApi: mocks.commitTogalBomThroughCoreApi,
}))

import { POST } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const BOM_ID = '22222222-2222-4222-8222-222222222222'
const BODY = {
  bom_id: BOM_ID,
  proposed_lines: [
    {
      description: 'Concrete',
      qty: 2,
      unit_cost_cents: 100,
      source_label: 'Concrete',
    },
  ],
}

function request(body: unknown = BODY, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/bom/togal-commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('Togal BOM commit authority selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'commercial',
      user: { id: '33333333-3333-4333-8333-333333333333' },
    })
    mocks.can.mockReturnValue(true)
    mocks.togalBomCommitWritesUseCoreApi.mockReturnValue(false)
  })

  it('delegates canary tenant commit to Core and preserves response shape', async () => {
    mocks.togalBomCommitWritesUseCoreApi.mockReturnValue(true)
    mocks.commitTogalBomThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        linesCreated: 1,
        bomId: BOM_ID,
        tenantId: TENANT_ID,
        totalCostCents: 200,
        tcvCents: 260,
        gpCents: 60,
        gpMarginBps: 2_308,
      },
    })

    const response = await POST(
      request(BODY, { 'Idempotency-Key': 'togal-route-1' })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      lines_created: 1,
      bom_id: BOM_ID,
      total_cost_cents: 200,
      tcv_cents: 260,
      gp_cents: 60,
      gp_margin_bps: 2_308,
    })
    expect(mocks.commitTogalBomThroughCoreApi).toHaveBeenCalledWith(
      expect.objectContaining({ bomId: BOM_ID }),
      'togal-route-1'
    )
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('fails closed without fallback when Core authority is unavailable', async () => {
    mocks.togalBomCommitWritesUseCoreApi.mockReturnValue(true)
    mocks.commitTogalBomThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. No Togal BOM lines were committed.',
    })

    const response = await POST(
      request(BODY, { 'Idempotency-Key': 'togal-route-2' })
    )

    expect(response.status).toBe(503)
    expect(mocks.db.select).not.toHaveBeenCalled()
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it('requires idempotency when Core authority is enabled', async () => {
    mocks.togalBomCommitWritesUseCoreApi.mockReturnValue(true)

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(mocks.commitTogalBomThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.db.select).not.toHaveBeenCalled()
  })
})
