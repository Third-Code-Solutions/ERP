/**
 * Where each skyline building sits inside the skyline box, in percent. Derived
 * from the artwork's own geometry so the name tag and number row line up with
 * the drawings without loading the artwork itself.
 */
export const SKYLINE_ASPECT = '3904 / 788'

export interface SkylineSpot {
  /** Horizontal centre of the building. */
  readonly cx: number
  /** Where the name tag points, just above the roof. */
  readonly top: number
}

export const skylineSpots: readonly SkylineSpot[] = [
  { cx: 5.584, top: 53.807 },
  { cx: 15.318, top: 14.975 },
  { cx: 26.998, top: 74.619 },
  { cx: 39.703, top: 53.289 },
  { cx: 48.181, top: 66.497 },
  { cx: 56.916, top: 46.447 },
  { cx: 68.34, top: 70.558 },
  { cx: 79.892, top: 63.66 },
  { cx: 92.725, top: 65.025 },
]
