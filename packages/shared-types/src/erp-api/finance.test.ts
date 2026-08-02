import { describe, expect, it } from 'vitest'
import {
  journalPostCommandSchema,
  journalPostResultSchema,
  journalReverseCommandSchema,
  journalReverseResultSchema,
} from './finance'

const JOURNAL_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('finance API contracts', () => {
  it('keeps journal post commands free of caller authority', () => {
    expect(
      journalPostCommandSchema.parse({ journalEntryId: JOURNAL_ID })
    ).toEqual({ journalEntryId: JOURNAL_ID })
    expect(
      journalPostCommandSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
  })

  it('requires a strict server-derived posted result', () => {
    expect(
      journalPostResultSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
        postedNumber: 'JE-2026-000001',
      }).success
    ).toBe(true)
    expect(
      journalPostResultSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
        postedNumber: 'JE-1',
      }).success
    ).toBe(false)
  })

  it('keeps journal reversal commands free of caller authority', () => {
    expect(
      journalReverseCommandSchema.parse({
        journalEntryId: JOURNAL_ID,
        reason: 'Correct duplicate accrual',
        postingDate: '2026-08-02',
      })
    ).toEqual({
      journalEntryId: JOURNAL_ID,
      reason: 'Correct duplicate accrual',
      postingDate: '2026-08-02',
    })
    expect(
      journalReverseCommandSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        reason: 'ok',
        postingDate: '2026-02-02',
        tenantId: TENANT_ID,
      }).success
    ).toBe(false)
    expect(
      journalReverseCommandSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        reason: 'Valid reason',
        postingDate: '2026-02-31',
      }).success
    ).toBe(false)
  })

  it('requires a strict server-derived reversal result', () => {
    expect(
      journalReverseResultSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
        reversalJournalEntryId: '44444444-4444-4444-8444-444444444444',
        reversalNumber: 'JE-2026-000002',
      }).success
    ).toBe(true)
    expect(
      journalReverseResultSchema.safeParse({
        journalEntryId: JOURNAL_ID,
        tenantId: TENANT_ID,
        reversalJournalEntryId: '44444444-4444-4444-8444-444444444444',
        reversalNumber: 'JE-2',
      }).success
    ).toBe(false)
  })
})
