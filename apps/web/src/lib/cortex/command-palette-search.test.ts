import { describe, expect, it } from 'vitest'
import { normalizeCortexPaletteHits } from './command-palette-search'

describe('normalizeCortexPaletteHits', () => {
  it('keeps actionable sources and trims presentation copy', () => {
    expect(
      normalizeCortexPaletteHits([
        {
          id: 'node-1',
          label: ' Invoice ',
          title: ' Invoice 1042 ',
          summary: ' Concrete Tower ',
          href: '/invoices/1',
          freshness: 'fresh',
        },
        {
          id: 'node-2',
          label: 'Document',
          title: 'No route',
          summary: null,
          href: null,
          freshness: 'unknown',
        },
      ])
    ).toEqual([
      {
        type: 'cortex',
        id: 'node-1',
        label: 'Invoice',
        title: 'Invoice 1042',
        summary: 'Concrete Tower',
        href: '/invoices/1',
        freshness: 'fresh',
      },
    ])
  })

  it('uses safe fallback labels for blank source copy', () => {
    expect(
      normalizeCortexPaletteHits([
        {
          id: 'node-3',
          label: ' ',
          title: ' ',
          summary: ' ',
          href: '/projects/1',
          freshness: 'stale',
        },
      ])[0]
    ).toMatchObject({
      label: 'Cortex source',
      title: 'Cortex source',
      summary: null,
    })
  })
})
