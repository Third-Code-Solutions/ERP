import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ERP_ROLES, roleHasCapability, type InspectionPhotoCommand } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getOpportunityThroughCoreApi: vi.fn(),
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
  getOpportunityThroughCoreApi: mocks.getOpportunityThroughCoreApi,
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
  it('accepts the complete matching owner pair without changing the success contract', async () => {
    const body = new FormData()
    body.set('file', jpeg(), 'photo.jpg')
    body.set('expected_actor_id', USER_ID)
    body.set('expected_tenant_id', TENANT_ID)
    const response = await POST(new Request(`http://localhost/api/crm/opportunities/${OPPORTUNITY_ID}/inspection-photos`, { method: 'POST', body }), context(OPPORTUNITY_ID))
    expect(response.status).toBe(200)
    expect(mocks.upload).toHaveBeenCalledTimes(1)
  })
  it('rejects duplicate owner fields before effects', async () => {
    const body = new FormData()
    body.set('file', jpeg(), 'photo.jpg')
    body.append('expected_actor_id', USER_ID)
    body.append('expected_actor_id', USER_ID)
    body.set('expected_tenant_id', TENANT_ID)
    const response = await POST(new Request(`http://localhost/api/crm/opportunities/${OPPORTUNITY_ID}/inspection-photos`, { method: 'POST', body }), context(OPPORTUNITY_ID))
    expect(response.status).toBe(400)
    expect(mocks.getOpportunityThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })
  it.each([[DOCUMENT_ID, TENANT_ID], [USER_ID, DOCUMENT_ID], ['invalid', TENANT_ID], [USER_ID, undefined], [undefined, TENANT_ID]])('rejects invalid expected owner pair %j before effects', async (actor, tenant) => {
    const body = new FormData()
    body.set('file', jpeg(), 'photo.jpg')
    if (actor !== undefined) body.set('expected_actor_id', actor)
    if (tenant !== undefined) body.set('expected_tenant_id', tenant)
    const response = await POST(new Request(`http://localhost/api/crm/opportunities/${OPPORTUNITY_ID}/inspection-photos`, { method: 'POST', body }), context(OPPORTUNITY_ID))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(mocks.getOpportunityThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.createInspectionPhotoThroughCoreApi).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'commercial',
    })
    mocks.can.mockReturnValue(true)
    mocks.getOpportunityThroughCoreApi.mockResolvedValue({ ok: true, data: { opportunity: { id: OPPORTUNITY_ID, tenantId: TENANT_ID } } })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.createInspectionPhotoThroughCoreApi.mockImplementation(async (command: InspectionPhotoCommand) => ({
      ok: true,
      data: {
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        opportunityId: OPPORTUNITY_ID,
        projectId: null,
        storagePath: command.storagePath,
        fileName: command.fileName,
        status: 'created',
      },
      status: 201,
    }))
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

  it.each(ERP_ROLES)('uses canonical photo permission for %s', async role => {
    mocks.getUserProfile.mockResolvedValue({ user: { id: USER_ID }, tenantId: TENANT_ID, role })
    mocks.can.mockImplementation(roleHasCapability)
    const allowed = ['owner', 'admin', 'commercial'].includes(role)
    const response = await POST(requestWithFile(jpeg(), 'site.jpg'), context(OPPORTUNITY_ID))
    expect(response.status).toBe(allowed ? 200 : 403)
    expect(mocks.upload).toHaveBeenCalledTimes(allowed ? 1 : 0)
  })

  it.each([
    { tenantId: DOCUMENT_ID },
    { opportunityId: DOCUMENT_ID },
    { storagePath: `${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspection/other.jpg` },
    { fileName: 'other.jpg' },
    { documentId: 'not-a-uuid' },
  ])('does not confirm mismatched photo evidence: %j', async overrides => {
    mocks.createInspectionPhotoThroughCoreApi.mockImplementation(async (command: InspectionPhotoCommand) => ({
      ok: true, data: { documentId: DOCUMENT_ID, tenantId: TENANT_ID, opportunityId: OPPORTUNITY_ID,
        projectId: null, storagePath: command.storagePath, fileName: command.fileName, status: 'created', ...overrides },
    }))
    const response = await POST(requestWithFile(jpeg(), 'site.jpg'), context(OPPORTUNITY_ID))
    expect(response.status).toBe(503)
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('contains an uncertain Storage upload failure without metadata registration or cleanup', async () => {
    mocks.upload.mockRejectedValue(new Error('Synthetic lost Storage response'))
    const response = await POST(requestWithFile(jpeg(), 'site.jpg'), context(OPPORTUNITY_ID))
    expect(response.status).toBe(503)
    expect(mocks.createInspectionPhotoThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
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

  it('retains an object on rejection because this request cannot exclude a concurrent reference', async () => {
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
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it.each([
    { ok: false, status: 404 },
    { ok: false, status: 503 },
    { ok: true, data: { opportunity: { id: DOCUMENT_ID, tenantId: TENANT_ID } } },
    { ok: true, data: { opportunity: { id: OPPORTUNITY_ID, tenantId: DOCUMENT_ID } } },
    { ok: true, data: null },
  ])('does no Storage work without a bound opportunity preflight: %j', async result => {
    mocks.getOpportunityThroughCoreApi.mockResolvedValue(result)
    const response = await POST(requestWithFile(jpeg(), 'site.jpg'), context(OPPORTUNITY_ID))
    expect(response.status).toBe(503)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.createInspectionPhotoThroughCoreApi).not.toHaveBeenCalled()
  })

  it('contains a thrown preflight before privileged upload', async () => {
    mocks.getOpportunityThroughCoreApi.mockRejectedValue(new Error('Synthetic unavailable session'))
    const response = await POST(requestWithFile(jpeg(), 'site.jpg'), context(OPPORTUNITY_ID))
    expect(response.status).toBe(503)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.createInspectionPhotoThroughCoreApi).not.toHaveBeenCalled()
  })

  it('keeps committed photo bytes when the metadata acknowledgement is lost', async () => {
    const objects = new Set<string>()
    const references = new Set<string>()
    mocks.upload.mockImplementation(async (path: string) => {
      objects.add(path)
      return { error: null }
    })
    mocks.remove.mockImplementation(async (paths: string[]) => {
      for (const path of paths) objects.delete(path)
      return { error: null }
    })
    mocks.createInspectionPhotoThroughCoreApi.mockImplementation(async (command: { storagePath: string }) => {
      references.add(command.storagePath)
      return { ok: false, status: 503, error: 'ERP Core API is unavailable. Inspection photo metadata was not recorded.' }
    })

    const response = await POST(requestWithFile(jpeg(), 'site.jpg'), context(OPPORTUNITY_ID))

    expect(response.status).toBe(503)
    expect(references.size).toBe(1)
    expect(objects).toEqual(references)
    expect(mocks.remove).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'Photo recording could not be confirmed. Retry the same file and caption.' })
  })

  it('contains thrown metadata failures without deleting possible evidence', async () => {
    mocks.createInspectionPhotoThroughCoreApi.mockRejectedValue(new Error('Synthetic lost response'))
    const response = await POST(requestWithFile(jpeg(), 'site.jpg'), context(OPPORTUNITY_ID))
    expect(response.status).toBe(503)
    expect(mocks.remove).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({ error: 'Photo recording could not be confirmed. Retry the same file and caption.' })
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
