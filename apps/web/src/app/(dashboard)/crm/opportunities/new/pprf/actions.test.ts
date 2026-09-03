import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  submitIntake: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@/server/crm/pprf-submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/crm/pprf-submission-service')>()
  return {
    ...actual,
    pprfSubmissionService: { submitIntake: mocks.submitIntake },
  }
})

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { createPprfIntake } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const SUBMISSION_ID = '33333333-3333-4333-8333-333333333333'
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'
const OPPORTUNITY_ID = '55555555-5555-4555-8555-555555555555'
const PPRF_ID = '66666666-6666-4666-8666-666666666666'
const ROLES = [
  'owner', 'estimator', 'pm', 'admin', 'sales', 'commercial', 'design',
  'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx', 'viewer',
] as const

function validForm(): FormData {
  const form = new FormData()
  form.set('submission_id', SUBMISSION_ID)
  form.set('client_name', 'Acme Retail')
  form.set('industry', 'retail')
  form.set('billing_address', '')
  form.set('primary_email', '')
  form.set('primary_phone', '')
  form.set('tcv', '1234.50')
  form.set('gp', '12.03')
  form.set('area_sqm', '')
  form.set('closing_date', '2026-09-30')
  form.set('opportunity_type', 'fit_out')
  form.set('remarks', '')
  form.set('site_address', 'Makati City')
  form.set('floor_area_sqm', '45.5')
  form.set('landlord_contact', 'Jane Doe')
  form.set('as_built_available', 'yes')
  form.set('scope_notes', 'Keep exact finishes.')
  form.set('project_type', 'Retail fit-out')
  form.set('expected_start_date', '2026-10-01')
  form.set('budget_range', 'PHP 1M-2M')
  return form
}

describe('createPprfIntake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.revalidatePath.mockReset()
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'sales',
    })
    mocks.can.mockReturnValue(true)
    mocks.submitIntake.mockResolvedValue({
      ok: true,
      kind: 'intake',
      tenantId: TENANT_ID,
      accountId: ACCOUNT_ID,
      opportunityId: OPPORTUNITY_ID,
      pprfSubmissionId: PPRF_ID,
      version: 1,
      replayed: false,
    })
  })

  it('sends one exact command with canonical centavo strings', async () => {
    await expect(createPprfIntake(validForm())).resolves.toMatchObject({
      ok: true,
      opportunityId: OPPORTUNITY_ID,
      version: 1,
    })

    expect(mocks.submitIntake).toHaveBeenCalledTimes(1)
    expect(mocks.submitIntake).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, userId: USER_ID },
      expect.objectContaining({
        submissionId: SUBMISSION_ID,
        tcvCentavos: '123450',
        gpCentavos: '1203',
        closingDate: '2026-09-30',
      })
    )
  })

  it('rejects unknown and duplicate fields before the service', async () => {
    const hostile = validForm()
    hostile.append('client_name', 'Second value')
    hostile.set('tenant_id', TENANT_ID)

    await expect(createPprfIntake(hostile)).resolves.toMatchObject({ ok: false })
    expect(mocks.submitIntake).not.toHaveBeenCalled()
  })

  it('reports committed success when revalidation throws', async () => {
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error('cache unavailable')
    })

    await expect(createPprfIntake(validForm())).resolves.toMatchObject({
      ok: true,
      refreshFailed: true,
    })
    expect(mocks.submitIntake).toHaveBeenCalledTimes(1)
  })

  it.each(ROLES)('projects exact intake authority for %s', async (role) => {
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID }, tenantId: TENANT_ID, role,
    })
    mocks.can.mockImplementation((actualRole: string, capability: string) =>
      actualRole === role && ['owner', 'admin', 'sales'].includes(role) &&
      ['account.create', 'pprf.submit'].includes(capability)
    )

    const result = await createPprfIntake(validForm())
    expect(result.ok).toBe(['owner', 'admin', 'sales'].includes(role))
    expect(mocks.submitIntake).toHaveBeenCalledTimes(result.ok ? 1 : 0)
  })

  it('contains service rejection and malformed or mismatched results', async () => {
    mocks.submitIntake.mockResolvedValueOnce({
      ok: false,
      error: { code: 'DUPLICATE_ACCOUNT', message: 'An account with this name already exists.' },
    })
    await expect(createPprfIntake(validForm())).resolves.toEqual({
      ok: false, error: 'An account with this name already exists.',
    })

    mocks.submitIntake.mockResolvedValueOnce({ ok: true, kind: 'intake' })
    await expect(createPprfIntake(validForm())).resolves.toMatchObject({ ok: false })

    mocks.submitIntake.mockResolvedValueOnce({
      ok: true, kind: 'intake', tenantId: '77777777-7777-4777-8777-777777777777',
      accountId: ACCOUNT_ID, opportunityId: OPPORTUNITY_ID,
      pprfSubmissionId: PPRF_ID, version: 1, replayed: false,
    })
    await expect(createPprfIntake(validForm())).resolves.toMatchObject({ ok: false })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('contains missing auth and thrown service failures without refresh', async () => {
    mocks.requireUserProfile.mockRejectedValueOnce(new Error('no session'))
    await expect(createPprfIntake(validForm())).resolves.toMatchObject({ ok: false })
    mocks.submitIntake.mockRejectedValueOnce(new Error('transport failed'))
    await expect(createPprfIntake(validForm())).resolves.toMatchObject({ ok: false })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects ambiguous money and invalid calendar dates without conversion or writes', async () => {
    for (const value of [' 1.00', '1e3', '01.00', '-1', '1.001']) {
      const form = validForm()
      form.set('tcv', value)
      await expect(createPprfIntake(form)).resolves.toMatchObject({ ok: false })
    }
    const badDate = validForm()
    badDate.set('closing_date', '2026-02-30')
    await expect(createPprfIntake(badDate)).resolves.toMatchObject({ ok: false })
    expect(mocks.submitIntake).not.toHaveBeenCalled()
  })

  it('has no local database, audit, SLA, or notification writer', () => {
    const source = readFileSync(new URL('./actions.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('@third-code-erp/database')
    expect(source).not.toContain('writeAuditLog')
    expect(source).not.toContain('startSlaClock')
    expect(source).not.toContain('notifyRoles')
    expect(source).not.toContain('Number(centavos')
  })
})
