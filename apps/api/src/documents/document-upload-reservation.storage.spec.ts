import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Environment } from '../config/environment'
import {
  DOCUMENT_UPLOAD_STORAGE_REQUEST_TIMEOUT_MS,
  DocumentUploadReservationStorage,
} from './document-upload-reservation.storage'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

const STORAGE_URL = 'https://storage.example.test'
const SERVICE_ROLE_KEY = 's'.repeat(32)
const STORAGE_PATH =
  '22222222-2222-4222-8222-222222222222/' +
  '33333333-3333-4333-8333-333333333333/' +
  '44444444-4444-4444-8444-444444444444-drawing.pdf'

function storageProbe(options?: { serviceRoleKey: string | undefined }) {
  const createSignedUploadUrl = vi.fn()
  const info = vi.fn()
  const remove = vi.fn()
  const listV2 = vi.fn()
  const from = vi.fn(() => ({ createSignedUploadUrl, info, listV2, remove }))
  vi.mocked(createClient).mockReturnValue({ storage: { from } } as never)

  const values: Partial<Environment> = {
    SUPABASE_URL: STORAGE_URL,
    SUPABASE_SERVICE_ROLE_KEY: options
      ? options.serviceRoleKey
      : SERVICE_ROLE_KEY,
  }
  const config = {
    get: vi.fn((key: keyof Environment) => values[key]),
  } as unknown as ConfigService<Environment, true>

  return {
    createSignedUploadUrl,
    from,
    info,
    listV2,
    remove,
    service: new DocumentUploadReservationStorage(config),
  }
}

describe('document upload reservation Storage boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lazily creates a server client and signs the exact non-upsert path', async () => {
    const probe = storageProbe()
    probe.createSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.test/upload/signed',
        token: 'ephemeral-token',
        path: STORAGE_PATH,
        ignored: 'provider-field',
      },
      error: null,
    })

    expect(createClient).not.toHaveBeenCalled()
    await expect(probe.service.createSignedUpload(STORAGE_PATH)).resolves.toEqual({
      signedUrl: 'https://storage.example.test/upload/signed',
      token: 'ephemeral-token',
      storagePath: STORAGE_PATH,
    })

    expect(createClient).toHaveBeenCalledWith(STORAGE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: expect.any(Function) },
    })
    expect(probe.from).toHaveBeenCalledWith('documents')
    expect(probe.createSignedUploadUrl).toHaveBeenCalledWith(STORAGE_PATH, {
      upsert: false,
    })
  })

  it('fails closed when the provider returns a different path', async () => {
    const probe = storageProbe()
    probe.createSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.test/upload/signed',
        token: 'ephemeral-token',
        path: `${STORAGE_PATH}-different`,
      },
      error: null,
    })

    await expect(
      probe.service.createSignedUpload(STORAGE_PATH)
    ).rejects.toThrow('Document upload authorization is unavailable')
  })

  it('bounds every provider request with the server Storage deadline', async () => {
    const probe = storageProbe()
    probe.createSignedUploadUrl.mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.test/upload/signed',
        token: 'ephemeral-token',
        path: STORAGE_PATH,
      },
      error: null,
    })
    await probe.service.createSignedUpload(STORAGE_PATH)

    const configuredFetch = (
      vi.mocked(createClient).mock.calls[0]?.[2] as
        | { global?: { fetch?: typeof fetch } }
        | undefined
    )?.global?.fetch
    const timeoutSignal = new AbortController().signal
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(timeoutSignal)
    const fetchProbe = vi.fn().mockResolvedValue(new Response())
    vi.stubGlobal('fetch', fetchProbe)

    await expect(
      configuredFetch?.('https://storage.example.test/object')
    ).resolves.toBeInstanceOf(Response)

    expect(timeout).toHaveBeenCalledWith(
      DOCUMENT_UPLOAD_STORAGE_REQUEST_TIMEOUT_MS
    )
    expect(fetchProbe).toHaveBeenCalledWith(
      'https://storage.example.test/object',
      expect.objectContaining({ signal: timeoutSignal })
    )
  })

  it.each([
    ['a malformed URL', 'not-a-url', 'token'],
    ['an unsafe URL', 'javascript:alert(1)', 'token'],
    ['a blank token', 'https://storage.example.test/upload/signed', '   '],
  ])('rejects %s from the signing response', async (_case, signedUrl, token) => {
    const probe = storageProbe()
    probe.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl, token, path: STORAGE_PATH },
      error: null,
    })

    await expect(
      probe.service.createSignedUpload(STORAGE_PATH)
    ).rejects.toThrow('Document upload authorization is unavailable')
  })

  it('does not expose raw signing failures', async () => {
    const probe = storageProbe()
    probe.createSignedUploadUrl.mockResolvedValue({
      data: null,
      error: new Error('secret provider diagnostic'),
    })

    await expect(
      probe.service.createSignedUpload(STORAGE_PATH)
    ).rejects.not.toThrow('secret provider diagnostic')
  })

  it('redacts rejected signing operations', async () => {
    const probe = storageProbe()
    probe.createSignedUploadUrl.mockRejectedValue(
      new Error('secret provider signing diagnostic')
    )

    await expect(
      probe.service.createSignedUpload(STORAGE_PATH)
    ).rejects.not.toThrow('secret provider signing diagnostic')
  })

  it('returns only normalized top-level object metadata', async () => {
    const probe = storageProbe()
    probe.info.mockResolvedValue({
      data: {
        size: 123,
        contentType: ' Application/PDF; charset=binary ',
        metadata: { size: 999, mimetype: 'text/plain' },
      },
      error: null,
    })

    await expect(probe.service.info(STORAGE_PATH)).resolves.toEqual({
      sizeBytes: 123,
      contentType: 'application/pdf',
    })
    expect(probe.info).toHaveBeenCalledWith(STORAGE_PATH)
  })

  it.each([
    ['missing top-level fields', { metadata: { size: 1, mimetype: 'image/png' } }],
    ['zero bytes', { size: 0, contentType: 'image/png' }],
    ['fractional bytes', { size: 1.5, contentType: 'image/png' }],
    ['invalid content type', { size: 1, contentType: 'image/*' }],
  ] as const)('rejects %s from object info', async (_case, data) => {
    const probe = storageProbe()
    probe.info.mockResolvedValue({ data, error: null })

    await expect(probe.service.info(STORAGE_PATH)).rejects.toThrow(
      'Document upload object metadata is invalid'
    )
  })

  it('returns oversized object metadata for the service to reject and release', async () => {
    const probe = storageProbe()
    probe.info.mockResolvedValue({
      data: { size: 104_857_601, contentType: 'image/png' },
      error: null,
    })

    await expect(probe.service.info(STORAGE_PATH)).resolves.toEqual({
      sizeBytes: 104_857_601,
      contentType: 'image/png',
    })
  })

  it('does not expose raw object-info failures', async () => {
    const probe = storageProbe()
    probe.info.mockResolvedValue({
      data: null,
      error: new Error('private upstream response'),
    })

    await expect(probe.service.info(STORAGE_PATH)).rejects.not.toThrow(
      'private upstream response'
    )
  })

  it('redacts rejected object-info operations', async () => {
    const probe = storageProbe()
    probe.info.mockRejectedValue(new Error('private object-info diagnostic'))

    await expect(probe.service.info(STORAGE_PATH)).rejects.not.toThrow(
      'private object-info diagnostic'
    )
  })

  it('removes exactly the reservation-owned path', async () => {
    const probe = storageProbe()
    probe.remove.mockResolvedValue({ data: [], error: null })

    await expect(probe.service.remove(STORAGE_PATH)).resolves.toBeUndefined()
    expect(probe.remove).toHaveBeenCalledWith([STORAGE_PATH])
  })

  it('lists one bounded, flat, deterministic exact-tenant prefix page', async () => {
    const probe = storageProbe()
    probe.listV2.mockResolvedValue({
      data: {
        hasNext: true,
        nextCursor: 'provider-cursor',
        folders: [],
        objects: [
          {
            id: 'object-id',
            name: 'drawing.pdf',
            key: STORAGE_PATH,
            created_at: '2026-08-23T00:00:00.000Z',
            updated_at: '2026-08-23T00:00:00.000Z',
            last_accessed_at: '2026-08-23T00:00:00.000Z',
            metadata: null,
          },
        ],
      },
      error: null,
    })

    await expect(
      probe.service.listReservationObjects({
        tenantId: '22222222-2222-4222-8222-222222222222',
        cursor: 'current-cursor',
        limit: 25,
      })
    ).resolves.toEqual({
      objects: [
        {
          storagePath: STORAGE_PATH,
          createdAt: new Date('2026-08-23T00:00:00.000Z'),
        },
      ],
      hasNext: true,
      nextCursor: 'provider-cursor',
    })
    expect(probe.listV2).toHaveBeenCalledWith({
      prefix: '22222222-2222-4222-8222-222222222222/',
      cursor: 'current-cursor',
      limit: 25,
      with_delimiter: false,
      sortBy: { column: 'name', order: 'asc' },
    })
    expect(probe.remove).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a missing full key',
      {
        hasNext: false,
        folders: [],
        objects: [{ name: 'drawing.pdf', created_at: '2026-08-23T00:00:00Z' }],
      },
    ],
    [
      'a cross-tenant key',
      {
        hasNext: false,
        folders: [],
        objects: [
          {
            name: 'drawing.pdf',
            key: `99999999-9999-4999-8999-999999999999/${STORAGE_PATH}`,
            created_at: '2026-08-23T00:00:00Z',
          },
        ],
      },
    ],
    [
      'an invalid creation timestamp',
      {
        hasNext: false,
        folders: [],
        objects: [
          { name: 'drawing.pdf', key: STORAGE_PATH, created_at: 'invalid' },
        ],
      },
    ],
    [
      'a null creation timestamp',
      {
        hasNext: false,
        folders: [],
        objects: [
          { name: 'drawing.pdf', key: STORAGE_PATH, created_at: null },
        ],
      },
    ],
    [
      'a missing creation timestamp',
      {
        hasNext: false,
        folders: [],
        objects: [{ name: 'drawing.pdf', key: STORAGE_PATH }],
      },
    ],
    [
      'a numeric creation timestamp',
      {
        hasNext: false,
        folders: [],
        objects: [{ name: 'drawing.pdf', key: STORAGE_PATH, created_at: 0 }],
      },
    ],
    [
      'a noncanonical creation timestamp',
      {
        hasNext: false,
        folders: [],
        objects: [
          {
            name: 'drawing.pdf',
            key: STORAGE_PATH,
            created_at: '2026-08-23 00:00:00Z',
          },
        ],
      },
    ],
    [
      'an overlength creation timestamp',
      {
        hasNext: false,
        folders: [],
        objects: [
          { name: 'drawing.pdf', key: STORAGE_PATH, created_at: 'x'.repeat(36) },
        ],
      },
    ],
    [
      'a missing next cursor',
      { hasNext: true, folders: [], objects: [] },
    ],
  ])('fails closed for %s in listing metadata', async (_case, data) => {
    const probe = storageProbe()
    probe.listV2.mockResolvedValue({ data, error: null })

    await expect(
      probe.service.listReservationObjects({
        tenantId: '22222222-2222-4222-8222-222222222222',
        limit: 25,
      })
    ).rejects.toThrow(/Document upload object listing/)
    expect(probe.remove).not.toHaveBeenCalled()
  })

  it('bounds listing pages and redacts provider diagnostics', async () => {
    const probe = storageProbe()

    await expect(
      probe.service.listReservationObjects({
        tenantId: '22222222-2222-4222-8222-222222222222',
        limit: 51,
      })
    ).rejects.toThrow('Document upload object listing request is invalid')
    expect(probe.listV2).not.toHaveBeenCalled()

    probe.listV2.mockRejectedValue(
      new Error(`private-provider-diagnostic:${STORAGE_PATH}`)
    )
    await expect(
      probe.service.listReservationObjects({
        tenantId: '22222222-2222-4222-8222-222222222222',
        limit: 25,
      })
    ).rejects.not.toThrow('private-provider-diagnostic')
    expect(probe.remove).not.toHaveBeenCalled()
  })

  it('does not expose raw removal failures', async () => {
    const probe = storageProbe()
    probe.remove.mockResolvedValue({
      data: null,
      error: new Error('provider object name'),
    })

    await expect(probe.service.remove(STORAGE_PATH)).rejects.not.toThrow(
      'provider object name'
    )
  })

  it('redacts rejected removal operations', async () => {
    const probe = storageProbe()
    probe.remove.mockRejectedValue(new Error('private removal diagnostic'))

    await expect(probe.service.remove(STORAGE_PATH)).rejects.not.toThrow(
      'private removal diagnostic'
    )
  })

  it('fails before client creation when server credentials are absent', async () => {
    const probe = storageProbe({ serviceRoleKey: undefined })

    await expect(
      probe.service.createSignedUpload(STORAGE_PATH)
    ).rejects.toThrow('Document upload Storage is not configured')
    expect(createClient).not.toHaveBeenCalled()
  })
})
