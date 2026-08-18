import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { can, getUserProfile } from '@third-code-erp/auth'
import { createSupabaseAdminClient } from '@third-code-erp/auth/server'
import { createInspectionPhotoThroughCoreApi } from '@/lib/erp-core-client'

const MAX_PHOTO_BYTES = 15 * 1024 * 1024
const opportunityIdSchema = z.string().uuid()

interface RouteContext {
  params: Promise<{ id: string }>
}

function safeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return normalized.slice(0, 160) || 'inspection-photo'
}

function bytesMatch(
  bytes: Uint8Array,
  expected: ReadonlyArray<number>,
  offset = 0
): boolean {
  return expected.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

function detectedImageMimeType(bytes: Uint8Array):
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'
  | 'image/heic'
  | null {
  if (bytesMatch(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (bytesMatch(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') {
    return 'image/gif'
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp'
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1'].includes(brand)) {
      return 'image/heic'
    }
  }
  return null
}

function isExistingStorageObject(error: {
  statusCode?: string | number
  message?: string
  error?: string
}): boolean {
  if (String(error.statusCode ?? '') === '409') return true
  return /already exists|duplicate/i.test(
    `${error.message ?? ''} ${error.error ?? ''}`
  )
}

/**
 * Uploads bounded image bytes to Storage, then delegates the durable document
 * metadata and audit transaction to Core. A Core failure removes the newly
 * uploaded object rather than re-entering a Web database write path.
 */
export async function POST(request: Request, context: RouteContext) {
  const profile = await getUserProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!can(profile.role, 'site_inspection.submit')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const opportunityId = opportunityIdSchema.safeParse(id)
  if (!opportunityId.success) {
    return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Multipart form data is required' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'An image file is required' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: `Photo must be between 1 byte and ${MAX_PHOTO_BYTES / 1024 / 1024} MB` },
      { status: 413 }
    )
  }

  const bytes = await file.arrayBuffer()
  const mimeType = detectedImageMimeType(new Uint8Array(bytes))
  if (!mimeType) {
    return NextResponse.json(
      { error: 'Only supported raster image files are accepted' },
      { status: 415 }
    )
  }

  const caption = String(formData.get('caption') ?? '').trim().slice(0, 255)
  const fileName = safeFileName(file.name)
  const contentHash = createHash('sha256')
    .update(new Uint8Array(bytes))
    .digest('hex')
  const storagePath = `${profile.tenantId}/opportunities/${opportunityId.data}/inspection/${contentHash}-${fileName}`
  const storage = createSupabaseAdminClient().storage.from('documents')
  const { error: uploadError } = await storage.upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  })
  const storageCreated = uploadError === null
  if (uploadError && !isExistingStorageObject(uploadError)) {
    return NextResponse.json({ error: 'Photo upload failed' }, { status: 502 })
  }

  const coreResult = await createInspectionPhotoThroughCoreApi({
    opportunityId: opportunityId.data,
    storagePath,
    fileName,
    mimeType,
    sizeBytes: file.size,
    caption: caption || null,
  })
  if (!coreResult.ok || !coreResult.data) {
    if (storageCreated) {
      await storage.remove([storagePath]).catch(() => undefined)
    }
    return NextResponse.json(
      {
        error:
          coreResult.error ?? 'Photo metadata could not be recorded',
      },
      { status: coreResult.status ?? 502 }
    )
  }

  return NextResponse.json({
    id: coreResult.data.documentId,
    fileName: coreResult.data.fileName,
    storagePath: coreResult.data.storagePath,
  })
}
