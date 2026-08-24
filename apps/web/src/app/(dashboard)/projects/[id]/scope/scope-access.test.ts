import { describe, expect, it } from 'vitest'
import { scopePageAccess } from './scope-access'

describe('scope page capability controls', () => {
  it('keeps the Viewer role read-only', () => {
    expect(scopePageAccess('viewer')).toEqual({
      canEditScope: false,
      canUploadDocuments: false,
    })
  })

  it('allows estimators to edit scope and upload source evidence', () => {
    expect(scopePageAccess('estimator')).toEqual({
      canEditScope: true,
      canUploadDocuments: true,
    })
  })

  it('keeps document uploads independent from BOM editing authority', () => {
    expect(scopePageAccess('pm')).toEqual({
      canEditScope: false,
      canUploadDocuments: true,
    })
  })
})
