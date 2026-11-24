import { describe, expect, it } from 'vitest'
import {
  clampLedgerPage,
  LEDGER_PAGE_SIZE,
  ledgerPageCount,
  ledgerPageHref,
  ledgerPageWindow,
  parseLedgerPage,
} from './ledger-pagination'

describe('parseLedgerPage', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['abc', 1],
    ['-3', 1],
    ['0', 1],
    ['2.5', 1],
    ['3', 3],
  ])('reads %s as page %i', (raw, page) => {
    expect(parseLedgerPage(raw)).toBe(page)
  })
})

describe('page range', () => {
  it('has at least one page even when empty', () => {
    expect(ledgerPageCount(0)).toBe(1)
  })

  it('splits lines at the page size', () => {
    expect(LEDGER_PAGE_SIZE).toBe(100)
    expect(ledgerPageCount(100)).toBe(1)
    expect(ledgerPageCount(101)).toBe(2)
    expect(ledgerPageCount(1_250)).toBe(13)
  })

  it('clamps a stale page number into range', () => {
    expect(clampLedgerPage(9, 250)).toBe(3)
    expect(clampLedgerPage(1, 0)).toBe(1)
  })

  it('reports the first and last line on a page', () => {
    expect(ledgerPageWindow(1, 250)).toEqual({ first: 1, last: 100 })
    expect(ledgerPageWindow(3, 250)).toEqual({ first: 201, last: 250 })
    expect(ledgerPageWindow(1, 0)).toEqual({ first: 0, last: 0 })
  })
})

describe('ledgerPageHref', () => {
  it('keeps the applied filters and omits page 1', () => {
    expect(
      ledgerPageHref({ account: 'acc-1', from: '2026-01-01', vendor: '' }, 1)
    ).toBe('/finance/ledger?account=acc-1&from=2026-01-01')
  })

  it('adds the page number after page 1', () => {
    expect(ledgerPageHref({ to: '2026-12-31' }, 4)).toBe(
      '/finance/ledger?to=2026-12-31&page=4'
    )
    expect(ledgerPageHref({}, 2)).toBe('/finance/ledger?page=2')
  })

  it('is the bare ledger path with no filters on page 1', () => {
    expect(ledgerPageHref({}, 1)).toBe('/finance/ledger')
  })
})
