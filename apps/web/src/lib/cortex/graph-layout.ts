export interface GraphPoint { x?: number; y?: number }
export interface GraphLabelBox { x: number; y: number; width: number; height: number }

/** Camera uses the actual canvas bounds, not the page or an assumed drawer width. */
export function fitGraphCamera(points: GraphPoint[], width: number, height: number) {
  const valid = points.filter((p): p is { x: number; y: number } =>
    Number.isFinite(p.x) && Number.isFinite(p.y))
  if (!valid.length || width <= 0 || height <= 0) return { x: width / 2, y: height / 2, k: 1 }
  const xs = valid.map((p) => p.x)
  const ys = valid.map((p) => p.y)
  const left = Math.min(...xs), right = Math.max(...xs)
  const top = Math.min(...ys), bottom = Math.max(...ys)
  const k = Math.min(2, Math.max(.02, Math.min(
    Math.max(40, width - Math.min(144, width * .24)) / Math.max(80, right - left),
    Math.max(40, height - 144) / Math.max(80, bottom - top),
  )))
  return { k, x: width / 2 - (left + right) / 2 * k, y: height / 2 - (top + bottom) / 2 * k }
}

/** Screen-space label collision policy remains stable at every zoom level. */
export function graphLabelFits(box: GraphLabelBox, occupied: GraphLabelBox[], width: number, height: number) {
  if (box.x < 8 || box.y < 40 || box.x + box.width > width - 8 || box.y + box.height > height - 64) return false
  return !occupied.some((other) => box.x < other.x + other.width + 6 &&
    box.x + box.width + 6 > other.x && box.y < other.y + other.height + 4 &&
    box.y + box.height + 4 > other.y)
}
