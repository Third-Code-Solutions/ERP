import { describe, expect, it } from 'vitest'
import { ERP_ROLES } from '@third-code-erp/shared-types'
import { ROLE_TEST_EMAILS } from '../../e2e/helpers/supabase-magic-link'

describe('role-matrix account manifest', () => {
  it('provides exactly one deterministic identity for every canonical role', () => {
    expect(Object.keys(ROLE_TEST_EMAILS).sort()).toEqual([...ERP_ROLES].sort())

    const emails = Object.values(ROLE_TEST_EMAILS)
    expect(new Set(emails).size).toBe(ERP_ROLES.length)
    expect(emails.every((email) => email.endsWith('@abi.demo.ph'))).toBe(true)
  })
})
