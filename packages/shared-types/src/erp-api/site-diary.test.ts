import { describe, expect, it } from 'vitest'
import {
  createSiteDiaryCommandSchema,
  siteDiaryListQuerySchema,
  siteDiaryMutationResultSchema,
} from './site-diary'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'

describe('site diary contracts', () => {
  it('normalizes filters and rejects reversed or invalid dates', () => {
    expect(siteDiaryListQuerySchema.parse({ fromDate: '2026-09-01', toDate: '2026-09-10', page: '2' })).toMatchObject({
      fromDate: '2026-09-01',
      toDate: '2026-09-10',
      page: 2,
      limit: 25,
    })
    expect(siteDiaryListQuerySchema.safeParse({ fromDate: '2026-09-10', toDate: '2026-09-01' }).success).toBe(false)
    expect(siteDiaryListQuerySchema.safeParse({ fromDate: '2026-02-30' }).success).toBe(false)
  })

  it('keeps create commands strict and bounded', () => {
    expect(createSiteDiaryCommandSchema.parse({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      manpowerCount: 14,
      weather: 'Cloudy',
      workCompleted: 'MEP rough-in progressed.',
    })).toMatchObject({ constraints: '', safetyNotes: '' })
    expect(createSiteDiaryCommandSchema.safeParse({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      manpowerCount: -1,
      injected: true,
    }).success).toBe(false)
  })

  it('requires submitted metadata for a submitted row', () => {
    expect(siteDiaryMutationResultSchema.safeParse({
      projectId: PROJECT_ID,
      changed: true,
      entry: {
        id: ENTRY_ID,
        projectId: PROJECT_ID,
        diaryDate: '2026-09-10',
        status: 'submitted',
        weather: '',
        manpowerCount: 0,
        workCompleted: '',
        constraints: '',
        safetyNotes: '',
        createdBy: USER_ID,
        submittedAt: '2026-09-10T08:00:00.000Z',
        submittedBy: USER_ID,
        version: 2,
        createdAt: '2026-09-10T07:00:00.000Z',
        updatedAt: '2026-09-10T08:00:00.000Z',
      },
    }).success).toBe(true)
  })
})
