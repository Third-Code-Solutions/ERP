import { describe, expect, it } from 'vitest'
import {
  CATALOGUE_TRADES,
  MAX_CATALOGUE_PRICE_CENTAVOS,
  catalogueFlagProblem,
  checkedOnProblem,
  cleanMultiLine,
  cleanSingleLine,
  codeMatchesTrade,
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
    ['Arabic letter mark', '\u061C'],
    ['Mongolian vowel separator', '\u180E'],
    ['word joiner', '\u2060'],
    ['invisible plus', '\u2064'],
    ['inhibit symmetric swapping control', '\u206A'],
    ['nominal digit shapes control', '\u206F'],
    ['Hangul filler', '\u3164'],
    ['halfwidth Hangul filler', '\uFFA0'],
    ['first tag character', '\u{E0000}'],
    ['cancel tag', '\u{E007F}'],
    ['lone high surrogate', '\uD800'],
    ['lone low surrogate', '\uDC00'],
    ['soft hyphen', '\u00AD'],
    ['combining grapheme joiner', '\u034F'],
    ['Hangul choseong filler', '\u115F'],
    ['Hangul jungseong filler', '\u1160'],
    ['Khmer inherent vowel aq', '\u17B4'],
    ['Khmer inherent vowel aa', '\u17B5'],
    ['first Mongolian free variation selector', '\u180B'],
    ['third Mongolian free variation selector', '\u180D'],
    ['fourth Mongolian free variation selector', '\u180F'],
    ['unassigned format control between the operators and the isolates', '\u2065'],
    ['blank braille pattern', '\u2800'],
    ['interlinear annotation anchor', '\uFFF9'],
    ['interlinear annotation terminator', '\uFFFB'],
    ['object replacement character', '\uFFFC'],
    ['first supplementary variation selector', '\u{E0100}'],
    ['last supplementary variation selector', '\u{E01EF}'],
  ] as const

  it.each(hidden)('drops a %s (%j) from one-line and multi-line fields', (_name, character) => {
    expect(cleanSingleLine(`Cement${character} 40 kg`)).toBe('Cement 40 kg')
    expect(cleanMultiLine(`Cement${character}\n40 kg`)).toBe('Cement\n40 kg')
  })

  it('keeps a whole surrogate pair and the text around a stripped override', () => {
    expect(cleanSingleLine('Tiles 😀 grade A')).toBe('Tiles 😀 grade A')
    // A lone surrogate right beside a whole pair goes; the pair stays.
    expect(cleanSingleLine('Tiles \uD800😀\uDC00 grade A')).toBe('Tiles 😀 grade A')
    expect(cleanMultiLine('\uDBFF\uD83D\uDE00')).toBe('😀')
    // "invoice\u202Efdp.exe" would display reversed; stripped, it reads as stored.
    expect(cleanSingleLine('invoice\u202Efdp.exe')).toBe('invoicefdp.exe')
  })

  it('keeps the variation selectors U+FE00-U+FE0F that emoji use', () => {
    expect(cleanSingleLine('Heart \u2764\uFE0F red')).toBe('Heart \u2764\uFE0F red')
    expect(cleanMultiLine('\u{1F6E0}\uFE0F tools')).toBe('\u{1F6E0}\uFE0F tools')
    expect(cleanSingleLine('Fork\uFE00')).toBe('Fork\uFE00')
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
