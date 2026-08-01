import { describe, expect, it } from 'vitest'
import {
  changeRequestCreationResultSchema,
  createChangeRequestCommandSchema,
} from './change-requests'

const VALID = {
  requestedByName: 'Client PM',
  description: 'Move the reception wall two metres east.',
  priority: 'major' as const,
  affectedDesignFileId: '33333333-3333-4333-8333-333333333333',
}

describe('Change Request ERP API contract', () => {
  it('accepts bounded command fields and defaults priority', () => {
    expect(
      createChangeRequestCommandSchema.parse({
        requestedByName: ' Client PM ',
        description: ' Move the wall. ',
      })
    ).toEqual({
      requestedByName: 'Client PM',
      description: 'Move the wall.',
      priority: 'minor',
    })
    expect(createChangeRequestCommandSchema.parse(VALID)).toEqual(VALID)
  })

  it('rejects tenant or actor authority in the browser body', () => {
    expect(
      createChangeRequestCommandSchema.safeParse({
        ...VALID,
        tenantId: '22222222-2222-4222-8222-222222222222',
      }).success
    ).toBe(false)
  })

  it('validates the strict creation result', () => {
    expect(
      changeRequestCreationResultSchema.parse({
        changeRequestId: '44444444-4444-4444-8444-444444444444',
        tenantId: '22222222-2222-4222-8222-222222222222',
        status: 'open',
        created: true,
      })
    ).toMatchObject({ status: 'open' })
  })
})
