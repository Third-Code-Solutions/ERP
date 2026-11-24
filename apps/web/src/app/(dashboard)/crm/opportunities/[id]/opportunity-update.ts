import {
  projectTypeValues,
  STAGE_LEGACY_MAP,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { parsePesosToCents } from '@/lib/operations/scope-money'

// PHP 1,000,000,000 in centavos: the cap used by every other opportunity writer.
const MAX_OPPORTUNITY_CENTS = 100_000_000_000
const MAX_AREA_SQM = 100_000_000
const MAX_REMARKS_LENGTH = 5000
const MAX_TYPE_LENGTH = 100
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const OPPORTUNITY_MONEY_ERROR =
  'TCV must be a peso amount from 0 to 1,000,000,000 and GP from -1,000,000,000 to 1,000,000,000, with at most 2 decimals.'

export interface OpportunityEditInput {
  tcvCents: number
  gpCents: number
  /** YYYY-MM-DD in Manila time, or null to clear. */
  closingDate: string | null
  areaSqm: number | null
  opportunityType: string | null
  remarks: string | null
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
  | { ok: true; opportunityId: string; input: OpportunityEditInput }
  | { ok: false; error: string }

export type OpportunityEditPlan =
  | { ok: true; set: OpportunityEditChanges; diff: OpportunityEditDiff }
  | { ok: false; error: string }

/** Won and Lost (current or legacy names) are final; the stage command owns them. */
export function isOpportunityClosed(stage: OpportunityStage): boolean {
  const canonical = STAGE_LEGACY_MAP[stage]
  return canonical === 'won' || canonical === 'lost'
}

/** round(tcv x probability / 100), half up, on integers (same as the Core stage command). */
export function weightedTcvCents(tcvCents: number, probability: number): number {
  return Number((BigInt(tcvCents) * BigInt(probability) + BigInt(50)) / BigInt(100))
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

function parseCents(
  value: FormDataEntryValue | null,
  signed: boolean
): number | undefined {
  if (value === null) return 0
  if (typeof value !== 'string' || value.length > 32) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return 0
  const negative = signed && trimmed.startsWith('-')
  const cents = parsePesosToCents(negative ? trimmed.slice(1) : trimmed)
  if (cents === undefined || cents > MAX_OPPORTUNITY_CENTS) return undefined
  return negative && cents > 0 ? -cents : cents
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

export function parseOpportunityEditForm(form: FormData): OpportunityEditParse {
  const opportunityId = parseUuidOrNull(form.get('opportunity_id'))
  if (!opportunityId) return { ok: false, error: 'Opportunity not found.' }

  const tcvCents = parseCents(form.get('tcv'), false)
  const gpCents = parseCents(form.get('gp'), true)
  if (tcvCents === undefined || gpCents === undefined) {
    return { ok: false, error: OPPORTUNITY_MONEY_ERROR }
  }

  const closingDate = parseClosingDate(form.get('closing_date'))
  if (closingDate === undefined) {
    return { ok: false, error: 'Closing date must be a valid date.' }
  }

  const areaText = textOrNull(form.get('area_sqm'))
  let areaSqm: number | null = null
  if (areaText === undefined) return { ok: false, error: 'Area must be a whole number of square metres.' }
  if (areaText !== null) {
    areaSqm = /^\d{1,9}$/.test(areaText) ? Number(areaText) : Number.NaN
    if (!Number.isSafeInteger(areaSqm) || areaSqm < 1 || areaSqm > MAX_AREA_SQM) {
      return { ok: false, error: 'Area must be a whole number of square metres.' }
    }
  }

  const opportunityType = textOrNull(form.get('opportunity_type'))
  if (opportunityType === undefined || (opportunityType?.length ?? 0) > MAX_TYPE_LENGTH) {
    return { ok: false, error: 'Choose a valid opportunity type.' }
  }

  const remarks = textOrNull(form.get('remarks'))
  if (remarks === undefined || (remarks?.length ?? 0) > MAX_REMARKS_LENGTH) {
    return { ok: false, error: `Remarks must be ${MAX_REMARKS_LENGTH} characters or fewer.` }
  }

  const repId = parseUuidOrNull(form.get('rep_id'))
  if (repId === undefined) return { ok: false, error: 'Choose a valid sales owner.' }

  const projectId = parseUuidOrNull(form.get('project_id'))
  if (projectId === undefined) return { ok: false, error: 'Choose a valid project.' }

  return {
    ok: true,
    opportunityId,
    input: {
      tcvCents,
      gpCents,
      closingDate,
      areaSqm,
      opportunityType,
      remarks,
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
    input.opportunityType !== null &&
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

  if (input.tcvCents !== current.tcv_cents) {
    set.tcv_cents = input.tcvCents
    diff.tcv_cents = { before: current.tcv_cents, after: input.tcvCents }
    const weighted = weightedTcvCents(input.tcvCents, current.probability)
    set.weighted_tcv_cents = weighted
    diff.weighted_tcv_cents = { before: current.weighted_tcv_cents, after: weighted }
  }
  if (input.gpCents !== current.gp_cents) {
    set.gp_cents = input.gpCents
    diff.gp_cents = { before: current.gp_cents, after: input.gpCents }
  }
  const currentDay = manilaDateKey(current.closing_date)
  if (input.closingDate !== currentDay) {
    // Date-only inputs are stored at Manila midnight, as the project opportunity form does.
    set.closing_date = input.closingDate ? new Date(`${input.closingDate}T00:00:00+08:00`) : null
    diff.closing_date = { before: currentDay, after: input.closingDate }
  }
  if (input.areaSqm !== current.area_sqm) {
    set.area_sqm = input.areaSqm
    diff.area_sqm = { before: current.area_sqm, after: input.areaSqm }
  }
  if (input.opportunityType !== current.opportunity_type) {
    set.opportunity_type = input.opportunityType
    diff.opportunity_type = { before: current.opportunity_type, after: input.opportunityType }
  }
  if (input.remarks !== current.remarks) {
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
