import {
  ORGANIZATION_TYPES,
  isOrganizationType,
} from '@third-code-erp/shared-types'
import { describe, expect, it } from 'vitest'
import { ORGANIZATION_TYPE_OPTIONS } from './signup-options'

describe('signup organization types', () => {
  it('renders every canonical organization type exactly once', () => {
    expect(
      ORGANIZATION_TYPE_OPTIONS.map((option) => option.value)
    ).toEqual(ORGANIZATION_TYPES)
  })

  it('rejects values outside the canonical catalog', () => {
    expect(isOrganizationType('construction')).toBe(true)
    expect(isOrganizationType('admin')).toBe(false)
    expect(isOrganizationType('construction,developer')).toBe(false)
  })
})
