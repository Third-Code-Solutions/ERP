import { describe, expect, it } from 'vitest'
import {
  can,
  type AppRole,
} from '@third-code-erp/auth'

const DOCUMENT_OPERATORS: AppRole[] = [
  'admin',
  'owner',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'pm',
  'finance',
  'procurement',
  'safety',
  'cx',
  'estimator',
]

describe('document.manage capability', () => {
  it.each(DOCUMENT_OPERATORS)('allows operational role %s', (role) => {
    expect(can(role, 'document.manage')).toBe(true)
  })

  it('keeps viewer read-only', () => {
    expect(can('viewer', 'document.manage')).toBe(false)
  })
})
