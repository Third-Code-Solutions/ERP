#!/usr/bin/env node
// Generates a realistic MEP fit-out sample DXF that exercises every path of
// dxf-extractor.ts:
//   - Block inserts: FCU, AHU, BREAKER, PANEL, LIGHT, SPRINKLER, SMOKE, CCTV
//   - Closed LWPOLYLINEs on system layers → room/area in sqm
//   - TEXT annotations → room labels
//
// Output: apps/web/public/samples/mep-sample.dxf
//
// DXF format is line-pair (group code on odd lines, value on even lines).
// We emit minimum-viable HEADER + TABLES + BLOCKS + ENTITIES sections.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '..', 'public', 'samples', 'mep-sample.dxf')

// ---------------------------------------------------------------------------
// Helpers — every DXF emit is a (groupCode, value) pair
// ---------------------------------------------------------------------------
const lines = []
const emit = (code, value) => {
  lines.push(String(code).padStart(3, ' '))
  lines.push(String(value))
}

const sectionStart = (name) => {
  emit(0, 'SECTION')
  emit(2, name)
}
const sectionEnd = () => emit(0, 'ENDSEC')

// ---------------------------------------------------------------------------
// Layers — names match LAYER_SYSTEMS regex in dxf-extractor.ts
// ---------------------------------------------------------------------------
const LAYERS = [
  { name: 'HVAC-EQUIP', color: 1 },
  { name: 'HVAC-AREAS', color: 2 },
  { name: 'ELEC-PANELS', color: 3 },
  { name: 'ELEC-LIGHTING', color: 4 },
  { name: 'ELEC-OUTLETS', color: 5 },
  { name: 'PLUMB-FIXTURES', color: 6 },
  { name: 'PLUMB-AREAS', color: 7 },
  { name: 'FIRE-SPRINKLER', color: 1 },
  { name: 'FIRE-AREAS', color: 2 },
  { name: 'DATA-CCTV', color: 3 },
  { name: 'ROOM-LABELS', color: 7 },
  { name: '0', color: 7 },
]

// ---------------------------------------------------------------------------
// Block definitions — names match BLOCK_PATTERNS regex
// ---------------------------------------------------------------------------
const BLOCKS = [
  'FCU-200',
  'AHU-1000',
  'EXHAUST-FAN',
  'PANEL-MDB',
  'BREAKER-30A',
  'DOWNLIGHT-LED',
  'OUTLET-GPO',
  'SPRINKLER-K57',
  'SMOKE-DETECTOR',
  'CCTV-DOME',
  'TOILET-WC',
  'BASIN-LAV',
]

// ---------------------------------------------------------------------------
// HEADER — minimum viable, just enough for ezdxf/dxf-parser to accept
// ---------------------------------------------------------------------------
sectionStart('HEADER')
emit(9, '$ACADVER')
emit(1, 'AC1027') // AutoCAD 2013 — broadly compatible
emit(9, '$INSUNITS')
emit(70, 6) // metres
sectionEnd()

// ---------------------------------------------------------------------------
// TABLES — layer table only
// ---------------------------------------------------------------------------
sectionStart('TABLES')
emit(0, 'TABLE')
emit(2, 'LAYER')
emit(70, LAYERS.length)
for (const layer of LAYERS) {
  emit(0, 'LAYER')
  emit(2, layer.name)
  emit(70, 0) // standard flags
  emit(62, layer.color)
  emit(6, 'CONTINUOUS')
}
emit(0, 'ENDTAB')
sectionEnd()

// ---------------------------------------------------------------------------
// BLOCKS section — declare each block with a single placeholder LINE entity
// ---------------------------------------------------------------------------
sectionStart('BLOCKS')
for (const blockName of BLOCKS) {
  emit(0, 'BLOCK')
  emit(8, '0')
  emit(2, blockName)
  emit(70, 0)
  emit(10, 0)
  emit(20, 0)
  emit(30, 0)
  emit(3, blockName)
  emit(1, '')
  // A single LINE entity inside the block so the block isn't empty
  emit(0, 'LINE')
  emit(8, '0')
  emit(10, 0)
  emit(20, 0)
  emit(30, 0)
  emit(11, 1)
  emit(21, 0)
  emit(31, 0)
  emit(0, 'ENDBLK')
  emit(8, '0')
}
sectionEnd()

// ---------------------------------------------------------------------------
// ENTITIES — INSERTs (block refs), LWPOLYLINEs (rooms), TEXT (labels)
// ---------------------------------------------------------------------------
sectionStart('ENTITIES')

// --- INSERT entities — equipment counts ---
const insertSpec = [
  { block: 'FCU-200', layer: 'HVAC-EQUIP', count: 12 },
  { block: 'AHU-1000', layer: 'HVAC-EQUIP', count: 2 },
  { block: 'EXHAUST-FAN', layer: 'HVAC-EQUIP', count: 6 },
  { block: 'PANEL-MDB', layer: 'ELEC-PANELS', count: 3 },
  { block: 'BREAKER-30A', layer: 'ELEC-PANELS', count: 48 },
  { block: 'DOWNLIGHT-LED', layer: 'ELEC-LIGHTING', count: 87 },
  { block: 'OUTLET-GPO', layer: 'ELEC-OUTLETS', count: 64 },
  { block: 'SPRINKLER-K57', layer: 'FIRE-SPRINKLER', count: 92 },
  { block: 'SMOKE-DETECTOR', layer: 'FIRE-SPRINKLER', count: 24 },
  { block: 'CCTV-DOME', layer: 'DATA-CCTV', count: 14 },
  { block: 'TOILET-WC', layer: 'PLUMB-FIXTURES', count: 8 },
  { block: 'BASIN-LAV', layer: 'PLUMB-FIXTURES', count: 12 },
]

let x = 0
let y = 0
for (const spec of insertSpec) {
  for (let i = 0; i < spec.count; i++) {
    emit(0, 'INSERT')
    emit(8, spec.layer)
    emit(2, spec.block)
    emit(10, x)
    emit(20, y)
    emit(30, 0)
    emit(41, 1) // x scale
    emit(42, 1) // y scale
    emit(43, 1) // z scale
    emit(50, 0) // rotation
    x += 2
    if (x > 60) {
      x = 0
      y += 2
    }
  }
  y += 4
  x = 0
}

// --- LWPOLYLINE — room areas, closed rectangles ---
// Each polyline is a 4-vertex rectangle on a system layer; quantity = sqm.
const rooms = [
  { layer: 'HVAC-AREAS', dx: 8, dy: 6, label: 'Lobby' }, // 48 sqm
  { layer: 'HVAC-AREAS', dx: 12, dy: 10, label: 'Open Office West' }, // 120 sqm
  { layer: 'HVAC-AREAS', dx: 14, dy: 9, label: 'Open Office East' }, // 126 sqm
  { layer: 'HVAC-AREAS', dx: 5, dy: 4, label: 'Conference 1' }, // 20 sqm
  { layer: 'HVAC-AREAS', dx: 6, dy: 4, label: 'Conference 2' }, // 24 sqm
  { layer: 'PLUMB-AREAS', dx: 4, dy: 3, label: 'Pantry' }, // 12 sqm
  { layer: 'PLUMB-AREAS', dx: 3, dy: 4, label: 'Toilet (Male)' }, // 12 sqm
  { layer: 'PLUMB-AREAS', dx: 3, dy: 4, label: 'Toilet (Female)' }, // 12 sqm
  { layer: 'FIRE-AREAS', dx: 22, dy: 16, label: 'Coverage Zone A' }, // 352 sqm
  { layer: 'FIRE-AREAS', dx: 20, dy: 14, label: 'Coverage Zone B' }, // 280 sqm
]

let cursorX = 0
const cursorY = 100 // above the inserts so they don't overlap visually
for (const room of rooms) {
  emit(0, 'LWPOLYLINE')
  emit(8, room.layer)
  emit(90, 4) // 4 vertices
  emit(70, 1) // closed
  emit(10, cursorX)
  emit(20, cursorY)
  emit(10, cursorX + room.dx)
  emit(20, cursorY)
  emit(10, cursorX + room.dx)
  emit(20, cursorY + room.dy)
  emit(10, cursorX)
  emit(20, cursorY + room.dy)
  cursorX += room.dx + 2
}

// --- TEXT — room labels (matches the rooms above) ---
let textX = 0
const textY = 105
for (const room of rooms) {
  emit(0, 'TEXT')
  emit(8, 'ROOM-LABELS')
  emit(10, textX + room.dx / 2)
  emit(20, textY)
  emit(30, 0)
  emit(40, 0.4) // text height
  emit(1, room.label)
  emit(50, 0) // rotation
  textX += room.dx + 2
}

// A few extra annotations for variety
const annotations = [
  'Floor 12 — North Wing',
  'Tenant: ABI OPS Construction',
  'Critical path: HVAC commissioning Apr 14',
  'Riser room 12-A',
]
for (let i = 0; i < annotations.length; i++) {
  emit(0, 'TEXT')
  emit(8, 'ROOM-LABELS')
  emit(10, 0)
  emit(20, 80 + i * 1.5)
  emit(30, 0)
  emit(40, 0.5)
  emit(1, annotations[i])
  emit(50, 0)
}

sectionEnd()

emit(0, 'EOF')

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
mkdirSync(dirname(OUT), { recursive: true })
const dxfText = lines.join('\n') + '\n'
writeFileSync(OUT, dxfText, 'utf-8')
console.log(`✔ Wrote ${OUT}`)
console.log(`  ${lines.length} lines, ${(dxfText.length / 1024).toFixed(1)} KB`)

const totalInserts = insertSpec.reduce((s, i) => s + i.count, 0)
console.log(`  Expected entities: ${totalInserts} INSERT, ${rooms.length} LWPOLYLINE, ${rooms.length + annotations.length} TEXT`)
