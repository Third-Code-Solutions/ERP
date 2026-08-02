import { describe, expect, it } from 'vitest'
import {
  journalPostCommandSchema,
  journalPostResultSchema,
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
})
