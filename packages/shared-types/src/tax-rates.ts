// Tenant tax rates (spec tenancy C-1, C-4, §12). The single definition of the
// default rates: nothing else may hold the 12% / 2% / 10% literals.
export const TAX_DEFAULTS = Object.freeze({
  vatBps: 1200,
  ewtBps: 200,
  retentionBps: 1000,
  vatRegistered: true,
} as const)

export interface EffectiveTaxRates {
  vatBps: number
  ewtBps: number
  retentionBps: number
  vatRegistered: boolean
  source: 'default' | 'profile'
  profileId: string | null
  profileCode: string | null
  /** Manila calendar date, YYYY-MM-DD. */
  asOf: string
}

/** The `tax_profiles` Drizzle row shape (snake_case), so callers pass rows unmapped. */
export interface TaxProfileCandidate {
  id: string
  code: string
  status: string
  valid_from: string
  valid_to: string | null
  vat_rate_bps: number
  withholding_rate_bps: number
  retention_rate_bps: number
  vat_registered: boolean
}

export const TAX_PROFILE_OVERLAP = 'TAX_PROFILE_OVERLAP'

export class TaxProfileOverlapError extends Error {
  readonly code = TAX_PROFILE_OVERLAP

  constructor(
    readonly profileCodes: readonly string[],
    readonly asOf: string,
  ) {
    super(
      `${TAX_PROFILE_OVERLAP}: active tax profiles ${profileCodes.join(', ')} all cover ${asOf}`,
    )
    this.name = 'TaxProfileOverlapError'
  }
}

/**
 * C-1. Re-applies the active + in-date filter itself, so it is safe on
 * unfiltered rows. 0 candidates → TAX_DEFAULTS; 1 → that profile; ≥2 →
 * TaxProfileOverlapError (fail closed). Dates are YYYY-MM-DD, so string
 * comparison is calendar comparison.
 */
export function pickEffectiveTaxRates(
  rows: readonly TaxProfileCandidate[],
  asOf: string,
): EffectiveTaxRates {
  const candidates = rows.filter(
    (row) =>
      row.status === 'active' &&
      row.valid_from <= asOf &&
      (row.valid_to === null || row.valid_to >= asOf),
  )
  if (candidates.length > 1) {
    throw new TaxProfileOverlapError(
      candidates.map((row) => row.code).sort(),
      asOf,
    )
  }
  const [profile] = candidates
  if (!profile) {
    return {
      ...TAX_DEFAULTS,
      source: 'default',
      profileId: null,
      profileCode: null,
      asOf,
    }
  }
  return {
    vatBps: profile.vat_rate_bps,
    ewtBps: profile.withholding_rate_bps,
    retentionBps: profile.retention_rate_bps,
    vatRegistered: profile.vat_registered,
    source: 'profile',
    profileId: profile.id,
    profileCode: profile.code,
    asOf,
  }
}

/** C-4. Integer math: 1200 → "12%", 1250 → "12.5%", 125 → "1.25%". */
export function formatBps(bps: number): string {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new RangeError('Rate must be an integer between 0 and 10000 basis points')
  }
  const whole = Math.trunc(bps / 100)
  const fraction = bps % 100
  if (fraction === 0) return `${whole}%`
  return `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}%`
}

/** §12 invoice audit block. D-TEN-2: output VAT is 0 for a non-VAT tenant. */
export function invoiceTaxAudit(rates: EffectiveTaxRates) {
  return {
    vatBps: rates.vatRegistered ? rates.vatBps : 0,
    ewtBps: rates.ewtBps,
    retentionBps: rates.retentionBps,
    vatRegistered: rates.vatRegistered,
    source: rates.source,
    profileId: rates.profileId,
    profileCode: rates.profileCode,
    asOf: rates.asOf,
  }
}

/** §12 PO audit block. D-TEN-2: the tenant VAT flag never applies to POs. */
export function purchaseOrderTaxAudit(rates: EffectiveTaxRates) {
  return {
    vatBps: rates.vatBps,
    ewtBps: rates.ewtBps,
    source: rates.source,
    profileId: rates.profileId,
    profileCode: rates.profileCode,
    asOf: rates.asOf,
  }
}
