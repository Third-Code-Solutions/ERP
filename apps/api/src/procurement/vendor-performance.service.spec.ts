import { describe, expect, it } from 'vitest'
import type { DatabaseService } from '../database/database.service'
import { VendorPerformanceService } from './vendor-performance.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const VENDOR_ID = '44444444-4444-4444-8444-444444444444'

function databaseFor(results: unknown[]): DatabaseService {
  let selectIndex = 0
  const client = {
    select: () => {
      const value = results[selectIndex++]
      const chain: Record<string, unknown> = {}
      for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'groupBy']) {
        chain[method] = () => chain
      }
      chain.limit = () => chain
      chain.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(value).then(resolve, reject)
      return chain
    },
  }
  return { client } as unknown as DatabaseService
}

describe('VendorPerformanceService', () => {
  it('combines tenant-scoped PO, delivery, and supplier-bill evidence', async () => {
    const service = new VendorPerformanceService(
      databaseFor([
        [{ tenantId: TENANT_ID, role: 'procurement', email: 'procurement@example.test' }],
        [{ vendorId: VENDOR_ID, vendorName: 'Concrete Supply' }],
        [{
          vendorId: VENDOR_ID,
          vendorName: 'Concrete Supply',
          poCount: '2',
          issuedPoCount: '2',
          openPoCount: '1',
          committedCents: '125000',
        }],
        [{
          vendorId: VENDOR_ID,
          deliveryCount: '2',
          acceptedDeliveryCount: '2',
          rejectedDeliveryCount: '0',
          onTimeDeliveryCount: '2',
          averageLeadTimeDays: '4.4',
        }],
        [{
          vendorId: VENDOR_ID,
          supplierBillCount: '1',
          postedBillCount: '1',
          postedSpendCents: '90000',
        }],
      ]),
    )

    const result = await service.read(
      {},
      { userId: USER_ID, tenantId: TENANT_ID, role: 'procurement', email: 'procurement@example.test' },
      new Date('2026-09-10T00:00:00.000Z'),
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      vendorId: VENDOR_ID,
      onTimeRateBps: 10_000,
      acceptanceRateBps: 10_000,
      averageLeadTimeDays: 4,
      postedSpendCents: 90_000,
      risk: 'good',
    })
    expect(result.totals).toMatchObject({
      vendorsWithOrders: 1,
      committedCents: 125_000,
      postedSpendCents: 90_000,
    })
  })
})
