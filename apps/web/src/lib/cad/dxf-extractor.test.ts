import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  parseSync: vi.fn(),
}))

vi.mock('dxf-parser', () => ({
  default: function MockDxfParser() {
    return { parseSync: mocks.parseSync }
  },
}))

import { extractFromDxfText } from './dxf-extractor'

describe('DXF scope extraction', () => {
  beforeEach(() => {
    mocks.parseSync.mockReset()
    mocks.parseSync.mockReturnValue({
      entities: [
        {
          type: 'LWPOLYLINE',
          layer: 'ARCH-ROOM',
          shape: true,
          vertices: [
            { x: 0, y: 0 },
            { x: 1.5, y: 0 },
            { x: 1.5, y: 1 },
            { x: 0, y: 1 },
          ],
        },
      ],
      tables: { layer: { layers: { 'ARCH-ROOM': {} } } },
    })
  })

  it('preserves a fractional floor area rather than rounding source evidence', () => {
    const result = extractFromDxfText('minimal DXF fixture')

    expect(result.items).toEqual([
      expect.objectContaining({
        unit: 'sqm',
        quantity: 1.5,
      }),
    ])
  })
})
