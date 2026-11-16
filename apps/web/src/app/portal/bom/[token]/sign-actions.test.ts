import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  results: [] as unknown[][],
  select: vi.fn(),
  resolveTaxRates: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
  resolveTaxRates: mocks.resolveTaxRates,
}))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))
vi.mock('@/lib/audit', () => ({ writeAuditLogInTransaction: vi.fn() }))
vi.mock('@/lib/operations/award-automation', () => ({ runSignedBomAward: vi.fn() }))
vi.mock('@/lib/operations/integrations/docuseal', () => ({
  isDevelopmentStubSubmissionId: () => false,
}))

import { loadPortalBom } from './sign-actions'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const BOM_ID = '22222222-2222-4222-8222-222222222222'
const SECTION_ID = '33333333-3333-4333-8333-333333333331'
const WORK_ITEM_ID = '33333333-3333-4333-8333-333333333332'
const MATERIAL_ID = '33333333-3333-4333-8333-333333333333'
const PLAIN_ID = '33333333-3333-4333-8333-333333333334'

// Each db.select() resolves to the next queued result, whatever it chains.
function chain(rows: unknown[]) {
  const query: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'leftJoin', 'limit', 'orderBy']) {
    query[method] = vi.fn(() => query)
  }
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject)
  return query
}

function line(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    code: 'HVAC-01',
    description: id,
    unit: 'lot',
    quantity: '1.0000',
    unit_cost_cents: 0,
    line_total_cents: 0,
    is_group: 0,
    parent_line_item_id: null,
    ...overrides,
  }
}

describe('loadPortalBom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.results = [
      [{
        id: 'token-row', tenant_id: TENANT_ID, bom_id: BOM_ID,
        expires_at: new Date('2099-01-01T00:00:00Z'), used_at: null,
        docuseal_slug: null, docuseal_submission_id: null,
      }],
      [{
        id: BOM_ID, label: null, status: 'submitted', version: 1,
        tcv_cents: 12000, total_cost_cents: 9000,
        project_name: 'Fixture project', account_name: null,
      }],
      [
        line(SECTION_ID, { is_group: 1, code: null }),
        // The work item's total already includes its material line.
        line(WORK_ITEM_ID, { unit_cost_cents: 10000, line_total_cents: 10000 }),
        line(MATERIAL_ID, {
          code: 'ELEC-02', unit_cost_cents: 4000, line_total_cents: 4000,
          parent_line_item_id: WORK_ITEM_ID,
        }),
        line(PLAIN_ID, { unit_cost_cents: 2000, line_total_cents: 2000 }),
      ],
    ]
    mocks.select.mockImplementation(() => chain(mocks.results.shift() ?? []))
    mocks.resolveTaxRates.mockResolvedValue({ vatBps: 1200, retentionBps: 1000 })
  })

  it('shows each work item once, not again through its material lines', async () => {
    const result = await loadPortalBom('portal-token-fixture-123')

    expect(result.state).toBe('ok')
    expect(result.bom?.lines.map((l) => l.id)).toEqual([WORK_ITEM_ID, PLAIN_ID])
    // No extra category heading for the material line's own code prefix.
    expect(new Set(result.bom?.lines.map((l) => l.category))).toEqual(new Set(['HVAC']))
    // The category totals the page sums now add up to the BOM subtotal.
    expect(result.bom?.lines.reduce((sum, l) => sum + l.line_total_cents, 0)).toBe(
      result.bom?.tcv_cents
    )
    // The hierarchy column stays server-side.
    expect(result.bom?.lines[0]).not.toHaveProperty('parent_line_item_id')
  })
})
