import { describe, expect, it } from 'vitest'
import {
  centsToPesoInput,
  isOpportunityClosed,
  manilaDateKey,
  OPPORTUNITY_MONEY_ERROR,
  parseOpportunityEditForm,
  planOpportunityUpdate,
  weightedTcvCents,
  type OpportunityEditCurrent,
  type OpportunityEditInput,
} from './opportunity-update'

const OPPORTUNITY_ID = '11111111-1111-4111-8111-111111111111'
const REP_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  data.set('opportunity_id', OPPORTUNITY_ID)
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const CURRENT: OpportunityEditCurrent = {
  tcv_cents: 1_000_000,
  gp_cents: 200_000,
  probability: 40,
  weighted_tcv_cents: 400_000,
  closing_date: new Date('2026-12-01T00:00:00+08:00'),
  area_sqm: 120,
  opportunity_type: 'fit_out',
  remarks: 'Initial remarks',
  rep_id: REP_ID,
  project_id: null,
}

const UNCHANGED: OpportunityEditInput = {
  tcvCents: 1_000_000,
  gpCents: 200_000,
  closingDate: '2026-12-01',
  areaSqm: 120,
  opportunityType: 'fit_out',
  remarks: 'Initial remarks',
  repId: null,
  projectId: null,
}

describe('weightedTcvCents', () => {
  it('rounds half up like the Core stage command', () => {
    expect(weightedTcvCents(1_000_000, 40)).toBe(400_000)
    // 12345 x 50% = 6172.5 -> 6173
    expect(weightedTcvCents(12_345, 50)).toBe(6_173)
    // 1 x 10% = 0.1 -> 0 ; 5 x 10% = 0.5 -> 1
    expect(weightedTcvCents(1, 10)).toBe(0)
    expect(weightedTcvCents(5, 10)).toBe(1)
  })

  it('stays exact at the largest accepted amount', () => {
    expect(weightedTcvCents(100_000_000_000, 100)).toBe(100_000_000_000)
    expect(weightedTcvCents(99_999_999_999, 55)).toBe(54_999_999_999)
  })
})

describe('isOpportunityClosed', () => {
  it.each(['won', 'lost', 'closed_won', 'closed_lost'] as const)('closes %s', (stage) => {
    expect(isOpportunityClosed(stage)).toBe(true)
  })

  it.each(['lead', 'site_survey', 'design', 'bom_submission', 'negotiation', 'contract', 'opportunity_creation', 'scoping', 'resubmission'] as const)(
    'keeps %s editable',
    (stage) => {
      expect(isOpportunityClosed(stage)).toBe(false)
    }
  )
})

describe('money and date text', () => {
  it('prints centavos as peso text without float math', () => {
    expect(centsToPesoInput(0)).toBe('0.00')
    expect(centsToPesoInput(5)).toBe('0.05')
    expect(centsToPesoInput(123_456)).toBe('1234.56')
    expect(centsToPesoInput(-250_075)).toBe('-2500.75')
  })

  it('reads the Manila calendar day of a stored instant', () => {
    expect(manilaDateKey(new Date('2026-12-01T00:00:00+08:00'))).toBe('2026-12-01')
    expect(manilaDateKey(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12-01')
    expect(manilaDateKey(null)).toBeNull()
  })
})

describe('parseOpportunityEditForm', () => {
  it('parses exact pesos, a signed GP and blank optional fields', () => {
    const parsed = parseOpportunityEditForm(
      form({ tcv: '1250000.50', gp: '-1000', closing_date: '', area_sqm: '', opportunity_type: '', remarks: '  ', rep_id: '', project_id: '' })
    )
    expect(parsed).toEqual({
      ok: true,
      opportunityId: OPPORTUNITY_ID,
      input: {
        tcvCents: 125_000_050,
        gpCents: -100_000,
        closingDate: null,
        areaSqm: null,
        opportunityType: null,
        remarks: null,
        repId: null,
        projectId: null,
      },
    })
  })

  it('refuses negative, over-precise, non-numeric and over-cap money', () => {
    const invalid: Array<Record<string, string>> = [
      { tcv: '-1', gp: '0' },
      { tcv: '1.234', gp: '0' },
      { tcv: 'abc', gp: '0' },
      { tcv: '1000000000.01', gp: '0' },
      { tcv: '0', gp: '-1000000000.01' },
    ]
    for (const fields of invalid) {
      expect(parseOpportunityEditForm(form(fields)), JSON.stringify(fields)).toEqual({
        ok: false,
        error: OPPORTUNITY_MONEY_ERROR,
      })
    }
  })

  it('refuses an impossible closing date, a non-whole area and bad ids', () => {
    expect(parseOpportunityEditForm(form({ closing_date: '2026-02-30' }))).toMatchObject({ ok: false })
    expect(parseOpportunityEditForm(form({ closing_date: 'tomorrow' }))).toMatchObject({ ok: false })
    expect(parseOpportunityEditForm(form({ area_sqm: '12.5' }))).toMatchObject({ ok: false })
    expect(parseOpportunityEditForm(form({ area_sqm: '0' }))).toMatchObject({ ok: false })
    expect(parseOpportunityEditForm(form({ rep_id: 'nope' }))).toMatchObject({ ok: false })
    expect(parseOpportunityEditForm(form({ project_id: 'nope' }))).toMatchObject({ ok: false })
    const noId = new FormData()
    expect(parseOpportunityEditForm(noId)).toEqual({ ok: false, error: 'Opportunity not found.' })
  })

  it('refuses over-long remarks', () => {
    expect(parseOpportunityEditForm(form({ remarks: 'x'.repeat(5001) }))).toMatchObject({ ok: false })
    expect(parseOpportunityEditForm(form({ remarks: 'x'.repeat(5000) }))).toMatchObject({ ok: true })
  })
})

describe('planOpportunityUpdate', () => {
  it('plans nothing for an unchanged form', () => {
    expect(planOpportunityUpdate(CURRENT, UNCHANGED)).toEqual({ ok: true, set: {}, diff: {} })
  })

  it('recomputes the weighted value from the stored probability when TCV changes', () => {
    const plan = planOpportunityUpdate(CURRENT, { ...UNCHANGED, tcvCents: 12_345_00 })
    expect(plan).toMatchObject({
      ok: true,
      set: { tcv_cents: 1_234_500, weighted_tcv_cents: 493_800 },
      diff: {
        tcv_cents: { before: 1_000_000, after: 1_234_500 },
        weighted_tcv_cents: { before: 400_000, after: 493_800 },
      },
    })
  })

  it('records before and after for each changed field only', () => {
    const plan = planOpportunityUpdate(CURRENT, {
      ...UNCHANGED,
      gpCents: -5_000,
      closingDate: '2027-01-15',
      areaSqm: null,
      opportunityType: 'mep',
      remarks: null,
      repId: PROJECT_ID,
    })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(Object.keys(plan.diff).sort()).toEqual([
      'area_sqm',
      'closing_date',
      'gp_cents',
      'opportunity_type',
      'remarks',
      'rep_id',
    ])
    expect(plan.diff.closing_date).toEqual({ before: '2026-12-01', after: '2027-01-15' })
    expect(plan.set.closing_date?.toISOString()).toBe('2027-01-14T16:00:00.000Z')
    expect(plan.set.area_sqm).toBeNull()
    expect(plan.set.remarks).toBeNull()
    expect(plan.set.weighted_tcv_cents).toBeUndefined()
  })

  it('keeps a legacy type that is already stored but refuses a new unknown one', () => {
    const legacy = { ...CURRENT, opportunity_type: 'mixed' }
    expect(planOpportunityUpdate(legacy, { ...UNCHANGED, opportunityType: 'mixed' })).toMatchObject({
      ok: true,
      set: {},
    })
    expect(planOpportunityUpdate(CURRENT, { ...UNCHANGED, opportunityType: 'plumbing' })).toEqual({
      ok: false,
      error: 'Choose a valid opportunity type.',
    })
  })

  it('links a project once and never replaces an existing link', () => {
    expect(planOpportunityUpdate(CURRENT, { ...UNCHANGED, projectId: PROJECT_ID })).toMatchObject({
      ok: true,
      set: { project_id: PROJECT_ID },
      diff: { project_id: { before: null, after: PROJECT_ID } },
    })

    const linked = { ...CURRENT, project_id: PROJECT_ID }
    expect(planOpportunityUpdate(linked, { ...UNCHANGED, projectId: PROJECT_ID })).toEqual({
      ok: true,
      set: {},
      diff: {},
    })
    expect(
      planOpportunityUpdate(linked, { ...UNCHANGED, projectId: REP_ID })
    ).toMatchObject({ ok: false })
  })

  it('does not treat the same Manila day stored as UTC midnight as a change', () => {
    const utcMidnight = { ...CURRENT, closing_date: new Date('2026-12-01T00:00:00Z') }
    expect(planOpportunityUpdate(utcMidnight, UNCHANGED)).toEqual({ ok: true, set: {}, diff: {} })
  })
})
