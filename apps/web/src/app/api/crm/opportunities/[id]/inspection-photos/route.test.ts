import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createInspectionPhotoThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))
vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove }),
    },
  }),
}))
vi.mock('@/lib/erp-core-client', () => ({
  createInspectionPhotoThroughCoreApi: mocks.createInspectionPhotoThroughCoreApi,
}))

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

function context(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jpeg(): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
    type: 'image/jpeg',
  })
}

function requestWithFile(file: Blob, fileName: string, caption?: string) {
  const body = new FormData()
  body.set('file', file, fileName)
  if (caption !== undefined) body.set('caption', caption)
  return new Request(
    `http://localhost/api/crm/opportunities/${OPPORTUNITY_ID}/inspection-photos`,
    {
      method: 'POST',
      body,
    }
  )
}

describe('inspection photo upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'commercial',
    })
    mocks.can.mockReturnValue(true)
    mocks.upload.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.createInspectionPhotoThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        opportunityId: OPPORTUNITY_ID,
        projectId: null,
        storagePath: `${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspection/photo.jpg`,
        fileName: 'front_elevation.jpg',
        status: 'created',
      },
      status: 201,
    })
  })

  it('fails before Storage work for an unauthenticated caller', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await POST(
      requestWithFile(jpeg(), 'site.jpg'),
      context(OPPORTUNITY_ID)
    )

    expect(response.status).toBe(401)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.createInspectionPhotoThroughCoreApi).not.toHaveBeenCalled()
  })

  it('rejects a role without site-inspection capability', async () => {
    mocks.can.mockReturnValue(false)

    const response = await POST(
      requestWithFile(jpeg(), 'site.jpg'),
      context(OPPORTUNITY_ID)
    )

    expect(response.status).toBe(403)
    expect(mocks.can).toHaveBeenCalledWith('commercial', 'site_inspection.submit')
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects a spoofed image MIME type before Storage upload', async () => {
    const response = await POST(
      requestWithFile(
        new Blob(['<svg><script>alert(1)</script></svg>'], { type: 'image/jpeg' }),
        'site.svg'
      ),
      context(OPPORTUNITY_ID)
    )

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({
      error: 'Only supported raster image files are accepted',
    })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.createInspectionPhotoThroughCoreApi).not.toHaveBeenCalled()
  })

  it('uploads raster evidence then delegates every durable write to Core', async () => {
    const response = await POST(
      requestWithFile(jpeg(), 'front elevation.jpg', ' Front elevation '),
      context(OPPORTUNITY_ID)
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: DOCUMENT_ID,
      fileName: 'front_elevation.jpg',
    })
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspection/`)
      ),
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg', upsert: false }
    )
    expect(mocks.createInspectionPhotoThroughCoreApi).toHaveBeenCalledWith(
      expect.objectContaining({
        opportunityId: OPPORTUNITY_ID,
        fileName: 'front_elevation.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 4,
        caption: 'Front elevation',
      })
    )
  })

  it('removes an orphaned object when Core rejects the metadata command', async () => {
    mocks.createInspectionPhotoThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Opportunity not found.',
      status: 404,
    })

    const response = await POST(
      requestWithFile(jpeg(), 'site.jpg'),
      context(OPPORTUNITY_ID)
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Opportunity not found.',
    })
    expect(mocks.remove).toHaveBeenCalledWith([
      expect.stringMatching(
        new RegExp(`^${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspection/`)
      ),
    ])
  })

  it('reuses an existing Storage object for a retry and still delegates idempotency to Core', async () => {
    mocks.upload.mockResolvedValue({
      error: { statusCode: '409', message: 'The resource already exists' },
    })

    const response = await POST(
      requestWithFile(jpeg(), 'site.jpg'),
      context(OPPORTUNITY_ID)
    )

    expect(response.status).toBe(200)
    expect(mocks.createInspectionPhotoThroughCoreApi).toHaveBeenCalledTimes(1)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
