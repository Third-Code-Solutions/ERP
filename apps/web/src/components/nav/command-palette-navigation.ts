/**
 * Move through the command palette's actionable options.
 *
 * Keeping this pure makes keyboard behavior deterministic and testable without
 * rendering the palette or touching browser state.
 */
export function nextCommandPaletteIndex(
  current: number,
  optionCount: number,
  direction: 1 | -1
): number {
  const count = Math.max(0, Math.floor(optionCount))
  if (count === 0) return -1

  const start =
    current >= 0 && current < count ? current : direction === 1 ? -1 : count
  return (start + direction + count * 2) % count
}

export function activeCommandPaletteIndex(
  index: number,
  optionCount: number
): number {
  const count = Math.max(0, Math.floor(optionCount))
  return index >= 0 && index < count ? index : -1
}
