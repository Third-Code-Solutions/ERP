import { db, resolveTaxRates } from '@third-code-erp/database'
import { taxProfiles, users } from '@third-code-erp/database/schema'
import { TaxProfileOverlapError, type EffectiveTaxRates } from '@third-code-erp/shared-types'
import { and, asc, eq, inArray } from 'drizzle-orm'

// Spec tenancy: the read-only view ships dark until the owner flips it.
export function taxSettingsEnabled(): boolean {
  return process.env.ERP_TENANCY_ENABLED === 'true'
}

const ACTIVE_PROFILE_LIMIT = 50

export interface TaxProfileSummary {
  id: string
  code: string
  name: string
  validFrom: string
  validTo: string | null
  preparedBy: string
  approvedBy: string | null
  approvedAt: Date | null
}

export type TaxSettings =
  | {
      state: 'ok'
      rates: EffectiveTaxRates
      inForce: TaxProfileSummary | null
      upcoming: TaxProfileSummary[]
      lastEnded: TaxProfileSummary | null
    }
  | { state: 'conflict'; profileCodes: readonly string[]; asOf: string }

// Uses the same resolver as every money write, so the view shows exactly the
// rates a draft created now would use.
export async function loadTaxSettings(tenantId: string, at: Date): Promise<TaxSettings> {
  let rates: EffectiveTaxRates
  try {
    rates = await resolveTaxRates(db, tenantId, at)
  } catch (error) {
    if (error instanceof TaxProfileOverlapError) {
      return { state: 'conflict', profileCodes: error.profileCodes, asOf: error.asOf }
    }
    throw error
  }

  const rows = await db
    .select({
      id: taxProfiles.id,
      code: taxProfiles.code,
      name: taxProfiles.name,
      valid_from: taxProfiles.valid_from,
      valid_to: taxProfiles.valid_to,
      created_by: taxProfiles.created_by,
      approved_by: taxProfiles.approved_by,
      approved_at: taxProfiles.approved_at,
    })
    .from(taxProfiles)
    .where(and(eq(taxProfiles.tenant_id, tenantId), eq(taxProfiles.status, 'active')))
    .orderBy(asc(taxProfiles.valid_from))
    .limit(ACTIVE_PROFILE_LIMIT)

  const userIds = [
    ...new Set(rows.flatMap((row) => [row.created_by, row.approved_by]).filter((id): id is string => Boolean(id))),
  ]
  const people =
    userIds.length > 0
      ? await db
          .select({ id: users.id, full_name: users.full_name })
          .from(users)
          .where(and(eq(users.tenant_id, tenantId), inArray(users.id, userIds)))
      : []
  const nameOf = (id: string) => people.find((person) => person.id === id)?.full_name ?? 'Unknown user'

  const summaries: TaxProfileSummary[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    preparedBy: nameOf(row.created_by),
    approvedBy: row.approved_by ? nameOf(row.approved_by) : null,
    approvedAt: row.approved_at,
  }))
  // Latest valid_to before today; ISO dates compare as strings.
  const lastEnded = summaries.reduce<TaxProfileSummary | null>((latest, profile) => {
    if (profile.validTo === null || profile.validTo >= rates.asOf) return latest
    return latest?.validTo && latest.validTo >= profile.validTo ? latest : profile
  }, null)

  return {
    state: 'ok',
    rates,
    inForce: summaries.find((profile) => profile.id === rates.profileId) ?? null,
    upcoming: summaries.filter((profile) => profile.validFrom > rates.asOf),
    lastEnded,
  }
}
