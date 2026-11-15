/**
 * The memory network drawn inside the brain, and the story logic that runs on
 * it. Pure data and graph maths: no rendering, so it can be tested directly.
 * Coordinates are already in glTF axes (Y up, frontal lobe toward -Z).
 */
export type Vec3 = readonly [number, number, number]

export interface BrainNode {
  readonly p: Vec3
  /** 0 frontal, 1 parietal, 2 temporal, 3 occipital, 4 deep. */
  readonly r: number
  /** Index into `types`. */
  readonly t: number
  /** 1 when the record belongs to another tenant. */
  readonly k: 0 | 1
}

/** [from node, to node, origin: 0 canonical, 1 derived, 2 AI-inferred] */
export type BrainEdge = readonly [number, number, number]

export interface BrainGraph {
  readonly types: readonly string[]
  readonly nodes: readonly BrainNode[]
  readonly edges: readonly BrainEdge[]
  readonly tracts: readonly (readonly Vec3[])[]
  readonly anchors: Readonly<Record<string, Vec3>>
}

/** Record types a finance seat is allowed to open in the story. */
export const FINANCE_TYPE_NAMES: readonly string[] = [
  'Project', 'Account', 'Contract', 'Vendor', 'Purchase Order', 'Invoice',
  'Claim', 'Cost Entry', 'Document', 'Variation Order',
]

export type NodeAccess = 'open' | 'role' | 'tenant'

/** open: inside this seat's access; role: hidden by role; tenant: another tenant. */
export function nodeAccess(graph: BrainGraph, index: number): NodeAccess {
  const node = graph.nodes[index]
  if (!node) return 'tenant'
  if (node.k === 1) return 'tenant'
  const name = graph.types[node.t] ?? ''
  return FINANCE_TYPE_NAMES.includes(name) ? 'open' : 'role'
}

export function buildAdjacency(
  nodeCount: number,
  edges: readonly BrainEdge[],
  isAllowed: (index: number) => boolean = () => true,
): number[][] {
  const adjacency: number[][] = Array.from({ length: nodeCount }, () => [])
  for (const [a, b] of edges) {
    if (!isAllowed(a) || !isAllowed(b)) continue
    adjacency[a]?.push(b)
    adjacency[b]?.push(a)
  }
  return adjacency
}

/** Hop count from `start`; Infinity where a node cannot be reached. */
export function bfsDistances(adjacency: readonly (readonly number[])[], start: number): number[] {
  const distance = adjacency.map(() => Number.POSITIVE_INFINITY)
  distance[start] = 0
  const queue = [start]
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head] ?? 0
    for (const next of adjacency[current] ?? []) {
      if ((distance[next] ?? 0) !== Number.POSITIVE_INFINITY) continue
      distance[next] = (distance[current] ?? 0) + 1
      queue.push(next)
    }
  }
  return distance
}

export function shortestPath(
  adjacency: readonly (readonly number[])[],
  start: number,
  goal: number,
): number[] | null {
  const previous = new Map<number, number>([[start, -1]])
  const queue = [start]
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head] ?? 0
    if (current === goal) break
    for (const next of adjacency[current] ?? []) {
      if (previous.has(next)) continue
      previous.set(next, current)
      queue.push(next)
    }
  }
  if (!previous.has(goal)) return null
  const path = [goal]
  while (path[0] !== start) path.unshift(previous.get(path[0] ?? start) ?? start)
  return path
}

const sq = (value: number): number => value * value

export function distanceSq(a: Vec3, b: Vec3): number {
  return sq(a[0] - b[0]) + sq(a[1] - b[1]) + sq(a[2] - b[2])
}

export function nearestNode(
  graph: BrainGraph,
  point: Vec3,
  accept: (index: number) => boolean,
): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  graph.nodes.forEach((node, index) => {
    if (!accept(index)) return
    const d = distanceSq(node.p, point)
    if (d < bestDistance) {
      bestDistance = d
      best = index
    }
  })
  return best
}

export interface BrainStory {
  readonly queryNode: number
  readonly goalNode: number
  /** Citation chain from the question to the answer, inclusive. */
  readonly path: readonly number[]
  /** Hops from the question to every node the seat may open. */
  readonly distance: readonly number[]
  readonly maxDistance: number
  /** Where each story beat is pinned, by label id. */
  readonly pins: Readonly<Record<string, number>>
}

const MIN_CITATION_HOPS = 4
const MAX_CITATION_HOPS = 6

export function buildStory(graph: BrainGraph): BrainStory {
  const open = (index: number): boolean => nodeAccess(graph, index) === 'open'
  const adjacency = buildAdjacency(graph.nodes.length, graph.edges, open)
  const queryAnchor = graph.anchors.query ?? [0, 0, -6]
  const queryNode = nearestNode(graph, queryAnchor, open)
  const distance = bfsDistances(adjacency, queryNode)
  const finite = distance.filter((d) => Number.isFinite(d))
  const maxDistance = Math.max(...finite, 1)

  const answerTypes = ['Claim', 'Invoice', 'Purchase Order', 'Variation Order']
  const isAnswer = (index: number): boolean => {
    const node = graph.nodes[index]
    return Boolean(node) && answerTypes.includes(graph.types[node?.t ?? 0] ?? '')
  }
  const candidates = distance
    .map((d, index) => ({ d, index }))
    .filter(({ d, index }) => d >= MIN_CITATION_HOPS && d <= MAX_CITATION_HOPS && isAnswer(index))
    .sort((a, b) => b.d - a.d || a.index - b.index)
  const fallback = distance
    .map((d, index) => ({ d, index }))
    .filter(({ d }) => Number.isFinite(d) && d >= MIN_CITATION_HOPS)
    .sort((a, b) => a.d - b.d || a.index - b.index)
  const goalNode = (candidates[0] ?? fallback[0])?.index ?? queryNode
  const path = shortestPath(adjacency, queryNode, goalNode) ?? [queryNode]

  const pick = (type: string, skip = 0): number => {
    const found = graph.nodes
      .map((node, index) => ({ node, index }))
      .filter(({ node, index }) => open(index) && graph.types[node.t] === type)
    return found[skip]?.index ?? queryNode
  }
  const foreign = graph.nodes.findIndex((node) => node.k === 1)
  const roleHidden = graph.nodes.findIndex((_, index) => nodeAccess(graph, index) === 'role')

  const pins: Record<string, number> = {
    'rec-po': pick('Purchase Order'),
    'rec-claim': pick('Claim'),
    'rec-vo': pick('Variation Order'),
    lock: foreign >= 0 ? foreign : queryNode,
    role: roleHidden >= 0 ? roleHidden : queryNode,
    query: queryNode,
  }
  const steps = Math.max(path.length - 1, 1)
  for (let k = 1; k <= 4; k += 1) {
    pins[`cite-${k}`] = path[Math.min(path.length - 1, Math.round((k / 4) * steps))] ?? goalNode
  }
  return { queryNode, goalNode, path, distance, maxDistance, pins }
}

/** A gentle arc between two nodes; the bow is deterministic per edge. */
export function edgePolyline(a: Vec3, b: Vec3, seed: number, segments: number): Vec3[] {
  const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const dir: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const length = Math.hypot(...dir) || 1
  // a perpendicular that does not collapse for any direction
  const helper: Vec3 = Math.abs(dir[1] / length) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const cross: [number, number, number] = [
    dir[1] * helper[2] - dir[2] * helper[1],
    dir[2] * helper[0] - dir[0] * helper[2],
    dir[0] * helper[1] - dir[1] * helper[0],
  ]
  const crossLength = Math.hypot(...cross) || 1
  const sign = Math.sin(seed * 12.9898) > 0 ? 1 : -1
  const bow = (0.14 + 0.16 * Math.abs(Math.sin(seed * 78.233))) * length * sign
  const control: Vec3 = [
    mid[0] + (cross[0] / crossLength) * bow,
    mid[1] + (cross[1] / crossLength) * bow,
    mid[2] + (cross[2] / crossLength) * bow,
  ]
  const points: Vec3[] = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const u = 1 - t
    points.push([
      u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * control[2] + t * t * b[2],
    ])
  }
  return points
}

/** Point `t` (0 to 1) along a polyline, by arc length. */
export function samplePolyline(points: readonly Vec3[], lengths: readonly number[], t: number): Vec3 {
  const total = lengths[lengths.length - 1] ?? 0
  const target = Math.min(Math.max(t, 0), 1) * total
  let index = 1
  while (index < lengths.length - 1 && (lengths[index] ?? 0) < target) index += 1
  const a = points[index - 1] ?? [0, 0, 0]
  const b = points[index] ?? a
  const start = lengths[index - 1] ?? 0
  const span = (lengths[index] ?? start) - start || 1
  const f = (target - start) / span
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

export function cumulativeLengths(points: readonly Vec3[]): number[] {
  const lengths = [0]
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] ?? [0, 0, 0]
    const b = points[i] ?? a
    lengths.push((lengths[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))
  }
  return lengths
}

export const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1)
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
