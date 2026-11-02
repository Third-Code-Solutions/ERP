import 'reflect-metadata'
import { Readable } from 'node:stream'
import { readFile, access } from 'node:fs/promises'
import type { Request } from 'express'
import { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentUploadStorage } from './document-upload.storage'

function request(chunks: Buffer[], length: number): Request {
  // Node HTTP requests are readable streams; this fixture exercises the same
  // streaming boundary without opening a network listener.
  return Object.assign(Readable.from(chunks), { headers: { 'content-length': String(length), 'content-type': 'application/octet-stream' } }) as unknown as Request
}
function storage() { return new DocumentUploadStorage(new ConfigService({ SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key' })) }
afterEach(() => vi.unstubAllGlobals())

describe('bounded document transport', () => {
  it('streams staged bytes to exact immutable provider path with declared length', async () => {
    const provider = vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:1/storage/v1/object/documents/tenant/project/reservation-file.pdf')
      expect(options.headers).toMatchObject({ 'x-upsert': 'false', 'content-length': '4', 'content-type': 'application/pdf' })
      expect(options.body).toBeInstanceOf(ReadableStream)
      const bytes = await new Response(options.body).text()
      expect(bytes).toBe('abcd')
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', provider)
    const adapter = storage()
    expect(await adapter.stage(request([Buffer.from('abcd')], 4), 4, file => adapter.put('tenant/project/reservation-file.pdf', file, 4, 'application/pdf'))).toBe(true)
    expect(provider).toHaveBeenCalledOnce()
  })
  it('closes provider input and cleans staging after uncertain network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection reset')))
    const adapter = storage()
    let staged = ''
    await expect(adapter.stage(request([Buffer.from('a')], 1), 1, file => { staged = file; return adapter.put('tenant/project/file', file, 1, 'application/pdf') })).rejects.toThrow('connection reset')
    await expect(access(staged)).rejects.toThrow()
  })
  it('stages exact bytes, hashes content, and removes private temp file after consumption', async () => {
    let staged = ''
    const result = await storage().stage(request([Buffer.from('ab'), Buffer.from('cd')], 4), 4, async (file, hash) => {
      staged = file
      expect(await readFile(file, 'utf8')).toBe('abcd')
      expect(hash).toBe('88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589')
      return 'accepted'
    })
    expect(result).toBe('accepted')
    await expect(access(staged)).rejects.toThrow()
  })
  it.each([[5, 4, 4], [3, 4, 4], [4, 5, 4]])('rejects actual %i/header %i/reserved %i bytes without provider consumption', async (actual, header, reserved) => {
    const consume = vi.fn()
    await expect(storage().stage(request([Buffer.alloc(actual)], header), reserved, consume)).rejects.toThrow()
    expect(consume).not.toHaveBeenCalled()
  })
  it('cleans staging after provider exception', async () => {
    let staged = ''
    await expect(storage().stage(request([Buffer.from('a')], 1), 1, async file => { staged = file; throw new Error('provider unavailable') })).rejects.toThrow('provider unavailable')
    await expect(access(staged)).rejects.toThrow()
  })
  it('rejects interrupted ingress', async () => {
    const stream = Readable.from((async function* () { yield Buffer.from('a'); throw new Error('disconnected') })())
    const req = Object.assign(stream, { headers: { 'content-length': '4', 'content-type': 'application/octet-stream' } }) as unknown as Request
    await expect(storage().stage(req, 4, vi.fn())).rejects.toMatchObject({ status: 408 })
  })
  it('distinguishes provider absence, failure, and actual bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ size: 42 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Not found', statusCode: '404' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'unavailable' }), { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    const adapter = storage()
    expect(await adapter.size('tenant/project/file')).toBe(42)
    expect(await adapter.size('tenant/project/file')).toBeNull()
    await expect(adapter.size('tenant/project/file')).rejects.toMatchObject({ status: 503 })
  })
  it('does not claim cleanup when Storage still contains object', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[]', { status: 200 })).mockResolvedValueOnce(new Response('{"size":1}', { status: 200 })))
    await expect(storage().remove('tenant/project/file')).rejects.toMatchObject({ status: 503 })
  })
})
