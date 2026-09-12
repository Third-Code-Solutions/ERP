import 'reflect-metadata'
import { createHash } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InspectionPhotoStorageService } from './inspection-photo.storage'

const bytes = new Uint8Array([255, 216, 255, 0, 1])
const digest = createHash('sha256').update(bytes).digest('hex')
const command = {
  opportunityId: '33333333-3333-4333-8333-333333333333',
  storagePath: `22222222-2222-4222-8222-222222222222/opportunities/33333333-3333-4333-8333-333333333333/inspection/${digest}-photo.jpg`,
  fileName: 'photo.jpg', mimeType: 'image/jpeg' as const, sizeBytes: bytes.length, caption: null,
}
const service = () => new InspectionPhotoStorageService(new ConfigService({ SUPABASE_URL: 'https://storage.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key' }))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('InspectionPhotoStorageService', () => {
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
