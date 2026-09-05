import { describe, expect, it } from 'vitest'
import { fitGraphCamera, graphLabelFits } from './graph-layout'

describe('Cortex graph viewport', () => {
  it.each([240, 390, 768, 1200])('fits all graph points within a %ipx canvas', (width) => {
    const points = Array.from({ length: 400 }, (_, i) => ({ x: Math.cos(i) * i * 8, y: Math.sin(i) * i * 8 }))
    const camera = fitGraphCamera(points, width, 480)
    for (const point of points) {
      expect(point.x * camera.k + camera.x).toBeGreaterThanOrEqual(8)
      expect(point.x * camera.k + camera.x).toBeLessThanOrEqual(width - 8)
      expect(point.y * camera.k + camera.y).toBeGreaterThanOrEqual(8)
      expect(point.y * camera.k + camera.y).toBeLessThanOrEqual(472)
    }
  })
  it('handles empty, nonfinite and coincident positions', () => {
    expect(fitGraphCamera([{ x: NaN, y: 0 }], 300, 400)).toEqual({ x: 150, y: 200, k: 1 })
    expect(fitGraphCamera([{ x: 10, y: 10 }], 300, 400).k).toBeLessThanOrEqual(2)
  })
  it('rejects overlapping or clipped labels while accepting separated ones', () => {
    const box = { x: 20, y: 60, width: 90, height: 16 }
    expect(graphLabelFits(box, [box], 400, 480)).toBe(false)
    expect(graphLabelFits({ ...box, y: 100 }, [box], 400, 480)).toBe(true)
    expect(graphLabelFits({ ...box, x: 350 }, [], 400, 480)).toBe(false)
    expect(graphLabelFits({ ...box, y: 430 }, [], 400, 480)).toBe(false)
  })
})
