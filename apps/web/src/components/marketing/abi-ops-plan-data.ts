/**
 * Geometry for the hero level plan. One unit is 40 mm, so every quantity the
 * lens shows (areas, door and FCU counts, partition length) is derived from
 * these shapes rather than typed in separately.
 */
export const MM_PER_UNIT = 40
const M_PER_UNIT = MM_PER_UNIT / 1000

export const PLAN_VIEWBOX = { width: 1200, height: 590 } as const
export const GRID_X = [60, 240, 420, 600, 780, 960, 1140] as const
export const GRID_Y = [60, 280, 500] as const
export const DOOR_SPAN = 24
export const WINDOW_SPAN = 120

export interface PlanRoom {
  readonly id: string
  readonly name: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly hasCeiling: boolean
  /** Vertical offset of the room label from the room centre, clear of fixtures. */
  readonly labelDy: number
}

export const planRooms: readonly PlanRoom[] = [
  { id: 'reception', name: 'Reception', x: 60, y: 60, w: 180, h: 220, hasCeiling: true, labelDy: 38 },
  { id: 'server', name: 'Server', x: 60, y: 280, w: 180, h: 120, hasCeiling: false, labelDy: 0 },
  { id: 'pantry', name: 'Pantry', x: 60, y: 400, w: 180, h: 100, hasCeiling: true, labelDy: -20 },
  { id: 'office', name: 'Open office', x: 240, y: 60, w: 540, h: 440, hasCeiling: true, labelDy: 0 },
  { id: 'meet1', name: 'Meeting 1', x: 780, y: 60, w: 180, h: 140, hasCeiling: true, labelDy: 38 },
  { id: 'meet2', name: 'Meeting 2', x: 780, y: 200, w: 180, h: 140, hasCeiling: true, labelDy: 38 },
  { id: 'lobby', name: 'Lift lobby', x: 780, y: 340, w: 180, h: 160, hasCeiling: true, labelDy: 38 },
  { id: 'core', name: 'Core', x: 960, y: 60, w: 180, h: 440, hasCeiling: false, labelDy: 0 },
]

export interface PlanOpening {
  readonly kind: 'door' | 'window'
  readonly at: number
  readonly span: number
  /** Which side of the wall a door leaf swings to. */
  readonly swing?: 1 | -1
}

export interface PlanWall {
  readonly orient: 'h' | 'v'
  /** The fixed coordinate: y for horizontal walls, x for vertical walls. */
  readonly c: number
  readonly from: number
  readonly to: number
  readonly isInterior: boolean
  readonly openings: readonly PlanOpening[]
}

const windows = (...starts: number[]): PlanOpening[] =>
  starts.map((at) => ({ kind: 'window', at, span: WINDOW_SPAN }))

const door = (at: number, swing: 1 | -1 = 1): PlanOpening => ({
  kind: 'door',
  at,
  span: DOOR_SPAN,
  swing,
})

export const planWalls: readonly PlanWall[] = [
  { orient: 'h', c: 60, from: 60, to: 1140, isInterior: false, openings: windows(90, 270, 450, 630, 810) },
  { orient: 'h', c: 500, from: 60, to: 1140, isInterior: false, openings: windows(90, 270, 450, 630) },
  { orient: 'v', c: 60, from: 60, to: 500, isInterior: false, openings: [door(150)] },
  { orient: 'v', c: 1140, from: 60, to: 500, isInterior: false, openings: [] },
  { orient: 'v', c: 240, from: 60, to: 500, isInterior: true, openings: [door(150), door(440)] },
  { orient: 'h', c: 280, from: 60, to: 240, isInterior: true, openings: [door(120)] },
  { orient: 'h', c: 400, from: 60, to: 240, isInterior: true, openings: [] },
  { orient: 'v', c: 780, from: 60, to: 500, isInterior: true, openings: [door(110), door(250), door(410)] },
  { orient: 'h', c: 200, from: 780, to: 960, isInterior: true, openings: [] },
  { orient: 'h', c: 340, from: 780, to: 960, isInterior: true, openings: [] },
  { orient: 'v', c: 960, from: 60, to: 500, isInterior: true, openings: [door(410)] },
]

export interface PlanPoint {
  readonly x: number
  readonly y: number
}

export const planFcus: readonly PlanPoint[] = [
  ...[170, 390].flatMap((y) => [330, 450, 570, 690].map((x) => ({ x, y }))),
  { x: 150, y: 100 },
  { x: 870, y: 130 },
  { x: 870, y: 270 },
  { x: 870, y: 420 },
]

/** The solid runs of a wall, with each opening cut out. */
export function wallSegments(wall: PlanWall): [number, number][] {
  const openings = [...wall.openings].sort((a, b) => a.at - b.at)
  const solid: [number, number][] = []
  let cursor = wall.from
  for (const opening of openings) {
    if (opening.at > cursor) solid.push([cursor, opening.at])
    cursor = opening.at + opening.span
  }
  if (cursor < wall.to) solid.push([cursor, wall.to])
  return solid
}

export function roomAreaM2(room: PlanRoom): number {
  return room.w * room.h * M_PER_UNIT * M_PER_UNIT
}

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0)

const round1 = (value: number): number => Math.round(value * 10) / 10

const doorCount = sum(
  planWalls.map(
    (wall) => wall.openings.filter((opening) => opening.kind === 'door').length,
  ),
)

const partitionUnits = sum(
  planWalls.filter((wall) => wall.isInterior).map((wall) => wall.to - wall.from),
)

export const planStats = {
  grossArea: round1(sum(planRooms.map(roomAreaM2))),
  ceilingArea: round1(
    sum(planRooms.filter((room) => room.hasCeiling).map(roomAreaM2)),
  ),
  fcuCount: planFcus.length,
  doorCount,
  partitionLength: round1(partitionUnits * M_PER_UNIT),
} as const

export function unitsToMm(units: number): number {
  return units * MM_PER_UNIT
}
