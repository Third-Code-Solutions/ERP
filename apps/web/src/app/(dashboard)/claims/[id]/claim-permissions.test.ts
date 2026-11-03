import { describe, expect, it } from 'vitest'

import { claimActionPermissions } from './claim-permissions'

describe('claimActionPermissions', () => {
  it('splits commercial and finance steps by role', () => {
    expect(claimActionPermissions('commercial')).toMatchObject({ commercial: true, finance: false })
    expect(claimActionPermissions('finance')).toMatchObject({ commercial: false, finance: true })
    expect(claimActionPermissions('admin')).toMatchObject({ commercial: true, finance: true })
  })

  it('gives a viewer no claim actions', () => {
    expect(claimActionPermissions('viewer')).toEqual({
      submit: false,
      commercial: false,
      finance: false,
      rejectOrCancel: false,
    })
  })
})
