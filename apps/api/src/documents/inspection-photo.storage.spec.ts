import 'reflect-metadata'
import { createHash } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InspectionPhotoStorageService } from './inspection-photo.storage'

const bytes = new Uint8Array([255, 216, 255, 0, 1])
const uploadBytes = Buffer.from(bytes)
const digest = createHash('sha256').update(bytes).digest('hex')
const command = {
  opportunityId: '33333333-3333-4333-8333-333333333333',
  storagePath: `22222222-2222-4222-8222-222222222222/opportunities/33333333-3333-4333-8333-333333333333/inspection/${digest}-photo.jpg`,
  fileName: 'photo.jpg', mimeType: 'image/jpeg' as const, sizeBytes: bytes.length, caption: null,
}
const service = () => new InspectionPhotoStorageService(new ConfigService({ SUPABASE_URL: 'https://storage.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key' }))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('InspectionPhotoStorageService', () => {
  it('uploads an immutable photo before resolving', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetcher)

    await expect(service().upload(command, uploadBytes)).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `https://storage.example.test/storage/v1/object/documents/${command.storagePath}`,
      expect.objectContaining({
        method: 'POST',
        body: uploadBytes,
        redirect: 'error',
        headers: expect.objectContaining({
          'content-type': 'image/jpeg',
          'content-length': String(uploadBytes.length),
          'x-upsert': 'false',
        }),
      }),
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    [200, null],
    [201, null],
    [400, JSON.stringify({ error: 'Asset Already Exists' })],
    [400, JSON.stringify({ message: 'Asset Already Exists' })],
    [409, JSON.stringify({ code: 'ResourceAlreadyExists' })],
    [409, JSON.stringify({ code: 'KeyAlreadyExists' })],
    [400, JSON.stringify({ code: 'already_exists' })],
  ] as const)('accepts only a successful or documented duplicate response (%s)', async (status, responseBody) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(responseBody, { status }))
    vi.stubGlobal('fetch', fetcher)

    await expect(service().upload(command, uploadBytes)).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    [400, JSON.stringify({ code: 'InvalidRequest', message: 'not a duplicate' })],
    [409, JSON.stringify({ code: 'Conflict', message: 'already exists maybe' })],
    [408, JSON.stringify({ message: 'Asset Already Exists' })],
  ] as const)('does not treat an unclassified provider response (%s) as a duplicate', async (status, responseBody) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(responseBody, { status })))

    await expect(service().upload(command, uploadBytes)).rejects.toThrow()
  })

  it.each([
    ['size', { ...command, sizeBytes: command.sizeBytes + 1 }, uploadBytes],
    ['MIME', { ...command, mimeType: 'image/png' as const }, uploadBytes],
    ['path hash', { ...command, storagePath: command.storagePath.replace(digest, 'a'.repeat(64)) }, uploadBytes],
    ['magic bytes', command, Buffer.from('not-an-image')],
    ['maximum size', command, Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(15 * 1024 * 1024)])],
  ] as const)('rejects invalid %s before contacting Storage', async (_kind, invalidCommand, invalidBytes) => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    await expect(service().upload(invalidCommand, invalidBytes)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects unsafe upload configuration before contacting Storage', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const unsafe = new InspectionPhotoStorageService(new ConfigService({
      SUPABASE_URL: 'https://storage.example.test/private',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
    }))

    await expect(unsafe.upload(command, uploadBytes)).rejects.toThrow('unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('contains provider transport errors without exposing credentials', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('provider leaked synthetic-key and a private object path'))
    vi.stubGlobal('fetch', fetcher)

    const error = await service().upload(command, uploadBytes).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Inspection photo upload is unconfirmed')
    expect((error as Error).message).not.toContain('synthetic-key')
  })

  it('bounds a transport that ignores abort', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))

    const pending = service().upload(command, uploadBytes)
    const result = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10_001)
    await result
  })

  it('bounds a provider body that stalls after successful headers', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 201 })))

    const pending = service().upload(command, uploadBytes)
    const result = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10_001)
    await result
    expect(cancel).toHaveBeenCalled()
  })

  it('caps provider response bodies without waiting for unbounded data', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024 + 1))
      },
      cancel,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 500 })))

    await expect(service().upload(command, uploadBytes)).rejects.toThrow('unconfirmed')
    expect(cancel).toHaveBeenCalled()
  })

  it.each([
    ['image/jpeg', Buffer.from([255, 216, 255, 0])],
    ['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image/gif', Buffer.from('GIF89a')],
    ['image/webp', Buffer.from('RIFF0000WEBP')],
    ['image/heic', Buffer.from('0000ftypheic')],
  ] as const)('recognizes chunked %s bytes', async (mimeType, content) => {
    const sha256 = createHash('sha256').update(content).digest('hex')
    const body = new ReadableStream({ start(controller) {
      for (const byte of content) controller.enqueue(new Uint8Array([byte]))
      controller.close()
    } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': mimeType } })))
    await expect(service().verify({ ...command, mimeType, sizeBytes: content.length, storagePath: command.storagePath.replace(digest, sha256) })).resolves.toEqual({ sha256, sizeBytes: content.length, mimeType })
  })
  it.each([null, 'application/octet-stream', 'image/png'])('rejects absent or contradictory provider MIME %s', async (mime) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { headers: mime ? { 'content-type': mime } : {} })))
    await expect(service().verify(command)).rejects.toThrow('MIME does not match')
  })
  it.each([new Uint8Array(), bytes.subarray(0, 2)])('rejects empty or truncated evidence', async (content) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(content, { headers: { 'content-type': 'image/jpeg' } })))
    await expect(service().verify(command)).rejects.toThrow()
  })
  it.each([{}, { SUPABASE_URL: 'https://storage.example.test' }, { SUPABASE_URL: 'https://storage.example.test/evil', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' }])('rejects incomplete or unsafe config before networking', async (config) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(new InspectionPhotoStorageService(new ConfigService(config)).verify(command)).rejects.toThrow('unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('contains a rejected stream without exposing provider text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.error(new Error('sensitive-provider-text')) } }), { headers: { 'content-type': 'image/jpeg' } })))
    await expect(service().verify(command)).rejects.toThrow('verification is unconfirmed')
  })
  it('bounds connection time even if a transport ignores abort', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))
    const result = expect(service().verify(command)).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(10_001)
    await result
  })
  it('verifies actual streamed bytes and uses only the fixed private origin', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/jpeg' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(service().verify(command)).resolves.toEqual({ sha256: digest, sizeBytes: 5, mimeType: 'image/jpeg' })
    expect(fetcher).toHaveBeenCalledWith(`https://storage.example.test/storage/v1/object/authenticated/documents/${command.storagePath}`, expect.objectContaining({ redirect: 'error', cache: 'no-store' }))
  })
  it.each([404, 500, 302])('fails closed on provider status %s', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
    await expect(service().verify(command)).rejects.toThrow()
  })
  it.each([206, 200])('rejects partial representation even when bytes match (status %s)', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, {
      status,
      headers: { 'content-type': 'image/jpeg', 'content-range': 'bytes 0-4/100' },
    })))
    await expect(service().verify(command)).rejects.toThrow()
  })
  it('rejects 206 even without a Content-Range header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, {
      status: 206, headers: { 'content-type': 'image/jpeg' },
    })))
    await expect(service().verify(command)).rejects.toThrow()
  })
  it.each([
    { sizeBytes: 6 }, { mimeType: 'image/png' as const },
    { storagePath: command.storagePath.replace(digest, 'a'.repeat(64)) },
  ])('rejects inconsistent declared evidence %j', async (change) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/jpeg' } })))
    await expect(service().verify({ ...command, ...change })).rejects.toThrow()
  })
  it.each(['photo.jpg', `${digest}-../photo.jpg`, `${digest}-photo.jpg?other`, `${digest}-photo.jpg#fragment`, `${digest}-photo%2f.jpg`])('rejects noncanonical leaf %s before fetch', async (leaf) => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(service().verify({ ...command, storagePath: command.storagePath.replace(`${digest}-photo.jpg`, leaf) })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('caps a lying streamed body and cancels it', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(15 * 1024 * 1024 + 1)) }, cancel })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-type': 'image/jpeg', 'content-length': '5' } })))
    await expect(service().verify(command)).rejects.toThrow()
    expect(cancel).toHaveBeenCalled()
  })
  it('rejects bytes beyond the declared size without waiting for the body to finish', async () => {
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes) }, cancel }), { headers: { 'content-type': 'image/jpeg' } })))
    await expect(service().verify({ ...command, sizeBytes: 4 })).rejects.toThrow('size does not match')
    expect(cancel).toHaveBeenCalled()
  })
  it('bounds a stalled body after successful headers', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'image/jpeg' } })))
    const result = expect(service().verify(command)).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(10_001)
    await result
    expect(cancel).toHaveBeenCalled()
  })
})
