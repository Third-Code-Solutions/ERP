import { describe, expect, it } from 'vitest'

import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_RESERVATION_TTL_SECONDS,
  DOCUMENT_UPLOAD_SIGNED_CREDENTIAL_MAX_LENGTH,
  PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES,
  documentUploadIdempotencyKeySchema,
  documentUploadReservationCompletionResultSchema,
  documentUploadReservationMutationBodySchema,
  documentUploadReservationReleaseResultSchema,
  documentUploadReservationRequestSchema,
  documentUploadReservationResultSchema,
  isDocumentUploadHttpUrl,
  normalizeDocumentUploadContentType,
} from './document-upload-reservations'

const RESERVATION_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'

describe('document upload reservation contracts', () => {
  it('keeps the PRD limits exact', () => {
    expect(DOCUMENT_UPLOAD_MAX_BYTES).toBe(104_857_600)
    expect(PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES).toBe(524_288_000)
    expect(DOCUMENT_UPLOAD_RESERVATION_TTL_SECONDS).toBe(7_200)
    expect(DOCUMENT_UPLOAD_SIGNED_CREDENTIAL_MAX_LENGTH).toBe(16_000)
  })

  it('normalizes media type parameters without accepting an invalid type', () => {
    expect(normalizeDocumentUploadContentType(' Text/Plain; charset=UTF-8 ')).toBe(
      'text/plain',
    )
    expect(
      documentUploadReservationRequestSchema.parse({
        projectId: PROJECT_ID,
        fileName: ' drawing.pdf ',
        mimeType: ' Application/PDF; charset=binary ',
        sizeBytes: 128,
        description: ' source plan ',
      }),
    ).toEqual({
      projectId: PROJECT_ID,
      fileName: 'drawing.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128,
      description: 'source plan',
    })
    expect(() =>
      documentUploadReservationRequestSchema.parse({
        projectId: PROJECT_ID,
        fileName: 'bad.bin',
        mimeType: 'not-a-media-type',
        sizeBytes: 1,
      }),
    ).toThrow()
  })

  it('defaults content type, canonicalizes blank description, and rejects oversize', () => {
    expect(
      documentUploadReservationRequestSchema.parse({
        projectId: PROJECT_ID,
        fileName: 'drawing.dxf',
        sizeBytes: DOCUMENT_UPLOAD_MAX_BYTES,
        description: '   ',
      }),
    ).toMatchObject({
      mimeType: 'application/octet-stream',
      description: null,
    })
    expect(() =>
      documentUploadReservationRequestSchema.parse({
        projectId: PROJECT_ID,
        fileName: 'oversize.dxf',
        sizeBytes: DOCUMENT_UPLOAD_MAX_BYTES + 1,
      }),
    ).toThrow()
  })

  it('validates bounded idempotency keys and strict empty mutation bodies', () => {
    expect(documentUploadIdempotencyKeySchema.parse(' attempt-1 ')).toBe(
      'attempt-1',
    )
    expect(() => documentUploadIdempotencyKeySchema.parse('')).toThrow()
    expect(documentUploadReservationMutationBodySchema.parse({})).toEqual({})
    expect(() =>
      documentUploadReservationMutationBodySchema.parse({ reservationId: RESERVATION_ID }),
    ).toThrow()
  })

  it('parses the ephemeral active reservation response', () => {
    expect(
      documentUploadReservationResultSchema.parse({
        reservationId: RESERVATION_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-plan.pdf`,
        originalFileName: 'plan.pdf',
        declaredSizeBytes: 10,
        declaredContentType: 'application/pdf',
        expiresAt: '2026-08-24T12:00:00.000Z',
        signedUrl: 'https://storage.example.test/upload?token=redacted',
        token: 'ephemeral-token',
        state: 'active',
        replayed: false,
      }),
    ).toMatchObject({ reservationId: RESERVATION_ID, state: 'active' })
  })

  it.each(['not-a-url', 'javascript:alert(1)'])(
    'rejects an unsafe signed URL without throwing: %s',
    (signedUrl) => {
      expect(() => isDocumentUploadHttpUrl(signedUrl)).not.toThrow()
      expect(
        documentUploadReservationResultSchema.safeParse({
          reservationId: RESERVATION_ID,
          projectId: PROJECT_ID,
          storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-plan.pdf`,
          originalFileName: 'plan.pdf',
          declaredSizeBytes: 10,
          declaredContentType: 'application/pdf',
          expiresAt: '2026-08-24T12:00:00.000Z',
          signedUrl,
          token: 'ephemeral-token',
          state: 'active',
          replayed: false,
        }).success,
      ).toBe(false)
    },
  )

  it('rejects a blank signed token', () => {
    expect(
      documentUploadReservationResultSchema.safeParse({
        reservationId: RESERVATION_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-plan.pdf`,
        originalFileName: 'plan.pdf',
        declaredSizeBytes: 10,
        declaredContentType: 'application/pdf',
        expiresAt: '2026-08-24T12:00:00.000Z',
        signedUrl: 'https://storage.example.test/upload?token=redacted',
        token: '   ',
        state: 'active',
        replayed: false,
      }).success,
    ).toBe(false)
  })

  it('keeps completion metadata provider-derived and release terminal', () => {
    expect(
      documentUploadReservationCompletionResultSchema.parse({
        reservationId: RESERVATION_ID,
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-plan.pdf`,
        fileName: 'plan.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        description: null,
        documentType: 'pdf',
        state: 'completed',
        created: true,
        replayed: false,
      }),
    ).toMatchObject({ documentId: DOCUMENT_ID, created: true })
    expect(
      documentUploadReservationReleaseResultSchema.parse({
        reservationId: RESERVATION_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/${RESERVATION_ID}-plan.pdf`,
        state: 'expired',
        replayed: true,
      }),
    ).toMatchObject({ state: 'expired', replayed: true })
  })
})
