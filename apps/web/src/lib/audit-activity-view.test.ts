import { describe, expect, it } from 'vitest'
import {
  auditActivityHref,
  parseAuditActivityViewParams,
} from './audit-activity-view'

describe('audit activity view filters', () => {
  it('defaults malformed or missing filters to the first page', () => {
    expect(
      parseAuditActivityViewParams({
        action: 'drop-table',
        entityType: 'users',
        page: 'not-a-number',
      })
    ).toEqual({ action: undefined, entityType: undefined, page: 1 })
  })

  it('accepts bounded supported filters and repeated query values', () => {
    expect(
      parseAuditActivityViewParams({
        action: ['approve', 'delete'],
        entityType: 'purchase_order',
        page: '100001',
      })
    ).toEqual({ action: 'approve', entityType: 'purchase_order', page: 100_000 })
  })

  it('builds stable filter links without a page=1 query', () => {
    const filters = parseAuditActivityViewParams({
      action: 'stage_change',
      entityType: 'project',
      page: '1',
    })
    expect(auditActivityHref('/projects/p-1/audit', filters)).toBe(
      '/projects/p-1/audit?action=stage_change&entityType=project'
    )
    expect(auditActivityHref('/projects/p-1/audit', filters, 2)).toBe(
      '/projects/p-1/audit?action=stage_change&entityType=project&page=2'
    )
  })
})
