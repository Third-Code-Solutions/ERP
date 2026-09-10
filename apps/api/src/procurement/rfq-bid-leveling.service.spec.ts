import { describe, expect, it } from 'vitest'
import type { DatabaseService } from '../database/database.service'
import { RfqBidLevelingService } from './rfq-bid-leveling.service'

const RFQ_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const LINE_ID = '55555555-5555-4555-8555-555555555555'
const MATERIAL_ID = '66666666-6666-4666-8666-666666666666'
const VENDOR_ID = '77777777-7777-4777-8777-777777777777'
const QUOTE_ID = '88888888-8888-4888-8888-888888888888'

function databaseFor(results: unknown[]): DatabaseService {
  let selectIndex = 0
  const client = {
    select: () => {
      const value = results[selectIndex++]
      const chain: Record<string, unknown> = {}
      for (const method of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy']) chain[method] = () => chain
      chain.limit = () => chain
      chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(value).then(resolve, reject)
      return chain
    },
  }
  return { client } as unknown as DatabaseService
}

describe('RfqBidLevelingService', () => {
  it('projects quote coverage and awards inside the authenticated tenant', async () => {
    const service = new RfqBidLevelingService(databaseFor([
      [{ role: 'commercial' }],
      [{
        id: RFQ_ID,
        status: 'quotes_received',
        lineItems: [{
          bom_line_item_id: LINE_ID,
          material_item_id: MATERIAL_ID,
          code: 'CEM-001',
          description: 'Cement',
          qty: 2,
          unit: 'bag',
        }],
        projectId: PROJECT_ID,
      }],
      [{
        quoteId: QUOTE_ID,
        bomLineItemId: LINE_ID,
        materialItemId: MATERIAL_ID,
        materialCode: 'CEM-001',
        vendorId: VENDOR_ID,
        vendorName: 'Concrete Supply',
        unitPriceCents: 10_000,
        leadTimeDays: 5,
        validUntil: new Date('2026-09-30T00:00:00.000Z'),
        createdAt: new Date('2026-09-10T00:00:00.000Z'),
      }],
      [{ quoteId: QUOTE_ID }],
    ]))

    const result = await service.read(
      RFQ_ID,
      { userId: USER_ID, tenantId: TENANT_ID, role: 'commercial', email: 'commercial@example.test' },
      new Date('2026-09-10T00:00:00.000Z'),
    )

    expect(result).toMatchObject({
      rfqId: RFQ_ID,
      coveredLineCount: 1,
      awardedQuoteCount: 1,
    })
    expect(result.lines[0]?.quotes[0]).toMatchObject({ isAwarded: true, isLowestPrice: true })
  })
})
