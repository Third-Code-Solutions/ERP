import { createHash } from 'node:crypto'
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'
import { inspectionPhotoCommandSchema, type InspectionPhotoCommand } from '@third-code-erp/shared-types'

export const MAX_INSPECTION_PHOTO_BYTES = 15 * 1024 * 1024
export interface InspectionPhotoUploadFile { originalname: string; buffer: Buffer }

export function buildInspectionPhotoUploadCommand(tenantId: string, opportunityId: string, file: InspectionPhotoUploadFile): InspectionPhotoCommand {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw new BadRequestException('Exactly one nonempty photo is required')
  const bytes = file.buffer
  if (bytes.length > MAX_INSPECTION_PHOTO_BYTES) throw new PayloadTooLargeException('Photo exceeds 15 MiB')
  const ascii = (offset: number, length: number): string => bytes.subarray(offset, offset + length).toString('ascii')
  let mimeType: InspectionPhotoCommand['mimeType'] | undefined
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mimeType = 'image/jpeg'
  else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mimeType = 'image/png'
  else if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) mimeType = 'image/gif'
  else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') mimeType = 'image/webp'
  else if (ascii(4, 4) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'mif1'].includes(ascii(8, 4))) mimeType = 'image/heic'
  if (!mimeType) throw new BadRequestException('Unsupported image format')
  const fileName = file.originalname.trim().replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_').slice(0, 160) || 'inspection-photo'
  const hash = createHash('sha256').update(bytes).digest('hex')
  return inspectionPhotoCommandSchema.parse({ opportunityId: opportunityId.toLowerCase(), fileName, mimeType, sizeBytes: bytes.length,
    storagePath: `${tenantId.toLowerCase()}/opportunities/${opportunityId.toLowerCase()}/inspection/${hash}-${fileName}`, caption: null })
}
