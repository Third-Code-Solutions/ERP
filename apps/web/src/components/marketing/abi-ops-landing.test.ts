import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  buildAdjacency,
  bfsDistances,
  buildStory,
  nodeAccess,
  shortestPath,
  type BrainGraph,
} from './abi-brain-graph'
import { landingCortexChapters, landingFaqs, landingStages } from './abi-ops-content'
import {
  planFcus,
  planRooms,
  planStats,
  planWalls,
  roomAreaM2,
  wallSegments,
} from './abi-ops-plan-data'
import {
  gpSignal,
  projectTypes,
  skylineProjects,
} from './abi-ops-projects'
import { HOUSE_FILL, houseElements } from './abi-ops-house-art'
import { STAGE_PROGRESS } from './abi-tower-scene'
import { ART_VIEWBOX, artBuildings } from './abi-ops-skyline-art'
import { skylineSpots } from './abi-ops-skyline-layout'
import {
  bomTotal,
  formatPhp,
  netReceivable,
  recordMath,
  stageRecords,
} from './abi-ops-records'

const directory = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(resolve(directory, name), 'utf8')

const landingSource = read('abi-ops-landing.tsx')
const skylineSource = read('abi-ops-skyline.tsx')
const planSource = read('abi-ops-plan.tsx')
const cortexSource = read('abi-ops-cortex.tsx')
const stylesheets = [
  'abi-ops-ui.module.css',
  'abi-ops-art.module.css',
  'abi-tower.module.css',
  'abi-brain.module.css',
  'abi-ops-cortex.module.css',
  'abi-ops-landing.module.css',
  'abi-ops-plan.module.css',
  'abi-ops-skyline.module.css',
  'abi-ops-process.module.css',
  'abi-ops-footer.module.css',
].map((name) => ({ name, css: read(name) }))
const landingContent = read('abi-ops-content.ts')

const toNumber = (text: string): number => Number(text.replace(/[^\d.-]/g, ''))

describe('ABI OPS public landing contract', () => {
  it('keeps the ABI OPS identity and clear hero actions', () => {
    expect(landingSource).toContain('ABI OPS home')
    expect(landingSource).toContain('ABI OPS connects pipeline')
    expect(landingSource).toContain('One operating system.')
    expect(landingSource).toContain('Every project in view.')
    expect(landingSource).toContain('data-hero')
    expect(landingSource).toContain('Start guided setup')
    expect(landingSource).toContain('Open workspace')
    expect(landingSource).toContain('data-analytics="hero-guided-setup"')
  })

  it('keeps the H1 as exactly two spans for the release spec', () => {
    const h1 = landingSource.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? ''
    expect(h1.match(/<span/g)).toHaveLength(2)
  })

  it('keeps accessible reviewable interactions and answerable content', () => {
    expect(cortexSource).toContain('aria-expanded={isOpen}')
    expect(landingSource).toContain('aria-live="polite"')
    expect(landingSource).toContain('<details')
    expect(landingSource).toContain('aria-label="Previous team priority"')
    expect(landingSource).toContain('aria-label="Next team priority"')
    expect(skylineSource).toContain('aria-pressed={isOn}')
    expect(skylineSource).toContain('aria-label="Previous project"')
    expect(landingFaqs).toHaveLength(5)
    expect(landingContent).toContain('human approval')
    expect(landingContent).toContain('permission-aware')
  })

  it('keeps a single blockquote so the release spec can read it', () => {
    const sources = [
      'abi-ops-landing.tsx',
      'abi-ops-skyline.tsx',
      'abi-ops-process.tsx',
      'abi-ops-footer.tsx',
      'abi-ops-cortex.tsx',
    ].map(read)
    const count = sources.reduce(
      (total, source) => total + (source.match(/<blockquote/g)?.length ?? 0),
      0,
    )
    expect(count).toBe(1)
  })

  it('keeps Cortex source-oriented and human-approved', () => {
    expect(cortexSource).toContain('id="cortex"')
    expect(cortexSource).toContain('Permissioned company intelligence')
    expect(landingSource).toContain('<CortexSection />')
    expect(landingContent).toContain('Cortex connects owners')
  })

  it('tells the Cortex story in six chapters that match the brain timeline', () => {
    expect(landingCortexChapters.map((chapter) => chapter.name)).toEqual([
      'Ingest', 'Connect', 'Recall', 'Cite', 'Approve', 'Prove',
    ])
    for (const chapter of landingCortexChapters) {
      expect(chapter.details).toHaveLength(3)
    }
    // human approval and tamper-evident history are load-bearing claims
    const prose = landingCortexChapters.map((chapter) => chapter.body + chapter.details.join(' ')).join(' ')
    expect(prose).toContain('authorized person')
    expect(prose).toContain('hash-chained')
    expect(prose).toContain('row-level security')
  })

  it('honours reduced motion in every stylesheet that animates', () => {
    for (const { name, css } of stylesheets) {
      if (/animation:|transition:/.test(css)) {
        expect(css, name).toContain('prefers-reduced-motion: reduce')
      }
    }
  })

  it('takes colour and type from the ABI OPS tokens, not the template', () => {
    const joined = stylesheets.map(({ css }) => css).join('\n')
    expect(joined).toContain('var(--color-navy-700)')
    expect(joined).toContain('var(--color-gold-500)')
    expect(joined).toContain('var(--font-inter)')
    expect(joined).toContain('var(--font-jetbrains)')
    expect(joined).not.toMatch(/#4353ff|#f5f5f1/i)
    expect(planSource).not.toMatch(/#[0-9a-f]{6}/i)
  })
})

describe('hero plan geometry', () => {
  it('derives every lens quantity from the drawing itself', () => {
    expect(planStats.fcuCount).toBe(12)
    expect(planStats.doorCount).toBe(8)
    expect(planStats.partitionLength).toBe(81.6)
    expect(planStats.grossArea).toBe(760.3)
    expect(planStats.ceilingArea).toBe(599)
  })

  it('cuts every opening out of its wall and keeps the rest solid', () => {
    const top = planWalls.find((wall) => wall.orient === 'h' && wall.c === 60)
    expect(top).toBeDefined()
    expect(wallSegments(top!)).toEqual([
      [60, 90],
      [210, 270],
      [390, 450],
      [570, 630],
      [750, 810],
      [930, 1140],
    ])
  })

  it('places every FCU inside a ceilinged room', () => {
    for (const fcu of planFcus) {
      const room = planRooms.find(
        (candidate) =>
          fcu.x > candidate.x &&
          fcu.x < candidate.x + candidate.w &&
          fcu.y > candidate.y &&
          fcu.y < candidate.y + candidate.h,
      )
      expect(room?.hasCeiling, `${fcu.x},${fcu.y}`).toBe(true)
    }
    expect(planRooms.reduce((total, room) => total + roomAreaM2(room), 0)).toBeCloseTo(
      planStats.grossArea,
      0,
    )
  })
})

describe('process records add up', () => {
  it('sums the draft BOM from its own lines', () => {
    const amounts = stageRecords.estimate.rows.map((row) => toNumber(row[3]?.text ?? ''))
    expect(amounts.reduce((total, value) => total + value, 0)).toBe(bomTotal)
    expect(stageRecords.estimate.totals[0]?.value).toBe(formatPhp(bomTotal))
  })

  it('flags the lowest quote and drafts the purchase order from it', () => {
    const lowest = stageRecords.buy.rows.find((row) => row[3]?.text === 'Lowest')
    expect(lowest?.[0]?.text).toBe('Supplier B')
    expect(stageRecords.buy.totals[0]?.value).toBe(formatPhp(recordMath.lowestRfq))
  })

  it('derives cost variance from budget and actual', () => {
    expect(recordMath.actualTotal).toBeGreaterThan(recordMath.budgetTotal)
    const signals = stageRecords.build.rows.map((row) => row[4]?.text)
    expect(signals).toEqual(['On budget', 'Alert', 'Watch', 'On budget'])
  })

  it('nets progress billing as gross plus VAT less retention', () => {
    expect(netReceivable).toBe(
      recordMath.grossBilling + recordMath.vatAmount - recordMath.retentionAmount,
    )
    expect(recordMath.grossBilling).toBe(6_440_000)
    expect(recordMath.vatAmount).toBe(772_800)
    expect(recordMath.retentionAmount).toBe(644_000)
    expect(stageRecords.bill.totals[0]?.value).toBe(formatPhp(6_568_800))
  })

  it('covers every stage the page describes', () => {
    for (const stage of landingStages) {
      expect(stageRecords[stage.id]).toBeDefined()
    }
  })
})

describe('sample portfolio skyline', () => {
  it('pairs every project with one drawn building and one layout spot', () => {
    expect(skylineProjects).toHaveLength(artBuildings.length)
    expect(skylineSpots).toHaveLength(artBuildings.length)
  })

  it('keeps the reference artwork intact and in left-to-right order', () => {
    const codes = new Set(['o', 'l', 'd', 't', 'h', 'g', 'u'])
    let edge: number = ART_VIEWBOX.x
    for (const building of artBuildings) {
      expect(building.tx).toBeGreaterThan(edge)
      edge = building.tx
      expect(building.strokes.length).toBeGreaterThan(20)
      for (const [code, d, delay, duration] of building.strokes) {
        expect(codes.has(code)).toBe(true)
        expect(d.startsWith('M')).toBe(true)
        expect(delay).toBeGreaterThanOrEqual(0)
        expect(duration).toBeGreaterThan(0)
      }
    }
    const strokeTotal = artBuildings.reduce((n, b) => n + b.strokes.length, 0)
    expect(strokeTotal).toBe(455)
  })

  it('places name tags inside the skyline box, left to right', () => {
    let previous = 0
    for (const spot of skylineSpots) {
      expect(spot.cx).toBeGreaterThan(previous)
      expect(spot.top).toBeGreaterThan(0)
      expect(spot.top).toBeLessThan(100)
      previous = spot.cx
    }
  })

  it('gives every filter at least one project', () => {
    for (const type of projectTypes) {
      const count = skylineProjects.filter(
        (project) => type === 'All' || project.type === type,
      ).length
      expect(count, type).toBeGreaterThan(0)
    }
  })

  it('signals gross-profit erosion only once a project is in execution', () => {
    for (const project of skylineProjects) {
      expect(gpSignal(project) !== null, project.name).toBe(project.stage === 'Execution')
    }
    const byId = (id: string) => skylineProjects.find((project) => project.id === id)!
    expect(gpSignal(byId('p3'))).toBe('watch')
    expect(gpSignal(byId('p7'))).toBe('alert')
    expect(gpSignal(byId('p8'))).toBe('ok')
  })
})

describe('stage-built house', () => {
  it('reveals the reference drawing cumulatively across five stages', () => {
    expect(HOUSE_FILL.startsWith('M')).toBe(true)
    expect(houseElements).toHaveLength(86)
    const perStage = [0, 0, 0, 0, 0]
    for (const element of houseElements) {
      const first = element[0] === 's' ? element[3] : element[5]
      expect(first).toBeGreaterThanOrEqual(0)
      expect(first).toBeLessThanOrEqual(4)
      perStage[first] = (perStage[first] ?? 0) + 1
    }
    expect(perStage).toEqual([19, 7, 14, 23, 23])
  })

  it('maps every process step to a stage of the drawing', () => {
    expect(landingStages).toHaveLength(5)
  })
})

describe('Blender tower model', () => {
  const modelPath = resolve(directory, '../../../public/models/abi-tower.glb')

  function glbNodeNames(): Set<string> {
    const buffer = readFileSync(modelPath)
    expect(buffer.readUInt32LE(0)).toBe(0x46546c67) // "glTF"
    const jsonLength = buffer.readUInt32LE(12)
    const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as {
      nodes: { name?: string }[]
    }
    return new Set(json.nodes.map((node) => node.name ?? ''))
  }

  it('stays light enough to load on demand', () => {
    expect(statSync(modelPath).size).toBeLessThan(2.5 * 1024 * 1024)
  })

  it('exports every named part the scene drives', () => {
    const names = glbNodeNames()
    const required = [
      'site_ground', 'plaza', 'trees', 'neighbors', 'site_fence',
      'podium_slab', 'podium_glass', 'core', 'crown_box', 'crown_fins', 'mast',
      'crane_mast', 'crane_jib', 'truck_a', 'truck_b',
    ]
    for (let floor = 1; floor <= 26; floor += 1) {
      const id = String(floor).padStart(2, '0')
      required.push(`slab_${id}`, `glass_${id}`)
    }
    for (let module = 1; module <= 8; module += 1) {
      required.push(`diagrid_${String(module).padStart(2, '0')}`)
    }
    for (const name of required) expect(names.has(name), name).toBe(true)
  })

  it('maps each process stage to a later point on the build timeline', () => {
    expect(STAGE_PROGRESS).toHaveLength(landingStages.length)
    for (let i = 1; i < STAGE_PROGRESS.length; i += 1) {
      expect(STAGE_PROGRESS[i]).toBeGreaterThan(STAGE_PROGRESS[i - 1] ?? 0)
    }
    expect(STAGE_PROGRESS[STAGE_PROGRESS.length - 1]).toBe(4)
  })
})

describe('Blender brain and its memory graph', () => {
  const modelDir = resolve(directory, '../../../public/models')
  const graph = JSON.parse(readFileSync(resolve(modelDir, 'abi-brain-graph.json'), 'utf8')) as BrainGraph

  function glbNodeNames(file: string): Set<string> {
    const buffer = readFileSync(resolve(modelDir, file))
    expect(buffer.readUInt32LE(0)).toBe(0x46546c67)
    const jsonLength = buffer.readUInt32LE(12)
    const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as {
      nodes: { name?: string }[]
    }
    return new Set(json.nodes.map((node) => node.name ?? ''))
  }

  it('exports every part the scene shades by name, and stays light', () => {
    const names = glbNodeNames('abi-brain.glb')
    for (const part of [
      'hemisphere_R', 'hemisphere_L', 'cerebellum', 'brainstem', 'hippocampus_R',
      'hippocampus_L', 'amygdala_R', 'amygdala_L', 'thalamus', 'corpus_callosum',
    ]) {
      expect(names.has(part), part).toBe(true)
    }
    expect(statSync(resolve(modelDir, 'abi-brain.glb')).size).toBeLessThan(2 * 1024 * 1024)
  })

  it('ships a network whose edges only join real nodes', () => {
    expect(graph.nodes.length).toBeGreaterThanOrEqual(100)
    expect(graph.edges.length).toBeGreaterThan(graph.nodes.length)
    for (const [a, b, origin] of graph.edges) {
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(graph.nodes.length)
      expect(b).toBeLessThan(graph.nodes.length)
      expect(a).not.toBe(b)
      expect([0, 1, 2]).toContain(origin)
    }
    for (const node of graph.nodes) {
      expect(graph.types[node.t]).toBeDefined()
      expect(node.r).toBeGreaterThanOrEqual(0)
      expect(node.r).toBeLessThanOrEqual(4)
    }
  })

  it('keeps some records out of reach: other tenants and other roles', () => {
    const access = graph.nodes.map((_, index) => nodeAccess(graph, index))
    expect(access).toContain('open')
    expect(access).toContain('role')
    expect(access).toContain('tenant')
  })

  it('finds a citation path made only of records the seat may open', () => {
    const story = buildStory(graph)
    expect(story.path.length).toBeGreaterThanOrEqual(4)
    expect(story.path[0]).toBe(story.queryNode)
    expect(story.path[story.path.length - 1]).toBe(story.goalNode)
    for (const index of story.path) {
      expect(nodeAccess(graph, index), `node ${index}`).toBe('open')
    }
    // consecutive path nodes are joined by an edge
    const adjacency = buildAdjacency(graph.nodes.length, graph.edges)
    story.path.slice(1).forEach((node, i) => {
      expect(adjacency[story.path[i] ?? 0]).toContain(node)
    })
    for (const id of ['cite-1', 'cite-2', 'cite-3', 'cite-4', 'rec-po', 'rec-claim', 'rec-vo', 'lock', 'role']) {
      expect(story.pins[id], id).toBeDefined()
    }
  })

  it('never lets the recall wave reach a node outside access', () => {
    const story = buildStory(graph)
    graph.nodes.forEach((_, index) => {
      if (nodeAccess(graph, index) !== 'open') {
        expect(Number.isFinite(story.distance[index] ?? Number.POSITIVE_INFINITY)).toBe(false)
      }
    })
  })

  it('computes hop counts and shortest paths on a small known graph', () => {
    const adjacency = buildAdjacency(5, [[0, 1, 0], [1, 2, 0], [2, 3, 0], [0, 4, 0]])
    expect(bfsDistances(adjacency, 0)).toEqual([0, 1, 2, 3, 1])
    expect(shortestPath(adjacency, 0, 3)).toEqual([0, 1, 2, 3])
    expect(shortestPath(buildAdjacency(3, [[0, 1, 0]]), 0, 2)).toBeNull()
  })
})
