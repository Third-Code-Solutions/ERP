import { describe, expect, it } from 'vitest'
import { allocateBomInvoice, manualLineTotal } from '../calculations'
import { bomQuantitySchema, scaledBomQuantity } from '../quantity'

describe('exact decimal quantity and explicit invoice pricing', () => {
  it('multiplies centavos by 0.1 and 12.5 with half-up rounding', () => {
    expect(scaledBomQuantity(0.1)).toBe(1000n)
    expect(manualLineTotal(5, 0.1)).toBe(1)
    expect(manualLineTotal(101, 12.5)).toBe(1263)
    expect(bomQuantitySchema.safeParse(0.12345).success).toBe(false)
    expect(bomQuantitySchema.safeParse(2147483648).success).toBe(false)
    expect(() => manualLineTotal(Number.MAX_SAFE_INTEGER, 12.5)).toThrow('exact number range')
  })
  it('allocates VAT already in the contract and keeps deductions out of revenue', () => {
    const result = allocateBomInvoice({ pricingBasis: 'reconciled_v1', sellingExVatCents: 11500, vatCents: 1200, billingPercentBps: 10000, retentionBps: 1000, withholdingBps: 200 })
    expect(result).toEqual({ subtotalCents: 11500, vatCents: 1200, retentionCents: 1150, withholdingTaxCents: 230, netAmountCents: 11320 })
    expect(result.netAmountCents + result.retentionCents + result.withholdingTaxCents).toBe(12700)
  })
  it('uses the same exact allocation for down payments and refuses ambiguous history', () => {
    const input = { pricingBasis: 'reconciled_v1', sellingExVatCents: 5, vatCents: 1, billingPercentBps: 5000, retentionBps: 0, withholdingBps: 0 }
    expect(allocateBomInvoice(input)).toMatchObject({ subtotalCents: 3, vatCents: 1, netAmountCents: 4 })
    expect(() => allocateBomInvoice({ ...input, pricingBasis: 'legacy_unreviewed' })).toThrow('reviewed revision')
  })
})
