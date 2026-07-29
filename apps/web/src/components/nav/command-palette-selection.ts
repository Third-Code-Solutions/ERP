export type CommandPaletteSelection =
  | { kind: 'hit'; index: number }
  | { kind: 'ask-cortex' }
  | null

function boundedHitCount(hitCount: number): number {
  return Math.max(0, Math.floor(hitCount))
}

export function commandPaletteOptionCount(
  hitCount: number,
  canAskCortex: boolean
): number {
  return boundedHitCount(hitCount) + (canAskCortex ? 1 : 0)
}

export function resolveCommandPaletteSelection(
  activeIndex: number,
  hitCount: number,
  canAskCortex: boolean
): CommandPaletteSelection {
  const hits = boundedHitCount(hitCount)
  if (activeIndex >= 0 && activeIndex < hits) {
    return { kind: 'hit', index: activeIndex }
  }
  if (canAskCortex && activeIndex === hits) {
    return { kind: 'ask-cortex' }
  }
  return null
}
