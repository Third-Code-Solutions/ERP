import { describe, expect, it } from 'vitest'
import { buildPurchaseOrderDuplicateGroups } from './data-quality-queries'

describe('purchase-order duplicate review report', () => {
  it('groups tenant-scoped records and counts statuses', () => {
    const report = buildPurchaseOrderDuplicateGroups(
      [
        {
          poNumber: 'PO-0002',
          recordCount: 3,
          firstCreatedAt: new Date('2026-05-13T13:42:51.212Z'),
          lastCreatedAt: new Date('2026-05-13T13:44:32.9Z'),
          projectCount: 1,
        },
      ],
      [
        {
          poNumber: 'PO-0002',
          id: 'po-1',
          projectId: 'project-1',
          status: 'draft',
          createdAt: new Date('2026-05-13T13:42:51.212Z'),
        },
        {
          poNumber: 'PO-0002',
          id: 'po-2',
          projectId: 'project-1',
          status: 'issued',
          createdAt: new Date('2026-05-13T13:43:30.585Z'),
        },
        {
          poNumber: 'PO-0002',
          id: 'po-3',
          projectId: 'project-1',
          status: 'issued',
          createdAt: new Date('2026-05-13T13:44:32.9Z'),
        },
      ],
    )

    expect(report).toHaveLength(1)
    expect(report[0]).toMatchObject({
      poNumber: 'PO-0002',
      recordCount: 3,
      recordsOmitted: 0,
      projectCount: 1,
      statusCounts: { draft: 1, issued: 2 },
    })
    expect(report[0]?.records.map((record) => record.id)).toEqual([
      'po-1',
      'po-2',
      'po-3',
    ])
  })

  it('keeps empty groups safe and reports omitted records when capped', () => {
    expect(buildPurchaseOrderDuplicateGroups([], [])).toEqual([])

    const records = Array.from({ length: 105 }, (_, index) => ({
      poNumber: 'PO-OVERFLOW',
      id: `po-${index}`,
      projectId: 'project-1',
      status: 'draft',
      createdAt: null,
    }))
    const [group] = buildPurchaseOrderDuplicateGroups(
      [
        {
          poNumber: 'PO-OVERFLOW',
          recordCount: 105,
          firstCreatedAt: null,
          lastCreatedAt: null,
          projectCount: 1,
        },
      ],
      records,
    )

    expect(group?.records).toHaveLength(100)
    expect(group?.recordsOmitted).toBe(5)
  })
})
