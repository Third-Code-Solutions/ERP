import {
  projectTypeValues,
  STAGE_LEGACY_MAP,
  weightedTCV,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { parseOpportunityCents } from '@/lib/operations/scope-money'

const MAX_AREA_SQM = 100_000_000
const MAX_REMARKS_LENGTH = 5000
const MAX_TYPE_LENGTH = 100
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const OPPORTUNITY_MONEY_ERROR =
  'TCV must be a peso amount from 0 to 1,000,000,000 and GP from -1,000,000,000 to 1,000,000,000, with at most 2 decimals.'
export const STALE_OPPORTUNITY_EDIT_ERROR =
  'This opportunity changed since you opened it. Reload the page and make your changes again.'

/** A field the form did not send is undefined and stays unchanged; blank text is null and clears it. */
export interface OpportunityEditInput {
  tcvCents?: number
  gpCents?: number
  /** YYYY-MM-DD in Manila time, or null to clear. */
  closingDate?: string | null
  areaSqm?: number | null
  opportunityType?: string | null
  remarks?: string | null
  /** Null keeps the current rep. */
  repId: string | null
  /** Null means no link was requested. */
  projectId: string | null
}

export interface OpportunityEditCurrent {
  tcv_cents: number
  gp_cents: number
  probability: number
  weighted_tcv_cents: number
  closing_date: Date | null
  area_sqm: number | null
  opportunity_type: string | null
  remarks: string | null
  rep_id: string | null
  project_id: string | null
}

export interface OpportunityEditChanges {
  tcv_cents?: number
  gp_cents?: number
  weighted_tcv_cents?: number
  closing_date?: Date | null
  area_sqm?: number | null
  opportunity_type?: string | null
  remarks?: string | null
  rep_id?: string
  project_id?: string
}

export type OpportunityEditDiff = Record<
  string,
  { before: string | number | null; after: string | number | null }
>

export type OpportunityEditParse =
  | {
      ok: true
      opportunityId: string
      /** The row's updated_at when the form was rendered; a save against a newer row is refused. */
      expectedUpdatedAt: Date
      input: OpportunityEditInput
    }
  | { ok: false; error: string }

export type OpportunityEditPlan =
  | { ok: true; set: OpportunityEditChanges; diff: OpportunityEditDiff }
  | { ok: false; error: string }

/** Won and Lost (current or legacy names) are final; the stage command owns them. */
export function isOpportunityClosed(stage: OpportunityStage): boolean {
  const canonical = STAGE_LEGACY_MAP[stage]
  return canonical === 'won' || canonical === 'lost'
}

/** Integer centavos as the plain peso text the form accepts, without float math. */
export function centsToPesoInput(cents: number): string {
  const absolute = Math.abs(cents)
  const pesos = Math.floor(absolute / 100)
  const centavos = String(absolute % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}${pesos}.${centavos}`
}

/** Manila calendar day of a stored instant, as YYYY-MM-DD. */
export function manilaDateKey(value: Date | null): string | null {
  if (!value) return null
  return new Date(value.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10)
}

function textOrNull(value: FormDataEntryValue | null): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function parseClosingDate(value: FormDataEntryValue | null): string | null | undefined {
  const text = textOrNull(value)
  if (text === null || text === undefined) return text
  if (!DATE_PATTERN.test(text)) return undefined
  const parsed = new Date(`${text}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return undefined
  }
  return text
}

function parseUuidOrNull(value: FormDataEntryValue | null): string | null | undefined {
  const text = textOrNull(value)
  if (text === null || text === undefined) return text
  return UUID_PATTERN.test(text) ? text.toLowerCase() : undefined
}

function parseArea(value: FormDataEntryValue | null): number | null | undefined {
  const text = textOrNull(value)
  if (text === null || text === undefined) return text
  const area = /^\d{1,9}$/.test(text) ? Number(text) : Number.NaN
  return Number.isSafeInteger(area) && area >= 1 && area <= MAX_AREA_SQM ? area : undefined
}

function parseOptionalText(
  value: FormDataEntryValue | null,
  maxLength: number
): string | null | undefined {
  const text = textOrNull(value)
  return text !== undefined && (text?.length ?? 0) <= maxLength ? text : undefined
}

function parseExpectedUpdatedAt(value: FormDataEntryValue | null): Date | undefined {
  if (typeof value !== 'string' || value.length > 40) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const FIELD_ERRORS = {
  tcv: OPPORTUNITY_MONEY_ERROR,
  gp: OPPORTUNITY_MONEY_ERROR,
  closing_date: 'Closing date must be a valid date.',
  area_sqm: 'Area must be a whole number of square metres.',
  opportunity_type: 'Choose a valid opportunity type.',
  remarks: `Remarks must be ${MAX_REMARKS_LENGTH} characters or fewer.`,
} as const

export function parseOpportunityEditForm(form: FormData): OpportunityEditParse {
  const opportunityId = parseUuidOrNull(form.get('opportunity_id'))
  if (!opportunityId) return { ok: false, error: 'Opportunity not found.' }

  const expectedUpdatedAt = parseExpectedUpdatedAt(form.get('expected_updated_at'))
  if (!expectedUpdatedAt) return { ok: false, error: STALE_OPPORTUNITY_EDIT_ERROR }

  // Only fields the form sent are parsed; undefined from a parser means invalid.
  const fields = {
    tcv: (value: FormDataEntryValue | null) => parseOpportunityCents(value),
    gp: (value: FormDataEntryValue | null) => parseOpportunityCents(value, { signed: true }),
    closing_date: parseClosingDate,
    area_sqm: parseArea,
    opportunity_type: (value: FormDataEntryValue | null) => parseOptionalText(value, MAX_TYPE_LENGTH),
    remarks: (value: FormDataEntryValue | null) => parseOptionalText(value, MAX_REMARKS_LENGTH),
  }
  const sent: Partial<{ [K in keyof typeof fields]: Exclude<ReturnType<(typeof fields)[K]>, undefined> }> = {}
  for (const name of Object.keys(fields) as Array<keyof typeof fields>) {
    if (!form.has(name)) continue
    const value = fields[name](form.get(name))
    if (value === undefined) return { ok: false, error: FIELD_ERRORS[name] }
    Object.assign(sent, { [name]: value })
  }

  const repId = parseUuidOrNull(form.get('rep_id'))
  if (repId === undefined) return { ok: false, error: 'Choose a valid sales owner.' }

  const projectId = parseUuidOrNull(form.get('project_id'))
  if (projectId === undefined) return { ok: false, error: 'Choose a valid project.' }

  return {
    ok: true,
    opportunityId,
    expectedUpdatedAt,
    input: {
      tcvCents: sent.tcv,
      gpCents: sent.gp,
      closingDate: sent.closing_date,
      areaSqm: sent.area_sqm,
      opportunityType: sent.opportunity_type,
      remarks: sent.remarks,
      repId,
      projectId,
    },
  }
}

/**
 * Field-by-field difference between the locked row and the submitted form.
 * Only changed fields appear in `set`/`diff`, so an unchanged save writes and
 * audits nothing. The project link is one-time: once set it is never replaced.
 */
export function planOpportunityUpdate(
  current: OpportunityEditCurrent,
  input: OpportunityEditInput
): OpportunityEditPlan {
  const set: OpportunityEditChanges = {}
  const diff: OpportunityEditDiff = {}

  if (
    input.opportunityType != null &&
    input.opportunityType !== current.opportunity_type &&
    !(projectTypeValues as readonly string[]).includes(input.opportunityType)
  ) {
    return { ok: false, error: 'Choose a valid opportunity type.' }
  }
  if (
    input.projectId !== null &&
    current.project_id !== null &&
    input.projectId !== current.project_id
  ) {
    return {
      ok: false,
      error: 'This opportunity is already linked to a project. The link cannot be changed.',
    }
  }

  if (input.tcvCents !== undefined && input.tcvCents !== current.tcv_cents) {
    set.tcv_cents = input.tcvCents
    diff.tcv_cents = { before: current.tcv_cents, after: input.tcvCents }
    const weighted = weightedTCV(input.tcvCents, current.probability)
    set.weighted_tcv_cents = weighted
    diff.weighted_tcv_cents = { before: current.weighted_tcv_cents, after: weighted }
  }
  if (input.gpCents !== undefined && input.gpCents !== current.gp_cents) {
    set.gp_cents = input.gpCents
    diff.gp_cents = { before: current.gp_cents, after: input.gpCents }
  }
  const currentDay = manilaDateKey(current.closing_date)
  if (input.closingDate !== undefined && input.closingDate !== currentDay) {
    // Date-only inputs are stored at Manila midnight, as the project opportunity form does.
    set.closing_date = input.closingDate ? new Date(`${input.closingDate}T00:00:00+08:00`) : null
    diff.closing_date = { before: currentDay, after: input.closingDate }
  }
  if (input.areaSqm !== undefined && input.areaSqm !== current.area_sqm) {
    set.area_sqm = input.areaSqm
    diff.area_sqm = { before: current.area_sqm, after: input.areaSqm }
  }
  if (input.opportunityType !== undefined && input.opportunityType !== current.opportunity_type) {
    set.opportunity_type = input.opportunityType
    diff.opportunity_type = { before: current.opportunity_type, after: input.opportunityType }
  }
  if (input.remarks !== undefined && input.remarks !== current.remarks) {
    set.remarks = input.remarks
    diff.remarks = { before: current.remarks, after: input.remarks }
  }
  if (input.repId !== null && input.repId !== current.rep_id) {
    set.rep_id = input.repId
    diff.rep_id = { before: current.rep_id, after: input.repId }
  }
  if (input.projectId !== null && current.project_id === null) {
    set.project_id = input.projectId
    diff.project_id = { before: null, after: input.projectId }
  }

  return { ok: true, set, diff }
}
