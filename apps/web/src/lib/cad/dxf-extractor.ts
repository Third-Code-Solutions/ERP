// In-process DXF scope extractor — TypeScript port of the Python ezdxf
// extractor at apps/workers/dxf-parser/src/parsers/ezdxf_extractor.py.
//
// Strategy mirrors the Python version:
//   1. INSERT (block reference) entities → equipment counts (FCU, breakers, …)
//   2. LWPOLYLINE / POLYLINE closed entities → room areas (sqm)
//   3. TEXT / MTEXT entities → room labels and annotations
//
// Pure function — takes DXF text bytes (utf-8 string), returns extracted
// scope items + warnings. No I/O, no DB.

import DxfParser from 'dxf-parser'
import type { IDxf, IEntity } from 'dxf-parser'

export interface ExtractedScopeItem {
  code: string | null
  description: string
  unit: string
  quantity: number
  unit_cost_cents: number
  notes: string | null
}

export interface ExtractionResult {
  items: ExtractedScopeItem[]
  warnings: string[]
  layerCount: number
  entityCount: number
}

interface BlockPattern {
  pattern: RegExp
  description: string
  unit: string
}

const BLOCK_PATTERNS: BlockPattern[] = [
  { pattern: /FCU|FAN.?COIL/i, description: 'Fan Coil Unit', unit: 'unit' },
  { pattern: /AHU|AIR.?HANDL/i, description: 'Air Handling Unit', unit: 'unit' },
  { pattern: /VRF|VRV/i, description: 'VRF Indoor Unit', unit: 'unit' },
  { pattern: /EXHAUST|EF-/i, description: 'Exhaust Fan', unit: 'unit' },
  { pattern: /BREAKER|MCB|MCCB/i, description: 'Circuit Breaker', unit: 'unit' },
  { pattern: /PANEL|MDB|DB-/i, description: 'Distribution Panel', unit: 'unit' },
  { pattern: /LIGHT|LUX|DOWNLIGHT|TROFFER/i, description: 'Lighting Fixture', unit: 'unit' },
  { pattern: /OUTLET|RECPT|GPO/i, description: 'Power Outlet', unit: 'unit' },
  { pattern: /SPRINKLER|SPK/i, description: 'Sprinkler Head', unit: 'unit' },
  { pattern: /CCTV|CAMERA/i, description: 'CCTV Camera', unit: 'unit' },
  { pattern: /SMOKE|DETECTOR|SD-/i, description: 'Smoke Detector', unit: 'unit' },
  { pattern: /TOILET|WC|LAVATORY/i, description: 'Toilet Fixture', unit: 'unit' },
  { pattern: /SINK|BASIN/i, description: 'Basin/Sink', unit: 'unit' },
]

const LAYER_SYSTEMS: { pattern: RegExp; system: string }[] = [
  { pattern: /HVAC|MECH|AIRCON|AC/i, system: 'HVAC' },
  { pattern: /ELEC|POWER|LIGHTING|LTG/i, system: 'Electrical' },
  { pattern: /PLUMB|SANIT|WATER|DRAIN/i, system: 'Plumbing' },
  { pattern: /FIRE|SPRINK|FP/i, system: 'Fire Protection' },
  { pattern: /DATA|IT|COMM|CCTV/i, system: 'Data/Comms' },
]

function layerSystem(layer: string): string {
  for (const { pattern, system } of LAYER_SYSTEMS) {
    if (pattern.test(layer)) return system
  }
  return ''
}

// Shoelace formula for polygon area in DXF drawing units. Caller assumes
// the DXF was authored in metres (typical for PH MEP work). Areas in mm
// will need a unit conversion in a future iteration.
function shoelace(pts: { x: number; y: number }[]): number {
  let area = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += pts[i]!.x * pts[j]!.y
    area -= pts[j]!.x * pts[i]!.y
  }
  return Math.abs(area / 2)
}

interface InsertEntity extends IEntity {
  type: 'INSERT'
  name: string
}

interface LwpolylineEntity extends IEntity {
  type: 'LWPOLYLINE'
  vertices: { x: number; y: number; z?: number }[]
  shape: boolean
}

interface PolylineEntity extends IEntity {
  type: 'POLYLINE'
  vertices: { x: number; y: number; z?: number }[]
  shape: boolean
}

interface TextEntity extends IEntity {
  type: 'TEXT' | 'MTEXT'
  text: string
}

function extractBlockInserts(entities: IEntity[]): ExtractedScopeItem[] {
  type Bucket = { description: string; unit: string; system: string; count: number }
  const counts = new Map<string, Bucket>()

  for (const e of entities) {
    if (e.type !== 'INSERT') continue
    const insert = e as InsertEntity
    const blockName = insert.name ?? ''
    const layer = e.layer ?? '0'

    for (const { pattern, description, unit } of BLOCK_PATTERNS) {
      if (pattern.test(blockName)) {
        const system = layerSystem(layer)
        const key = `${system}|${description}`
        const existing = counts.get(key)
        if (existing) {
          existing.count += 1
        } else {
          counts.set(key, { description, unit, system, count: 1 })
        }
        break
      }
    }
  }

  return Array.from(counts.values())
    .filter((b) => b.count > 0)
    .map((b) => ({
      code: null,
      description: b.system ? `${b.system} — ${b.description}` : b.description,
      unit: b.unit,
      quantity: b.count,
      unit_cost_cents: 0,
      notes: null,
    }))
}

function extractPolylineAreas(
  entities: IEntity[],
  warnings: string[]
): ExtractedScopeItem[] {
  // Aggregate area by layer — multiple closed polylines on the same layer
  // represent multiple rooms in the same system; sum their sqm rather than
  // deduplicating to a single item.
  type Bucket = { layer: string; system: string; areaSqm: number; rooms: number }
  const buckets = new Map<string, Bucket>()

  for (const e of entities) {
    if (e.type !== 'LWPOLYLINE' && e.type !== 'POLYLINE') continue
    const poly = e as LwpolylineEntity | PolylineEntity

    try {
      // dxf-parser's `shape` field maps to AutoCAD's "closed" flag (group code 70)
      if (!poly.shape) continue
      const pts = poly.vertices?.map((v) => ({ x: v.x, y: v.y })) ?? []
      if (pts.length < 3) continue

      const area = shoelace(pts)
      if (area < 1) continue

      const layer = e.layer ?? '0'
      const system = layerSystem(layer) || 'Area'
      const key = `${system}|${layer}`

      const bucket = buckets.get(key)
      if (bucket) {
        bucket.areaSqm += area
        bucket.rooms += 1
      } else {
        buckets.set(key, { layer, system, areaSqm: area, rooms: 1 })
      }
    } catch (err) {
      warnings.push(`Polyline area error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return Array.from(buckets.values()).map((b) => ({
    code: null,
    description: `${b.system} — Floor Area (${b.layer})`,
    unit: 'sqm',
    quantity: Math.round(b.areaSqm),
    unit_cost_cents: 0,
    notes: `Layer: ${b.layer} · ${b.rooms} polygon${b.rooms === 1 ? '' : 's'}`,
  }))
}

function extractTextAnnotations(entities: IEntity[]): ExtractedScopeItem[] {
  const labels = new Set<string>()

  for (const e of entities) {
    if (e.type !== 'TEXT' && e.type !== 'MTEXT') continue
    const t = e as TextEntity
    let text = (t.text ?? '').trim()
    // MTEXT often contains formatting codes — strip the most common ones
    text = text.replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').trim()
    // Skip dimension-only strings (e.g. "1500", "12.5")
    if (text.length < 2 || text.length > 40) continue
    if (/^[\d.\s]+$/.test(text)) continue
    labels.add(text)
  }

  return Array.from(labels)
    .sort()
    .map((label) => ({
      code: null,
      description: `Annotation: ${label}`,
      unit: 'note',
      quantity: 1,
      unit_cost_cents: 0,
      notes: 'Extracted from drawing annotation',
    }))
}

function deduplicate(items: ExtractedScopeItem[]): ExtractedScopeItem[] {
  const seen = new Set<string>()
  const result: ExtractedScopeItem[] = []
  for (const item of items) {
    const key = `${item.description}|${item.unit}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

export function extractFromDxfText(dxfText: string): ExtractionResult {
  const warnings: string[] = []
  let parsed: IDxf | null = null

  try {
    const parser = new DxfParser()
    parsed = parser.parseSync(dxfText)
  } catch (err) {
    warnings.push(`DXF parse error: ${err instanceof Error ? err.message : String(err)}`)
    return { items: [], warnings, layerCount: 0, entityCount: 0 }
  }

  if (!parsed) {
    warnings.push('DXF parse returned null')
    return { items: [], warnings, layerCount: 0, entityCount: 0 }
  }

  const entities = parsed.entities ?? []
  const layers = parsed.tables?.layer?.layers ?? {}

  const items: ExtractedScopeItem[] = [
    ...extractBlockInserts(entities),
    ...extractPolylineAreas(entities, warnings),
    ...extractTextAnnotations(entities),
  ]

  return {
    items: deduplicate(items),
    warnings,
    layerCount: Object.keys(layers).length,
    entityCount: entities.length,
  }
}
