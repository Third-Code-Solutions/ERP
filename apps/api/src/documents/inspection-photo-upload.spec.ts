import { describe, expect, it } from 'vitest'
import { buildInspectionPhotoUploadCommand, MAX_INSPECTION_PHOTO_BYTES } from './inspection-photo-upload'

describe('direct inspection photo command', () => {
  const tenant = '22222222-2222-4222-8222-222222222222'
  const opportunity = '33333333-3333-4333-8333-333333333333'
  it('derives MIME, hash and sanitized path from bytes, not declared MIME', () => {
    const command = buildInspectionPhotoUploadCommand(tenant, opportunity, { originalname: ' site photo.jpg ', buffer: Buffer.from([255, 216, 255, 1]) })
    expect(command).toMatchObject({ mimeType: 'image/jpeg', sizeBytes: 4, fileName: 'site_photo.jpg', caption: null })
    expect(command.storagePath).toMatch(/inspection\/[a-f0-9]{64}-site_photo.jpg$/)
  })
  it('rejects missing, empty, nonimage and oversized bytes', () => {
    for (const buffer of [Buffer.alloc(0), Buffer.from('not-image'), Buffer.alloc(MAX_INSPECTION_PHOTO_BYTES + 1)]) {
      expect(() => buildInspectionPhotoUploadCommand(tenant, opportunity, { originalname: 'photo.jpg', buffer })).toThrow()
    }
  })
  it('normalizes consecutive dots into a valid retryable canonical filename', () => {
    const command = buildInspectionPhotoUploadCommand(tenant, opportunity, { originalname: 'floor..jpg', buffer: Buffer.from([255, 216, 255]) })
    expect(command.fileName).toBe('floor_jpg')
    expect(command.storagePath).not.toContain('..')
  })
})
