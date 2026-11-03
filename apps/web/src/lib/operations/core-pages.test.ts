import { describe, expect, it, vi } from 'vitest'
import { readAllCorePages } from './core-pages'

const page = (rows: number[], total: number) => ({ ok: true, data: { rows, total, extra: 'kept' } })

describe('readAllCorePages', () => {
  it('concatenates pages until total is reached and keeps first-page fields', async () => {
    const read = vi.fn(async (n: number) => (n === 1 ? page([1, 2], 5) : n === 2 ? page([3, 4], 5) : page([5], 5)))
    await expect(readAllCorePages(read, 'failed')).resolves.toEqual({ rows: [1, 2, 3, 4, 5], total: 5, extra: 'kept' })
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('stops on an empty page and throws on a failed page or too many pages', async () => {
    await expect(readAllCorePages(async (n) => (n === 1 ? page([1], 3) : page([], 3)), 'failed')).resolves.toMatchObject({ rows: [1] })
    await expect(readAllCorePages(async (n) => (n === 1 ? page([1], 3) : { ok: false, error: 'Core down' }), 'failed')).rejects.toThrow('Core down')
    await expect(readAllCorePages(async () => page([1], 99), 'failed', 2)).rejects.toThrow('longer than 2 pages')
  })
})
