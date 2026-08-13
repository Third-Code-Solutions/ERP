import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { POST } from './route'

describe('legacy Togal commit endpoint', () => {
  it('returns the generic takeoff successor contract', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/bom/togal-commit', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    )

    expect(response.status).toBe(410)
    expect(response.headers.get('deprecation')).toBe('true')
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'LEGACY_ENDPOINT_DEPRECATED' },
    })
  })
})
