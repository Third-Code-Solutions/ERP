import { describe, expect, it } from 'vitest'
import { paramsRecord } from './params'

describe('paramsRecord', () => {
  it('keeps single values as strings and drops blank or missing ones', () => {
    const record = paramsRecord(
      new URLSearchParams('asOf=2026-11-17&period=&account').entries()
    )

    expect(record).toEqual({ asOf: '2026-11-17' })
  })

  it('turns a repeated URL key into an array so strict validation fails it', () => {
    const record = paramsRecord(
      new URLSearchParams('asOf=2026-11-17&asOf=2026-11-18').entries()
    )

    expect(record).toEqual({ asOf: ['2026-11-17', '2026-11-18'] })
  })

  it('accepts the shape Next gives a page (string, string[] or undefined)', () => {
    const record = paramsRecord(
      Object.entries({ asOf: '2026-11-17', period: undefined, tag: ['a', 'b'] })
    )

    expect(record).toEqual({ asOf: '2026-11-17', tag: ['a', 'b'] })
  })
})
