import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  documentUploadReservationWritesUseCoreApi: vi.fn(),
  releaseDocumentUploadReservationThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))

vi.mock('@/lib/erp-core-client', () => ({
  documentUploadReservationWritesUseCoreApi:
    mocks.documentUploadReservationWritesUseCoreApi,
  releaseDocumentUploadReservationThroughCoreApi:
    mocks.releaseDocumentUploadReservationThroughCoreApi,
}))

import { DELETE } from './route'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444'
const TRACE_ID = '77777777-7777-4777-8777-777777777777'

function request(
  reservationId = RESERVATION_ID,
  rawBody?: string
) {
  return DELETE(
    new NextRequest(
      `http://localhost/api/upload/reservations/${reservationId}`,
      {
        method: 'DELETE',
        ...(rawBody === undefined
          ? { headers: { 'x-request-id': TRACE_ID } }
          : {
              headers: {
                'content-type': 'application/json',
                'x-request-id': TRACE_ID,
              },
              body: rawBody,
            }),
      }
    ),
    { params: Promise.resolve({ reservationId }) }
  )
}

describe('upload reservation release route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      tenantId: TENANT_ID,
      role: 'pm',
    })
    mocks.can.mockReturnValue(true)
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(true)
    mocks.releaseDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        reservationId: RESERVATION_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-drawing.dxf`,
        state: 'released',
        replayed: false,
      },
    })
  })

  it('delegates an exact reservation release to Core', async () => {
    const response = await request()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      reservationId: RESERVATION_ID,
      state: 'released',
    })
    expect(
      mocks.releaseDocumentUploadReservationThroughCoreApi
    ).toHaveBeenCalledWith(
      RESERVATION_ID,
      TRACE_ID
    )
  })

  it('rejects unauthenticated, tenantless, and unauthorized callers before Core', async () => {
    mocks.getUserProfile.mockResolvedValueOnce(null)
    expect((await request()).status).toBe(401)

    mocks.getUserProfile.mockResolvedValueOnce({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      tenantId: null,
      role: 'pm',
    })
    expect((await request()).status).toBe(403)

    mocks.can.mockReturnValueOnce(false)
    expect((await request()).status).toBe(403)

    expect(
      mocks.releaseDocumentUploadReservationThroughCoreApi
    ).not.toHaveBeenCalled()
  })

  it('accepts only the strict empty release body contract', async () => {
    expect((await request(RESERVATION_ID, '{}')).status).toBe(200)

    const extraField = await request(
      RESERVATION_ID,
      JSON.stringify({ tenantId: TENANT_ID })
    )
    expect(extraField.status).toBe(400)

    const invalidJson = await request(RESERVATION_ID, '{')
    expect(invalidJson.status).toBe(400)
    expect(
      mocks.releaseDocumentUploadReservationThroughCoreApi
    ).toHaveBeenCalledTimes(1)
  })

  it('fails closed before Core when lifecycle selection is disabled', async () => {
    mocks.documentUploadReservationWritesUseCoreApi.mockReturnValue(false)

    const response = await request()

    expect(response.status).toBe(503)
    expect(
      mocks.releaseDocumentUploadReservationThroughCoreApi
    ).not.toHaveBeenCalled()
  })

  it('does not fall back after a selected Core release failure', async () => {
    mocks.releaseDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. Reservation cleanup is pending.',
    })

    const response = await request()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'ERP Core API is unavailable. Reservation cleanup is pending.',
    })
    expect(
      mocks.releaseDocumentUploadReservationThroughCoreApi
    ).toHaveBeenCalledOnce()
  })

  it('rejects invalid reservation identifiers before Core', async () => {
    const response = await request('not-a-uuid')

    expect(response.status).toBe(400)
    expect(
      mocks.releaseDocumentUploadReservationThroughCoreApi
    ).not.toHaveBeenCalled()
  })

  it('rejects a Core release result outside the authenticated tenant path', async () => {
    mocks.releaseDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        reservationId: RESERVATION_ID,
        projectId: PROJECT_ID,
        storagePath: `other-tenant/${PROJECT_ID}/${RESERVATION_ID}-drawing.dxf`,
        state: 'released',
        replayed: false,
      },
    })

    const response = await request()

    expect(response.status).toBe(503)
  })

  it('rejects a same-project Core path substituted from another reservation', async () => {
    mocks.releaseDocumentUploadReservationThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        reservationId: RESERVATION_ID,
        projectId: PROJECT_ID,
        storagePath:
          `${TENANT_ID}/${PROJECT_ID}/55555555-5555-4555-8555-555555555555-drawing.dxf`,
        state: 'released',
        replayed: false,
      },
    })

    expect((await request()).status).toBe(503)
  })
})
