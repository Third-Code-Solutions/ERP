import { describe, expect, it, vi } from 'vitest'
import {
  MAX_JSON_ARRAY_ELEMENTS,
  countJsonArrayElements,
  rejectOversizedJsonArrays,
} from './json-array-budget'

function run(body: unknown, limit?: number) {
  const res = { status: vi.fn(), json: vi.fn() }
  res.status.mockReturnValue(res)
  const next = vi.fn()
  rejectOversizedJsonArrays(limit)({ body } as never, res as never, next)
  return { res, next }
}

describe('JSON array budget', () => {
  it('counts elements across nested arrays and objects', () => {
    expect(countJsonArrayElements({ a: [1, 2], b: { c: [[3], {}] } }, 100)).toBe(5)
    expect(countJsonArrayElements(undefined, 100)).toBe(0)
    expect(countJsonArrayElements('text', 100)).toBe(0)
  })

  it('accepts the largest legitimate import (5,000 rows)', () => {
    const body = { missingColumns: [], rows: Array.from({ length: 5_000 }, () => ({ qty: 1 })) }
    const { res, next } = run(body)
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('rejects a flat oversized array with 413 before any schema runs', () => {
    const { res, next } = run({ documents: Array(MAX_JSON_ARRAY_ELEMENTS + 1).fill(1) })
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(413)
  })

  it('rejects arrays that only exceed the budget in total', () => {
    const { res, next } = run({ a: Array(6).fill(0), b: [Array(5).fill(0)] }, 10)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(413)
  })
})
