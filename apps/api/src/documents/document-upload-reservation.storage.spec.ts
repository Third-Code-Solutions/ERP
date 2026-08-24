import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Environment } from '../config/environment'
import { DocumentUploadReservationStorage } from './document-upload-reservation.storage'

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
  const from = vi.fn(() => ({ createSignedUploadUrl, info, remove }))
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
    remove,
    service: new DocumentUploadReservationStorage(config),
  }
}

describe('document upload reservation Storage boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
