import { and, eq, gte, isNull, lte, or, type SQL } from 'drizzle-orm'
import {
  manilaCalendarDate,
  pickEffectiveTaxRates,
  type EffectiveTaxRates,
} from '@third-code-erp/shared-types'
import type { Database } from '../client'
import { taxProfiles } from '../schema/roadmap'

/**
 * Spec tenancy C-1 candidates: the tenant's active profiles in force on the
 * Manila date. The tenant predicate comes first; Drizzle bypasses RLS.
 */
export function effectiveTaxProfilesCondition(
  tenantId: string,
  asOf: string,
): SQL | undefined {
  return and(
    eq(taxProfiles.tenant_id, tenantId),
    eq(taxProfiles.status, 'active'),
    lte(taxProfiles.valid_from, asOf),
    or(isNull(taxProfiles.valid_to), gte(taxProfiles.valid_to, asOf)),
  )
}

/**
 * Effective VAT / EWT / retention for a tenant at an instant, shared by the
 * Core API and the web. Pass the write's transaction so the rates are read
 * with the write. The Manila date is derived here (R-8), never by callers.
 * No limit: every overlapping code is reported (fail closed).
 */
export async function resolveTaxRates(
  executor: Pick<Database, 'select'>,
  tenantId: string,
  at: Date,
): Promise<EffectiveTaxRates> {
  const asOf = manilaCalendarDate(at)
  const rows = await executor
    .select({
      id: taxProfiles.id,
      code: taxProfiles.code,
      status: taxProfiles.status,
      valid_from: taxProfiles.valid_from,
      valid_to: taxProfiles.valid_to,
      vat_rate_bps: taxProfiles.vat_rate_bps,
      withholding_rate_bps: taxProfiles.withholding_rate_bps,
      retention_rate_bps: taxProfiles.retention_rate_bps,
      vat_registered: taxProfiles.vat_registered,
    })
    .from(taxProfiles)
    .where(effectiveTaxProfilesCondition(tenantId, asOf))
  return pickEffectiveTaxRates(rows, asOf)
}
