import { describe, expect, it } from 'vitest'
import { humanizeToken, summarizeAuditDiff } from './audit-diff-summary'

describe('summarizeAuditDiff', () => {
  it('describes a status transition in words', () => {
    expect(summarizeAuditDiff({ status: { before: 'site_preparing', after: 'site_ready' } })).toBe(
      'Status: Site preparing → Site ready'
    )
  })

  it('skips ids and formats timestamps in Manila time', () => {
    const summary = summarizeAuditDiff({
      purchase_order_id: '33333333-3333-4333-8333-333333333333',
      scheduled_date: '2026-11-02T23:30:00.000Z',
    })
    expect(summary).not.toContain('3333')
    expect(summary).toMatch(/^Scheduled date: Nov 3, 2026/)
  })

  it('falls back to a dash for empty or non-object diffs', () => {
    expect(summarizeAuditDiff(null)).toBe('—')
    expect(summarizeAuditDiff({ nested: { a: 1 } })).toBe('—')
  })

  it('humanizes action tokens', () => {
    expect(humanizeToken('status_change')).toBe('Status change')
  })
})
