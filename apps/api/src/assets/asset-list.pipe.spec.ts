import { describe, expect, it } from 'vitest'
import { AssetListPipe } from './asset-list.pipe'

describe('AssetListPipe', () => {
  it('parses bounded filters', () => {
    expect(
      new AssetListPipe().transform({
        q: '  crane ',
        kind: 'equipment',
        status: 'maintenance',
        sort: 'asset_tag',
        order: 'asc',
        page: '2',
        limit: '50',
      })
    ).toEqual({
      q: 'crane',
      kind: 'equipment',
      status: 'maintenance',
      sort: 'asset_tag',
      order: 'asc',
      page: 2,
      limit: 50,
    })
  })

  it('rejects unsupported query fields', () => {
    expect(() => new AssetListPipe().transform({ cursor: 'unexpected' })).toThrow(
      'Invalid asset list query'
    )
  })
})
