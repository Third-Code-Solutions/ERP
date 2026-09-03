import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404') } }))
import { requireUuidRouteParams } from './uuid-route-params'

const id = 'd45fbc4f-7544-4e51-836e-b79c160345f8'

describe('UUID route boundary', () => {
  it('retains validated parameter names and values', async () => {
    await expect(requireUuidRouteParams(Promise.resolve({ id, voId: id.toUpperCase() }))).resolves.toEqual({ id, voId: id.toUpperCase() })
  })

  for (const key of ['id', 'assetId', 'voId']) {
    it.each(['invalid-id', '', '../admin', '%2F', '123', id + '-extra'])(`rejects malformed ${key}: %s`, async (value) => {
      await expect(requireUuidRouteParams(Promise.resolve({ id, [key]: value }))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
    })
  }

  it('does not turn framework parameter failures into missing records', async () => {
    await expect(requireUuidRouteParams(Promise.reject(new Error('parameter failure')))).rejects.toThrow('parameter failure')
  })

  it('validates every discovered UUID page and layout before consuming route params', () => {
    function files(directory: string): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name)
        return entry.isDirectory() ? files(path) : /^(page|layout)\.tsx$/.test(entry.name) && /\[(id|assetId|voId)\]/.test(path) ? [path] : []
      })
    }
    const routes = files(resolve('src/app'))
    expect(routes.length).toBeGreaterThan(40)
    for (const path of routes) {
      const source = readFileSync(path, 'utf8')
      expect(source, path).toContain('await requireUuidRouteParams(params)')
      expect(source, path).not.toMatch(/await params\b/)
    }
  })
})
