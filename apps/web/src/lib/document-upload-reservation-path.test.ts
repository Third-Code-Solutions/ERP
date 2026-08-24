import { describe, expect, it } from 'vitest'

import { isExactDocumentUploadReservationPath } from './document-upload-reservation-path'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444'

function accepts(storagePath: string) {
  return isExactDocumentUploadReservationPath({
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    reservationId: RESERVATION_ID,
    storagePath,
  })
}

describe('isExactDocumentUploadReservationPath', () => {
  it('accepts only the canonical reservation-bound path', () => {
    expect(
      accepts(
        `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-drawing_version-1.dxf`
      )
    ).toBe(true)
  })

  it.each([
    `other-tenant/${PROJECT_ID}/${RESERVATION_ID}-drawing.dxf`,
    `${TENANT_ID}/other-project/${RESERVATION_ID}-drawing.dxf`,
    `${TENANT_ID}/${PROJECT_ID}/55555555-5555-4555-8555-555555555555-drawing.dxf`,
    `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-nested/drawing.dxf`,
    `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-drawing\\nested.dxf`,
    `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-drawing..dxf`,
    `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-`,
    `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-drawing name.dxf`,
  ])('rejects substituted or non-canonical path %s', (storagePath) => {
    expect(accepts(storagePath)).toBe(false)
  })
})
