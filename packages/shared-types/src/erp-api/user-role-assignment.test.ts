import { describe, expect, it } from 'vitest'
import {
  userRoleAssignmentCommandSchema,
  userRoleAssignmentResultSchema,
} from './user-role-assignment'

describe('user role assignment contracts', () => {
  it('accepts a bounded original ERP role transition command', () => {
    expect(
      userRoleAssignmentCommandSchema.parse({
        expectedRole: 'viewer',
        role: 'pm',
      })
    ).toEqual({ expectedRole: 'viewer', role: 'pm' })
  })

  it('rejects unknown roles and extra fields', () => {
    expect(
      userRoleAssignmentCommandSchema.safeParse({
        expectedRole: 'viewer',
        role: 'superuser',
      }).success
    ).toBe(false)
    expect(
      userRoleAssignmentCommandSchema.safeParse({
        expectedRole: 'viewer',
        role: 'pm',
        tenantId: '11111111-1111-4111-8111-111111111111',
      }).success
    ).toBe(false)
  })

  it('requires a complete tenant-scoped result', () => {
    expect(
      userRoleAssignmentResultSchema.safeParse({
        userId: '22222222-2222-4222-8222-222222222222',
        tenantId: '11111111-1111-4111-8111-111111111111',
        previousRole: 'viewer',
        role: 'pm',
        status: 'updated',
        updatedAt: '2026-08-07T00:00:00.000Z',
      }).success
    ).toBe(true)
  })
})
