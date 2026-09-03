'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  pprfIntakeCommandSchema,
  pprfSubmissionResultSchema,
  pprfSubmissionService,
} from '@/server/crm/pprf-submission-service'

const FIELD_NAMES = [
  'submission_id', 'client_name', 'industry', 'billing_address',
  'primary_email', 'primary_phone', 'tcv', 'gp', 'area_sqm',
  'closing_date', 'opportunity_type', 'remarks', 'site_address',
  'floor_area_sqm', 'landlord_contact', 'as_built_available',
  'scope_notes', 'project_type', 'expected_start_date', 'budget_range',
] as const
const FIELD_NAME_SET = new Set<string>(FIELD_NAMES)
const PESO_AMOUNT = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/
const POSITIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/
const POSITIVE_INTEGER = /^[1-9]\d*$/

function logOutcome(input: {
  traceId: string
  tenantId: string | null
  actorId: string | null
  outcome: string
  errorCode?: string
}): void {
  console.info(JSON.stringify({
    event: 'pprf_action',
    trace_id: input.traceId,
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    action: 'pprf.intake.submit',
    outcome: input.outcome,
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
  }))
}

function readStrictFields(formData: FormData):
  | { ok: true; values: Record<(typeof FIELD_NAMES)[number], string> }
  | { ok: false; error: string } {
  for (const [name] of formData.entries()) {
    if (!FIELD_NAME_SET.has(name)) {
      return { ok: false, error: `form: unexpected field "${name}"` }
    }
  }
  const values = {} as Record<(typeof FIELD_NAMES)[number], string>
  for (const name of FIELD_NAMES) {
    const entries = formData.getAll(name)
    if (entries.length !== 1 || typeof entries[0] !== 'string') {
      return { ok: false, error: `${name}: exactly one text value is required` }
    }
    values[name] = entries[0]
  }
  return { ok: true, values }
}

function pesoToCentavos(value: string): string | null {
  const normalized = value || '0'
  if (!PESO_AMOUNT.test(normalized)) return null
  const [whole = '0', fraction = ''] = normalized.split('.')
  return `${BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))}`
}

function positiveDecimal(value: string): number | null {
  if (!POSITIVE_DECIMAL.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function optionalPositiveInteger(value: string): number | undefined | null {
  if (!value) return undefined
  if (!POSITIVE_INTEGER.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function firstValidationError(error: {
  errors: Array<{ path: Array<string | number>; message: string }>
}): string {
  const first = error.errors[0]
  return `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}`
}

export async function createPprfIntake(formData: FormData) {
  const traceId = randomUUID()
  let tenantId: string | null = null
  let actorId: string | null = null
  try {
    const profile = await requireUserProfile()
    tenantId = profile.tenantId
    actorId = profile.user.id
    if (!can(profile.role, 'account.create') || !can(profile.role, 'pprf.submit')) {
      logOutcome({ traceId, tenantId, actorId, outcome: 'forbidden' })
      return { ok: false as const, error: 'You do not have permission to submit a PPRF intake.' }
    }

    const fields = readStrictFields(formData)
    if (!fields.ok) {
      logOutcome({ traceId, tenantId, actorId, outcome: 'validation_error' })
      return { ok: false as const, error: fields.error }
    }
    const tcvCentavos = pesoToCentavos(fields.values.tcv)
    const gpCentavos = pesoToCentavos(fields.values.gp)
    const floorAreaSqm = positiveDecimal(fields.values.floor_area_sqm)
    const areaSqm = optionalPositiveInteger(fields.values.area_sqm)
    if (tcvCentavos === null || gpCentavos === null || floorAreaSqm === null || areaSqm === null) {
      logOutcome({ traceId, tenantId, actorId, outcome: 'validation_error' })
      return { ok: false as const, error: 'form: invalid numeric value' }
    }

    const parsed = pprfIntakeCommandSchema.safeParse({
      submissionId: fields.values.submission_id,
      clientName: fields.values.client_name,
      industry: fields.values.industry || undefined,
      billingAddress: fields.values.billing_address || undefined,
      primaryEmail: fields.values.primary_email || undefined,
      primaryPhone: fields.values.primary_phone || undefined,
      tcvCentavos,
      gpCentavos,
      areaSqm,
      closingDate: fields.values.closing_date || undefined,
      opportunityType: fields.values.opportunity_type || undefined,
      remarks: fields.values.remarks || undefined,
      pprf: {
        siteAddress: fields.values.site_address,
        floorAreaSqm,
        landlordContact: fields.values.landlord_contact,
        asBuiltAvailable: fields.values.as_built_available,
        scopeNotes: fields.values.scope_notes,
        projectType: fields.values.project_type,
        expectedStartDate: fields.values.expected_start_date || undefined,
        budgetRange: fields.values.budget_range,
      },
    })
    if (!parsed.success) {
      logOutcome({ traceId, tenantId, actorId, outcome: 'validation_error' })
      return { ok: false as const, error: firstValidationError(parsed.error) }
    }

    const rawResult = await pprfSubmissionService.submitIntake(
      { tenantId, userId: actorId }, parsed.data
    )
    const checked = pprfSubmissionResultSchema.safeParse(rawResult)
    if (!checked.success) {
      logOutcome({ traceId, tenantId, actorId, outcome: 'service_contract_failure' })
      return { ok: false as const, error: 'The PPRF service returned an invalid response. Please retry.' }
    }
    if (!checked.data.ok) {
      logOutcome({
        traceId, tenantId, actorId,
        outcome: checked.data.error.code === 'CONFLICT' ? 'conflict' : 'service_rejected',
        errorCode: checked.data.error.code,
      })
      return { ok: false as const, error: checked.data.error.message }
    }
    if (checked.data.kind !== 'intake' || checked.data.tenantId !== tenantId || checked.data.version !== 1) {
      logOutcome({ traceId, tenantId, actorId, outcome: 'service_contract_failure' })
      return { ok: false as const, error: 'The PPRF service response did not match this submission. Please retry.' }
    }

    let refreshFailed = false
    try {
      revalidatePath('/crm/accounts')
      revalidatePath('/crm/kyc-queue')
      revalidatePath('/pipeline')
    } catch {
      refreshFailed = true
    }
    logOutcome({
      traceId, tenantId, actorId,
      outcome: refreshFailed ? 'success_refresh_failed' : 'success',
    })
    return {
      ok: true as const,
      kind: checked.data.kind,
      accountId: checked.data.accountId,
      opportunityId: checked.data.opportunityId,
      pprfSubmissionId: checked.data.pprfSubmissionId,
      version: checked.data.version,
      replayed: checked.data.replayed,
      refreshFailed,
    }
  } catch {
    logOutcome({ traceId, tenantId, actorId, outcome: 'unexpected_error' })
    return { ok: false as const, error: 'Unable to submit the PPRF intake. Please retry.' }
  }
}
