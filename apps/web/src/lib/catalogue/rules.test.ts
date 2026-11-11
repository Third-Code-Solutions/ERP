import { describe, expect, it } from 'vitest'
import {
  CATALOGUE_TRADES,
  MAX_CATALOGUE_PRICE_CENTAVOS,
  catalogueFlagProblem,
  checkedOnProblem,
  cleanMultiLine,
  cleanSingleLine,
  codeMatchesTrade,
  currentPriceByRegion,
  manilaToday,
  parseSourceUrl,
  phpToCentavos,
  priceRangeProblem,
  splitCatalogueFlags,
} from './rules'

describe('catalogue trades', () => {
  it('lists the 20 trades with unique slugs and code prefixes', () => {
    expect(CATALOGUE_TRADES).toHaveLength(20)
    expect(new Set(CATALOGUE_TRADES.map((trade) => trade.slug)).size).toBe(20)
    expect(new Set(CATALOGUE_TRADES.map((trade) => trade.prefix)).size).toBe(20)
  })

  it('matches a seeded code to the prefix of its trade', () => {
    expect(codeMatchesTrade('CN-0001', 'concrete')).toBe(true)
    expect(codeMatchesTrade('CN-0001', 'paint')).toBe(false)
    expect(codeMatchesTrade('CN-001', 'concrete')).toBe(false)
    expect(codeMatchesTrade('SUP-12', 'concrete')).toBe(false)
  })
})

describe('PHP to centavos', () => {
  it.each([
    ['240', 24_000],
    ['1234.5', 123_450],
    ['1,234.56', 123_456],
    ['₱1,234.56', 123_456],
    ['PHP 755', 75_500],
    ['0', 0],
  ])('converts %s exactly', (text, centavos) => {
    expect(phpToCentavos(text)).toEqual({ ok: true, centavos })
  })

  it('rounds half-up at the centavo', () => {
    expect(phpToCentavos('0.005')).toEqual({ ok: true, centavos: 1 })
    expect(phpToCentavos('0.004')).toEqual({ ok: true, centavos: 0 })
    expect(phpToCentavos('1,234.565')).toEqual({ ok: true, centavos: 123_457 })
  })

  it('has no float noise where Math.round(php * 100) goes wrong', () => {
    // 1.005 * 100 = 100.49999999999999 and 8.345 * 100 = 834.4999999999999
    expect(phpToCentavos('1.005')).toEqual({ ok: true, centavos: 101 })
    expect(phpToCentavos('8.345')).toEqual({ ok: true, centavos: 835 })
    expect(phpToCentavos('0.1')).toEqual({ ok: true, centavos: 10 })
    expect(phpToCentavos('4.35')).toEqual({ ok: true, centavos: 435 })
  })

  it.each(['', 'abc', '1.1e3', '-5', '(5)', '1,23', '12 000'])('rejects %j', (text) => {
    expect(phpToCentavos(text).ok).toBe(false)
  })

  it('rejects an amount above the catalogue ceiling', () => {
    expect(phpToCentavos('99999999999.99')).toEqual({
      ok: true,
      centavos: MAX_CATALOGUE_PRICE_CENTAVOS,
    })
    expect(phpToCentavos('100000000000')).toEqual({ ok: false, problem: 'OUT_OF_RANGE' })
  })
})

describe('low <= average <= high', () => {
  it('accepts an ordered range and equal prices', () => {
    expect(priceRangeProblem({ low: 100, avg: 150, high: 200 })).toBeNull()
    expect(priceRangeProblem({ low: 0, avg: 0, high: 0 })).toBeNull()
    expect(priceRangeProblem({ low: 755, avg: 755, high: 755 })).toBeNull()
  })

  it('rejects a low above the average, an average above the high and bad amounts', () => {
    expect(priceRangeProblem({ low: 151, avg: 150, high: 200 })).toMatch(/low price/)
    expect(priceRangeProblem({ low: 100, avg: 201, high: 200 })).toMatch(/average price/)
    expect(priceRangeProblem({ low: -1, avg: 0, high: 0 })).toMatch(/non-negative/)
    expect(priceRangeProblem({ low: 1.5, avg: 2, high: 3 })).toMatch(/whole/)
  })
})

describe('flag tokens', () => {
  it('accepts every documented token and STALE_<yyyy>', () => {
    expect(
      catalogueFlagProblem('SINGLE_SOURCE;STALE_2024;NON_NCR;LOW_AUTHORITY;SNIPPET_ONLY'),
    ).toBeNull()
    expect(catalogueFlagProblem('NO_SOURCE')).toBeNull()
    expect(catalogueFlagProblem('')).toBeNull()
  })

  it('rejects unknown, malformed and repeated tokens', () => {
    expect(catalogueFlagProblem('STALE')).toMatch(/unknown flag token "STALE"/)
    expect(catalogueFlagProblem('STALE_24')).toMatch(/unknown/)
    expect(catalogueFlagProblem('low_authority')).toMatch(/unknown/)
    expect(catalogueFlagProblem('NON_NCR;NON_NCR')).toMatch(/repeat/)
  })

  it('splits a stored flag field into tokens', () => {
    expect(splitCatalogueFlags('SINGLE_SOURCE; STALE_2024')).toEqual(['SINGLE_SOURCE', 'STALE_2024'])
    expect(splitCatalogueFlags(null)).toEqual([])
  })
})

describe('text hygiene', () => {
  it('turns tabs and line breaks into spaces and drops other controls in one-line fields', () => {
    expect(cleanSingleLine('  Portland\tcement\r\n40 kg\u0000\u0007\u007F ')).toBe(
      'Portland cement 40 kg',
    )
  })

  it('keeps line feeds and tabs in multi-line fields but drops other controls', () => {
    expect(cleanMultiLine(' line 1\r\nline\t2\rline 3\u0001\u001F ')).toBe(
      'line 1\nline\t2\nline 3',
    )
  })

  // Each would let stored text read differently from what it holds.
  const hidden = [
    ['C1 control', '\u0085'],
    ['C1 control', '\u009B'],
    ['zero-width space', '\u200B'],
    ['zero-width joiner', '\u200D'],
    ['right-to-left mark', '\u200F'],
    ['left-to-right embedding', '\u202A'],
    ['right-to-left override', '\u202E'],
    ['left-to-right isolate', '\u2066'],
    ['pop directional isolate', '\u2069'],
    ['byte order mark', '\uFEFF'],
    ['lone high surrogate', '\uD800'],
    ['lone low surrogate', '\uDC00'],
  ] as const

  it.each(hidden)('drops a %s (%j) from one-line and multi-line fields', (_name, character) => {
    expect(cleanSingleLine(`Cement${character} 40 kg`)).toBe('Cement 40 kg')
    expect(cleanMultiLine(`Cement${character}\n40 kg`)).toBe('Cement\n40 kg')
  })

  it('keeps a whole surrogate pair and the text around a stripped override', () => {
    expect(cleanSingleLine('Tiles 😀 grade A')).toBe('Tiles 😀 grade A')
    // "invoice\u202Efdp.exe" would display reversed; stripped, it reads as stored.
    expect(cleanSingleLine('invoice\u202Efdp.exe')).toBe('invoicefdp.exe')
  })

  it('treats the Unicode line and paragraph separators as line breaks', () => {
    expect(cleanSingleLine('line 1\u2028line 2\u2029line 3')).toBe('line 1 line 2 line 3')
    expect(cleanMultiLine('line 1\u2028line 2\u2029line 3')).toBe('line 1\nline 2\nline 3')
  })

  it('leaves formula-like text alone (handled at export time)', () => {
    for (const value of ['=SUM(A1)', '+63 917', '-5 mm', '@home']) {
      expect(cleanSingleLine(value)).toBe(value)
      expect(cleanMultiLine(value)).toBe(value)
    }
  })
})

describe('source URL', () => {
  it('stores the parsed href of an http(s) URL', () => {
    expect(parseSourceUrl('HTTPS://Example.com/a?b=1#c')).toEqual({
      ok: true,
      href: 'https://example.com/a?b=1#c',
    })
    expect(parseSourceUrl('http://example.com')).toEqual({ ok: true, href: 'http://example.com/' })
  })

  it.each([
    ['javascript:alert(1)', /http/],
    ['ftp://example.com/list.csv', /http/],
    ['data:text/html,x', /http/],
    ['https://user:secret@example.com/', /username or password/],
    ['https://user@example.com/', /username or password/],
    ['https://example.com/a b', /whitespace/],
    ['https://example.com/\tx', /whitespace/],
    ['example.com/price-list', /valid URL/],
    ['//example.com', /valid URL/],
    [`https://example.com/${'a'.repeat(2_000)}`, /at most 2000/],
  ])('rejects %s', (value, reason) => {
    const result = parseSourceUrl(value)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(reason)
  })
})

describe('checked date', () => {
  it('uses the Manila calendar date as today', () => {
    // 16:30 UTC on the 9th is already 00:30 on the 10th in Manila (UTC+8).
    expect(manilaToday(new Date('2026-11-09T16:30:00Z'))).toBe('2026-11-10')
    expect(manilaToday(new Date('2026-11-09T15:59:00Z'))).toBe('2026-11-09')
  })

  it('accepts today and the past, rejects the future and malformed dates', () => {
    expect(checkedOnProblem('2026-11-10', '2026-11-10')).toBeNull()
    expect(checkedOnProblem('2013-01-31', '2026-11-10')).toBeNull()
    expect(checkedOnProblem('2026-11-11', '2026-11-10')).toMatch(/after today/)
    expect(checkedOnProblem('2026-02-30', '2026-11-10')).toMatch(/real date/)
    expect(checkedOnProblem('11/05/2026', '2026-11-10')).toMatch(/real date/)
    expect(checkedOnProblem('', '2026-11-10')).toMatch(/real date/)
  })
})

describe('current price selection', () => {
  const observation = (
    id: string,
    region: string,
    checked_on: string,
    created: string,
    price_avg_centavos: number | null = 26_500,
  ) => ({ id, region, checked_on, created_at: new Date(created), price_avg_centavos })

  it('picks the newest checked date in each region, then the newest recorded row', () => {
    const current = currentPriceByRegion([
      observation('old', 'NCR', '2026-01-10', '2026-01-10T00:00:00Z'),
      observation('first-today', 'NCR', '2026-11-05', '2026-11-05T01:00:00Z'),
      observation('correction', 'NCR', '2026-11-05', '2026-11-06T09:00:00Z'),
      observation('late-entry-of-old-date', 'NCR', '2026-03-01', '2026-11-09T00:00:00Z'),
      observation('cebu', 'Region VII', '2025-06-01', '2025-06-01T00:00:00Z'),
    ])

    expect(current.get('NCR')?.id).toBe('correction')
    expect(current.get('Region VII')?.id).toBe('cebu')
    expect(current.size).toBe(2)
  })

  it('lets a price beat an observation that found none, whichever is newer', () => {
    const noSource = observation('no-source', 'NCR', '2026-11-05', '2026-11-05T02:00:00Z', null)
    const priced = (id: string, checked_on: string, created: string) =>
      observation(id, 'NCR', checked_on, created)

    for (const price of [
      priced('same-day-recorded-later', '2026-11-05', '2026-11-11T03:00:00Z'),
      priced('later-day', '2026-11-12', '2026-11-12T03:00:00Z'),
      // The case a re-seed creates: the price is older than the "no source" row.
      priced('earlier-day', '2026-11-01', '2026-11-01T03:00:00Z'),
      priced('same-day-recorded-earlier', '2026-11-05', '2026-11-05T01:00:00Z'),
    ]) {
      // Whichever way the observations arrive.
      expect(currentPriceByRegion([noSource, price]).get('NCR')).toBe(price)
      expect(currentPriceByRegion([price, noSource]).get('NCR')).toBe(price)
    }
  })

  it('still takes the newest of several prices, ignoring a newer observation without one', () => {
    const current = currentPriceByRegion([
      observation('no-source-newest', 'NCR', '2026-11-10', '2026-11-10T00:00:00Z', null),
      observation('old-price', 'NCR', '2026-01-10', '2026-01-10T00:00:00Z'),
      observation('new-price', 'NCR', '2026-06-01', '2026-06-01T00:00:00Z'),
    ])

    expect(current.get('NCR')?.id).toBe('new-price')
  })

  it('makes an observation without a price current only where nothing was ever priced', () => {
    const current = currentPriceByRegion([
      observation('ncr-no-source-old', 'NCR', '2026-01-10', '2026-01-10T00:00:00Z', null),
      observation('ncr-no-source-new', 'NCR', '2026-11-05', '2026-11-05T00:00:00Z', null),
      observation('cebu-price', 'Region VII', '2025-06-01', '2025-06-01T00:00:00Z'),
      observation('cebu-no-source', 'Region VII', '2026-11-05', '2026-11-05T00:00:00Z', null),
    ])

    expect(current.get('NCR')?.id).toBe('ncr-no-source-new')
    expect(current.get('Region VII')?.id).toBe('cebu-price')
  })

  it('returns nothing for an item without observations and does not reorder its input', () => {
    const history = [
      observation('a', 'NCR', '2026-01-01', '2026-01-01T00:00:00Z'),
      observation('b', 'NCR', '2026-02-01', '2026-02-01T00:00:00Z'),
    ]
    expect(currentPriceByRegion([]).size).toBe(0)
    expect(currentPriceByRegion(history).get('NCR')?.id).toBe('b')
    expect(history.map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})
