import 'reflect-metadata'
import { createHash } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  InspectionReportStorageService,
  MAX_INSPECTION_REPORT_BYTES,
} from './inspection-report.storage'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const INSPECTION_ID = '44444444-4444-4444-8444-444444444444'
const CONFIG = {
  SUPABASE_URL: 'https://storage.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role-key',
}

const reportBytes = Buffer.from(
  '<!doctype html><html lang="en"><body>Report</body></html>',
  'utf8'
)

function reportPath(bytes = reportBytes): string {
  const digest = createHash('sha256').update(bytes).digest('hex')
  return `${TENANT_ID}/opportunities/${OPPORTUNITY_ID}/inspections/${INSPECTION_ID}/report-${digest}.html`
}

function storage(): InspectionReportStorageService {
  return new InspectionReportStorageService(new ConfigService(CONFIG))
}

function htmlResponse(
  bytes: Buffer<ArrayBufferLike> = reportBytes,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(new Uint8Array(bytes), {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-length': String(bytes.length),
      ...extraHeaders,
    },
  })
}

const duplicateEvidence: Array<{
  status: number
  body?: Buffer
  headers?: Record<string, string>
}> = [
  { status: 206 },
  { status: 200, headers: { 'content-range': 'bytes 0-55/56' } },
  { status: 200, body: Buffer.alloc(0) },
  { status: 200, body: Buffer.from('<!doctype html><html>different</html>') },
  { status: 200, headers: { 'content-type': 'application/octet-stream' } },
  { status: 500 },
]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('InspectionReportStorageService', () => {
  it('uploads with immutable REST semantics and verifies the complete private object', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(htmlResponse())
    vi.stubGlobal('fetch', fetcher)

    await expect(
      storage().ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).resolves.toBeUndefined()

    const objectPath = reportPath()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `https://storage.example.test/storage/v1/object/documents/${objectPath}`,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        body: reportBytes,
        headers: expect.objectContaining({
          Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: CONFIG.SUPABASE_SERVICE_ROLE_KEY,
          'content-type': 'text/html',
          'x-upsert': 'false',
        }),
      })
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `https://storage.example.test/storage/v1/object/authenticated/documents/${objectPath}`,
      expect.objectContaining({ method: 'GET', redirect: 'error' })
    )
  })

  it.each([
    [400, JSON.stringify({ error: 'Asset Already Exists' })],
    [400, JSON.stringify({ code: 'ResourceAlreadyExists' })],
    [400, JSON.stringify({ error: 'ResourceAlreadyExists' })],
    [409, JSON.stringify({ code: 'ResourceAlreadyExists' })],
    [409, JSON.stringify({ code: 'KeyAlreadyExists' })],
    [409, JSON.stringify({ code: 'already_exists' })],
  ] as const)('proves a documented duplicate response with a full download (%s)', async (status, body) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(body, {
          status,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(htmlResponse())
    vi.stubGlobal('fetch', fetcher)

    await expect(
      storage().ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each([
    [400, JSON.stringify({ error: 'Bad Request' })],
    [409, JSON.stringify({ code: 'Conflict' })],
    [202, JSON.stringify({ error: 'Accepted but not committed' })],
    [500, JSON.stringify({ error: 'Asset Already Exists' })],
  ] as const)('does not guess that an unmarked provider response is a duplicate (%s)', async (status, body) => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(body, {
        status,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetcher)

    await expect(
      storage().ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each(duplicateEvidence)('rejects an unproven duplicate object: %j', async (evidence) => {
    const body = evidence.body ?? reportBytes
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(htmlResponse(body, evidence.status, evidence.headers))
    vi.stubGlobal('fetch', fetcher)

    await expect(
      storage().ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).rejects.toThrow()
  })

  it.each([
    'https://storage.example.test/evil',
    'https://storage.example.test?tenant=other',
    'https://user:password@storage.example.test',
    'http://storage.example.test',
  ])('rejects a non-origin Supabase URL before networking: %s', async (url) => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    await expect(
      new InspectionReportStorageService(
        new ConfigService({
          ...CONFIG,
          SUPABASE_URL: url,
        })
      ).ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).rejects.toThrow(/unavailable/i)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { storagePath: 'not-canonical', bytes: reportBytes },
    { storagePath: reportPath().toUpperCase(), bytes: reportBytes },
    { storagePath: reportPath().replace('/inspections/', '/inspection/'), bytes: reportBytes },
    { storagePath: reportPath().replace(/report-[a-f0-9]+\.html$/, 'report-not-a-hash.html'), bytes: reportBytes },
    { storagePath: reportPath(Buffer.from('<html>other</html>')), bytes: reportBytes },
    { storagePath: reportPath(), bytes: Buffer.alloc(0) },
    { storagePath: reportPath(Buffer.alloc(MAX_INSPECTION_REPORT_BYTES + 1, 65)), bytes: Buffer.alloc(MAX_INSPECTION_REPORT_BYTES + 1, 65) },
    { storagePath: reportPath(Buffer.from('<p>fragment only</p>')), bytes: Buffer.from('<p>fragment only</p>') },
  ])('rejects malformed report input before networking: %j', async (input) => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    await expect(storage().ensure(input)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not expose provider errors and keeps network failures unconfirmed', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('secret-service-role-token'))
    vi.stubGlobal('fetch', fetcher)

    await expect(
      storage().ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).rejects.toThrow(/unconfirmed/i)
    await expect(
      storage().ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).rejects.not.toThrow('secret-service-role-token')
  })

  it('bounds a stalled request even when the transport ignores abort', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)))

    const result = expect(
      storage().ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(10_001)
    await result
  })

  it('bounds a stalled verification body after successful headers', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(body, { headers: { 'content-type': 'text/html' } })
      )
    vi.stubGlobal('fetch', fetcher)

    const result = expect(
      storage().ensure({ storagePath: reportPath(), bytes: reportBytes })
    ).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(10_001)
    await result
    expect(cancel).toHaveBeenCalled()
  })
})
