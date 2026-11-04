import { describe, expect, it } from 'vitest'
import {
  togalBomCommitCommandSchema,
  togalBomCommitResultSchema,
} from './togal-bom'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('Togal BOM commit API contracts', () => {
  it('accepts strict tenant-free reviewed line commands with whole quantities', () => {
    const command = {
      bomId: UUID,
      proposedLines: [
        {
          materialItemId: UUID,
          code: 'WALL-01',
          description: 'Ready-mix concrete',
          unit: 'm3',
          qty: 4,
          unitCostCents: 12_500,
          markupBps: 3_000,
          vendorId: null,
          sourceLabel: 'Wall - Concrete',
          notes: 'Reviewed by estimator',
        },
      ],
      markupBps: 3_000,
    }
    expect(togalBomCommitCommandSchema.parse(command)).toEqual(command)
  })

  it('rejects caller authority, unsafe quantities, and oversized payloads', () => {
    const base = {
      bomId: UUID,
      proposedLines: [
        {
          description: 'Concrete',
          qty: 1,
          unitCostCents: 100,
        },
      ],
    }
    expect(
      togalBomCommitCommandSchema.safeParse({ ...base, tenantId: UUID })
        .success
    ).toBe(false)
    expect(
      togalBomCommitCommandSchema.safeParse({
        ...base,
        proposedLines: [{ ...base.proposedLines[0], qty: Number.NaN }],
      }).success
    ).toBe(false)
    expect(
      togalBomCommitCommandSchema.safeParse({
        ...base,
        proposedLines: [{ ...base.proposedLines[0], qty: -1 }],
      }).success
    ).toBe(false)
    expect(
      togalBomCommitCommandSchema.safeParse({
        ...base,
        proposedLines: [
          ...Array.from({ length: 501 }, () => base.proposedLines[0]),
        ],
      }).success
    ).toBe(false)
  })

  // D-5: BOQ quantity is numeric(18,4); fractional takeoff quantities are
  // accepted exactly up to 4 decimal places and rejected beyond, never rounded.
  it('accepts quantities with up to 4 decimal places and rejects finer or negative ones', () => {
    const withQty = (qty: number) =>
      togalBomCommitCommandSchema.safeParse({
        bomId: UUID,
        proposedLines: [{ description: 'Concrete', qty, unitCostCents: 100 }],
      }).success
    for (const qty of [0, 0.1, 12.5, 0.0001, 1.2345, 2_147_483_647]) {
      expect(withQty(qty)).toBe(true)
    }
    for (const qty of [0.00001, 1.23456, -0.5, -1, 2_147_483_648, Number.POSITIVE_INFINITY]) {
      expect(withQty(qty)).toBe(false)
    }
  })

  it('requires server-derived tenant identity in result', () => {
    expect(
      togalBomCommitResultSchema.safeParse({
        ok: true,
        linesCreated: 1,
        bomId: UUID,
        tenantId: UUID,
        totalCostCents: 10_000,
        tcvCents: 13_000,
        gpCents: 3_000,
        gpMarginBps: 2_308,
      }).success
    ).toBe(true)
    expect(
      togalBomCommitResultSchema.safeParse({
        ok: true,
        linesCreated: 1,
        bomId: UUID,
        totalCostCents: 10_000,
        tcvCents: 13_000,
        gpCents: 3_000,
        gpMarginBps: 2_308,
      }).success
    ).toBe(false)
  })
})
