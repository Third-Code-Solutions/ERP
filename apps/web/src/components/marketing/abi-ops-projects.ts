/**
 * Illustrative portfolio for the skyline. These are samples, not clients.
 * Order matters: project N is drawn as building N of the skyline artwork.
 */
export type ProjectType = 'Fit-out' | 'MEP' | 'Base build'
export type GpSignal = 'ok' | 'watch' | 'alert'

export interface SkylineProject {
  readonly id: string
  readonly name: string
  readonly location: string
  readonly type: ProjectType
  readonly stage: string
  readonly areaM2: number
  readonly tcv: number
  /** Planned gross profit, in percent of contract value. */
  readonly gpPlan: number
  /** Forecast gross profit for projects already in execution. */
  readonly gpForecast: number | null
  readonly summary: string
}

export const skylineProjects: readonly SkylineProject[] = [
  {
    id: 'p1',
    name: 'Clinic Fit-out',
    location: 'Quezon City',
    type: 'Fit-out',
    stage: 'Closed won',
    areaM2: 620,
    tcv: 9_800_000,
    gpPlan: 24.5,
    gpForecast: null,
    summary: 'Consulting rooms, procedure suite and reception with medical gas and nurse call.',
  },
  {
    id: 'p2',
    name: 'Level 14 Office Fit-out',
    location: 'Makati City',
    type: 'Fit-out',
    stage: 'BOM submission',
    areaM2: 760,
    tcv: 18_400_000,
    gpPlan: 22,
    gpForecast: null,
    summary: 'Open floor, meeting rooms, pantry and core. Draft BOM extracted from the drawing set.',
  },
  {
    id: 'p3',
    name: 'Market Hall Base Build',
    location: 'Laguna',
    type: 'Base build',
    stage: 'Execution',
    areaM2: 4_200,
    tcv: 96_000_000,
    gpPlan: 14,
    gpForecast: 12.6,
    summary: 'Arcaded frame, slab and cladding for a covered market, billed on progress.',
  },
  {
    id: 'p4',
    name: 'Heritage Hall MEP Upgrade',
    location: 'Cebu City',
    type: 'MEP',
    stage: 'Negotiation',
    areaM2: 1_850,
    tcv: 42_600_000,
    gpPlan: 18.5,
    gpForecast: null,
    summary: 'Power, cooling and fire protection threaded through a protected structure.',
  },
  {
    id: 'p5',
    name: 'Site Guardhouse and Gate',
    location: 'Cavite',
    type: 'Base build',
    stage: 'Scoping',
    areaM2: 45,
    tcv: 3_400_000,
    gpPlan: 21,
    gpForecast: null,
    summary: 'Guardhouse, barrier gate and perimeter lighting for a new logistics site.',
  },
  {
    id: 'p6',
    name: 'Creative Office Stack Fit-out',
    location: 'Taguig City',
    type: 'Fit-out',
    stage: 'Scoping',
    areaM2: 2_400,
    tcv: 37_500_000,
    gpPlan: 20.5,
    gpForecast: null,
    summary: 'Offset floor plates fitted out with pantry, server room and acoustic meeting pods.',
  },
  {
    id: 'p7',
    name: 'Transit Canopy Electrical',
    location: 'Pasig City',
    type: 'MEP',
    stage: 'Execution',
    areaM2: 1_500,
    tcv: 21_000_000,
    gpPlan: 17,
    gpForecast: 14.9,
    summary: 'Lighting, charging points and distribution boards under a long-span canopy.',
  },
  {
    id: 'p8',
    name: 'Hillside Villa Base Build',
    location: 'Tagaytay',
    type: 'Base build',
    stage: 'Execution',
    areaM2: 980,
    tcv: 12_800_000,
    gpPlan: 19,
    gpForecast: 19.2,
    summary: 'Terraced structure, stair and roof deck on a sloping plot.',
  },
  {
    id: 'p9',
    name: 'Resort Villa MEP',
    location: 'Palawan',
    type: 'MEP',
    stage: 'Negotiation',
    areaM2: 640,
    tcv: 16_200_000,
    gpPlan: 18,
    gpForecast: null,
    summary: 'Pumps, solar hot water and distribution for a low-rise beachfront villa.',
  },
]

export const projectTypes: readonly ('All' | ProjectType)[] = [
  'All',
  'Fit-out',
  'MEP',
  'Base build',
]

const WATCH_POINTS = 0.5
const ALERT_POINTS = 1.5

export function gpAmount(project: SkylineProject): number {
  return Math.round((project.tcv * project.gpPlan) / 100)
}

/** Points of gross profit lost against plan; null before execution starts. */
export function gpErosionPoints(project: SkylineProject): number | null {
  if (project.gpForecast === null) return null
  return Math.round((project.gpPlan - project.gpForecast) * 10) / 10
}

export function gpSignal(project: SkylineProject): GpSignal | null {
  const erosion = gpErosionPoints(project)
  if (erosion === null) return null
  if (erosion > ALERT_POINTS) return 'alert'
  if (erosion > WATCH_POINTS) return 'watch'
  return 'ok'
}
