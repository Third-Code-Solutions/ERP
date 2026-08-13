import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { POST as postImport } from './togal-import/route'
import { POST as postCommit } from './togal-commit/route'

describe('legacy Togal endpoints', () => {
  it('closes the preview endpoint with a successor contract', async () => {
    const response = await postImport(new NextRequest('http://localhost/api/bom/togal-import'))
    expect(response.status).toBe(410)
    expect(response.headers.get('deprecation')).toBe('true')
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'LEGACY_ENDPOINT_DEPRECATED' },
    })
  })

  it('closes the price-writing commit endpoint', async () => {
    const response = await postCommit(new NextRequest('http://localhost/api/bom/togal-commit'))
    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'LEGACY_ENDPOINT_DEPRECATED' },
    })
  })
})
