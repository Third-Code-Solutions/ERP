import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { HttpDocumentStorage } from './document-storage'

const FIXTURE = Buffer.from([0, 1, 2, 3, 127, 128, 254, 255])

async function startStorageStub(
  handler: (request: { url: string; authorization: string | undefined }) => {
    status: number
    body: Buffer | string
    contentType?: string
  }
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const result = handler({
      url: request.url ?? '',
      authorization:
        typeof request.headers.authorization === 'string'
          ? request.headers.authorization
          : undefined,
    })
    const body = Buffer.isBuffer(result.body)
      ? result.body
      : Buffer.from(result.body)
    response.writeHead(result.status, {
      'content-type': result.contentType ?? 'text/plain; charset=utf-8',
      'content-length': body.length,
    })
    response.end(body)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Storage stub did not expose a TCP address')
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

async function stopStorageStub(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

describe('provider-neutral document Storage contract', () => {
  const servers: Server[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(stopStorageStub))
  })

  it('downloads binary objects through a Supabase-compatible HTTP endpoint', async () => {
    const requests: string[] = []
    const stub = await startStorageStub(({ url, authorization }) => {
      requests.push(`${url}|${authorization ?? ''}`)
      return {
        status: 200,
        body: FIXTURE,
        contentType: 'application/octet-stream',
      }
    })
    servers.push(stub.server)

    const storage = new HttpDocumentStorage({
      baseUrl: stub.baseUrl,
      bearerToken: 'local-contract-token',
    })
    const result = await storage.download('tenant/project/plan 01.dxf')

    expect(result.error).toBeNull()
    expect(result.data).not.toBeNull()
    expect(Buffer.from(await result.data!.arrayBuffer())).toEqual(FIXTURE)
    expect(requests).toEqual([
      '/storage/v1/object/documents/tenant/project/plan%2001.dxf|Bearer local-contract-token',
    ])
  })

  it('maps provider HTTP failures to structured errors without throwing', async () => {
    const stub = await startStorageStub(() => ({
      status: 404,
      body: 'object not found',
    }))
    servers.push(stub.server)

    const result = await new HttpDocumentStorage({
      baseUrl: stub.baseUrl,
    }).download('tenant/project/missing.dxf')

    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('Storage download failed (404')
    expect(result.error?.message).toContain('object not found')
  })

  it('rejects traversal and malformed object keys before making a request', async () => {
    const requests: string[] = []
    const stub = await startStorageStub(({ url }) => {
      requests.push(url)
      return { status: 200, body: FIXTURE }
    })
    servers.push(stub.server)

    const storage = new HttpDocumentStorage({ baseUrl: stub.baseUrl })
    for (const path of ['../escape.dxf', 'tenant/../escape.dxf', '/absolute.dxf']) {
      const result = await storage.download(path)
      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'Storage path must be a relative object key'
      )
    }
    expect(requests).toEqual([])
  })
})
