import { describe, expect, it } from 'vitest'
import {
  inspectionPhotoCommandSchema,
  inspectionPhotoResultSchema,
} from './inspection-photo'

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

describe('inspection photo Core contract', () => {
  it('accepts bounded raster-image evidence and normalizes a caption', () => {
    expect(
      inspectionPhotoCommandSchema.parse({
        opportunityId: OPPORTUNITY_ID,
        storagePath: `${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspection/photo.jpg`,
        fileName: ' photo.jpg ',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        caption: ' Front elevation ',
      })
    ).toEqual({
      opportunityId: OPPORTUNITY_ID,
      storagePath: `${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspection/photo.jpg`,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      caption: 'Front elevation',
    })
  })

  it('rejects SVG, empty evidence, oversized files, and malformed results', () => {
    const base = {
      opportunityId: OPPORTUNITY_ID,
      storagePath: `${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspection/photo.jpg`,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1,
    }
    expect(() =>
      inspectionPhotoCommandSchema.parse({ ...base, mimeType: 'image/svg+xml' })
    ).toThrow()
    expect(() => inspectionPhotoCommandSchema.parse({ ...base, sizeBytes: 0 })).toThrow()
    expect(() =>
      inspectionPhotoCommandSchema.parse({ ...base, sizeBytes: 15 * 1024 * 1024 + 1 })
    ).toThrow()
    expect(() =>
      inspectionPhotoResultSchema.parse({
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        opportunityId: OPPORTUNITY_ID,
        projectId: null,
        storagePath: base.storagePath,
        fileName: base.fileName,
      })
    ).toThrow()
  })
})
