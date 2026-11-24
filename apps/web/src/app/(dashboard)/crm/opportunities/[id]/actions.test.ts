import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  stampActorInTransaction: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/database', () => ({
  db: { transaction: mocks.transaction },
}))
vi.mock('@/lib/audit', () => ({
  stampActorInTransaction: mocks.stampActorInTransaction,
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))
vi.mock('@/lib/safe-action-error', () => ({
  safeActionError: (_error: unknown, fallback: string) => fallback,
}))

import { updateOpportunity } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'
const REP_ID = '66666666-6666-4666-8666-666666666666'

const LOADED_AT = '2026-11-20T03:04:05.678Z'

const PROFILE = { user: { id: USER_ID }, tenantId: TENANT_ID, role: 'sales' }

const OPEN_ROW = {
  stage: 'negotiation',
  account_id: ACCOUNT_ID,
  project_id: null,
  rep_id: USER_ID,
  tcv_cents: 1_000_000,
  gp_cents: 200_000,
  probability: 75,
  weighted_tcv_cents: 750_000,
  closing_date: new Date('2026-12-01T00:00:00+08:00'),
  area_sqm: 120,
  opportunity_type: 'fit_out',
  remarks: 'Initial',
  updated_at: new Date(LOADED_AT),
}

function query<T>(rows: T[]) {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn(),
    then: (onFulfilled?: (value: T[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(onFulfilled, onRejected),
  }
  builder.from.mockReturnValue(builder)
  builder.where.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  builder.for.mockReturnValue(builder)
  return builder
}

/** Queues the transaction's select results in the order the action reads them. */
function transactionWith(selects: unknown[][], updateRows: Array<{ id: string }> = [{ id: OPPORTUNITY_ID }]) {
  const set = vi.fn()
  const returning = vi.fn().mockResolvedValue(updateRows)
  set.mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) })
  const update = vi.fn().mockReturnValue({ set })
  const select = vi.fn()
  for (const rows of selects) select.mockReturnValueOnce(query(rows))
  const tx = { select, update }
  mocks.transaction.mockImplementationOnce(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
  return { tx, select, update, set }
}

/** Renders the WHERE predicate a mocked query received, so tests can see its tenant scope. */
function wherePredicate(builder: ReturnType<typeof query>) {
  return new PgDialect().sqlToQuery(builder.where.mock.calls[0]![0] as SQL)
}

function editForm(fields: Record<string, string> = {}): FormData {
  const form = new FormData()
  form.set('opportunity_id', OPPORTUNITY_ID)
  form.set('expected_updated_at', LOADED_AT)
  form.set('tcv', '10000.00')
  form.set('gp', '2000.00')
  form.set('closing_date', '2026-12-01')
  form.set('area_sqm', '120')
  form.set('opportunity_type', 'fit_out')
  form.set('remarks', 'Initial')
  form.set('rep_id', USER_ID)
  form.set('project_id', '')
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

describe('updateOpportunity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(true)
  })

  it('refuses a signed-out caller and a role without opportunity.update before any database work', async () => {
    mocks.getUserProfile.mockResolvedValueOnce(null)
    await expect(updateOpportunity(editForm())).resolves.toEqual({
      error: 'Your session has expired. Sign in again.',
    })

    mocks.can.mockReturnValueOnce(false)
    await expect(updateOpportunity(editForm())).resolves.toEqual({
      error: 'Only owners, admins and sales users can edit an opportunity.',
    })
    expect(mocks.can).toHaveBeenCalledWith('sales', 'opportunity.update')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects invalid input before opening a transaction', async () => {
    await expect(updateOpportunity(editForm({ tcv: '12.345' }))).resolves.toMatchObject({
      error: expect.stringContaining('TCV must be a peso amount'),
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('locks the tenant-scoped row, recomputes weighted from the stored probability and audits before/after', async () => {
    const { tx, select, set } = transactionWith([[OPEN_ROW]])

    await expect(updateOpportunity(editForm({ tcv: '20000.00' }))).resolves.toEqual({ saved: true })

    const lockQuery = select.mock.results[0]?.value as ReturnType<typeof query>
    expect(lockQuery.for).toHaveBeenCalledWith('update')
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ tcv_cents: 2_000_000, weighted_tcv_cents: 1_500_000 })
    )
    expect(set.mock.calls[0]?.[0]).not.toHaveProperty('stage')
    expect(set.mock.calls[0]?.[0]).not.toHaveProperty('probability')
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(tx, {
      tenantId: TENANT_ID,
      actorId: USER_ID,
      entityType: 'opportunity',
      entityId: OPPORTUNITY_ID,
      action: 'update',
      diff: {
        tcv_cents: { before: 1_000_000, after: 2_000_000 },
        weighted_tcv_cents: { before: 750_000, after: 1_500_000 },
      },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/crm/opportunities/${OPPORTUNITY_ID}`)
  })

  it('refuses to overwrite a row that changed after the form was opened', async () => {
    const { update } = transactionWith([
      [{ ...OPEN_ROW, updated_at: new Date('2026-11-20T03:09:00.000Z') }],
    ])

    await expect(updateOpportunity(editForm({ tcv: '20000.00' }))).resolves.toEqual({
      error: 'This opportunity changed since you opened it. Reload the page and make your changes again.',
    })
    expect(update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('does not write or audit when nothing changed', async () => {
    const { update } = transactionWith([[OPEN_ROW]])

    await expect(updateOpportunity(editForm())).resolves.toEqual({ saved: false })
    expect(update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it.each(['won', 'lost', 'closed_won', 'closed_lost'])('refuses a %s opportunity', async (stage) => {
    const { update } = transactionWith([[{ ...OPEN_ROW, stage }]])

    await expect(updateOpportunity(editForm({ tcv: '20000.00' }))).resolves.toEqual({
      error: 'This opportunity is Won or Lost and can no longer be edited.',
    })
    expect(update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('answers not found for an id outside the tenant', async () => {
    const { select, update } = transactionWith([[]])
    await expect(updateOpportunity(editForm())).resolves.toEqual({ error: 'Opportunity not found.' })

    const lock = wherePredicate(select.mock.results[0]?.value as ReturnType<typeof query>)
    expect(lock.sql).toContain('"opportunities"."tenant_id"')
    expect(lock.params).toEqual([OPPORTUNITY_ID, TENANT_ID])
    expect(update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('scopes the rep, project and other-link checks to the caller tenant', async () => {
    const { select } = transactionWith([
      [OPEN_ROW],
      [{ role: 'sales' }],
      [{ id: PROJECT_ID, account_id: ACCOUNT_ID, deleted_at: null }],
      [],
    ])

    await expect(
      updateOpportunity(editForm({ rep_id: REP_ID, project_id: PROJECT_ID }))
    ).resolves.toEqual({ saved: true })

    const [, rep, project, other] = select.mock.results.map(
      (result) => wherePredicate(result.value as ReturnType<typeof query>)
    )
    expect(rep?.sql).toContain('"users"."tenant_id"')
    expect(rep?.params).toEqual([REP_ID, TENANT_ID, 'active'])
    expect(project?.sql).toContain('"projects"."tenant_id"')
    expect(project?.params).toEqual([PROJECT_ID, TENANT_ID])
    expect(other?.sql).toContain('"opportunities"."tenant_id"')
    expect(other?.params).toEqual([PROJECT_ID, TENANT_ID, OPPORTUNITY_ID])
  })

  it('links a same-account, live, unlinked project once and audits the link', async () => {
    const { tx, update, set } = transactionWith([
      [OPEN_ROW],
      [{ id: PROJECT_ID, account_id: ACCOUNT_ID, deleted_at: null }],
      [],
    ])

    await expect(updateOpportunity(editForm({ project_id: PROJECT_ID }))).resolves.toEqual({ saved: true })
    expect(update).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ project_id: PROJECT_ID }))
    expect(mocks.writeAuditLogInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ diff: { project_id: { before: null, after: PROJECT_ID } } })
    )
  })

  const refusedProjects: Array<[string, unknown[], string]> = [
    ['another tenant or missing', [], 'Project not found.'],
    ['retired', [{ id: PROJECT_ID, account_id: ACCOUNT_ID, deleted_at: new Date() }], 'Project not found.'],
    [
      'another account',
      [{ id: PROJECT_ID, account_id: '77777777-7777-4777-8777-777777777777', deleted_at: null }],
      'The project must belong to the same account as this opportunity.',
    ],
  ]
  it.each(refusedProjects)('refuses a project that is %s', async (_label, projectRows, message) => {
    const { update } = transactionWith([[OPEN_ROW], projectRows])

    await expect(updateOpportunity(editForm({ project_id: PROJECT_ID }))).resolves.toEqual({ error: message })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a project already linked to another opportunity', async () => {
    const { update } = transactionWith([
      [OPEN_ROW],
      [{ id: PROJECT_ID, account_id: ACCOUNT_ID, deleted_at: null }],
      [{ id: '88888888-8888-4888-8888-888888888888' }],
    ])

    await expect(updateOpportunity(editForm({ project_id: PROJECT_ID }))).resolves.toEqual({
      error: 'That project is already linked to another opportunity.',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('never replaces an existing project link', async () => {
    const { update } = transactionWith([[{ ...OPEN_ROW, project_id: PROJECT_ID }]])

    await expect(
      updateOpportunity(editForm({ project_id: '99999999-9999-4999-8999-999999999999' }))
    ).resolves.toMatchObject({ error: expect.stringContaining('already linked to a project') })
    expect(update).not.toHaveBeenCalled()
  })

  it('accepts an active owner, admin or sales user as the new sales owner and refuses anyone else', async () => {
    const accepted = transactionWith([[OPEN_ROW], [{ role: 'admin' }]])
    await expect(updateOpportunity(editForm({ rep_id: REP_ID }))).resolves.toEqual({ saved: true })
    expect(accepted.set).toHaveBeenCalledWith(expect.objectContaining({ rep_id: REP_ID }))

    const refused = transactionWith([[OPEN_ROW], [{ role: 'viewer' }]])
    await expect(updateOpportunity(editForm({ rep_id: REP_ID }))).resolves.toEqual({
      error: 'Choose an active owner, admin or sales user as the sales owner.',
    })
    expect(refused.update).not.toHaveBeenCalled()

    const otherTenant = transactionWith([[OPEN_ROW], []])
    await expect(updateOpportunity(editForm({ rep_id: REP_ID }))).resolves.toEqual({
      error: 'Choose an active owner, admin or sales user as the sales owner.',
    })
    expect(otherTenant.update).not.toHaveBeenCalled()
  })

  it('reports a plain message and skips revalidation when the transaction fails', async () => {
    transactionWith([[OPEN_ROW]])
    mocks.writeAuditLogInTransaction.mockRejectedValueOnce(new Error('Audit insert failed: secret detail'))

    await expect(updateOpportunity(editForm({ tcv: '20000.00' }))).resolves.toEqual({
      error: 'The opportunity could not be saved. Refresh the page and try again.',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('fails the transaction when the row disappears between lock and update', async () => {
    transactionWith([[OPEN_ROW]], [])
    await expect(updateOpportunity(editForm({ tcv: '20000.00' }))).resolves.toEqual({
      error: 'The opportunity could not be saved. Refresh the page and try again.',
    })
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })
})
