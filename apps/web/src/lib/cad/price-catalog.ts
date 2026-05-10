// PH industry-typical price catalog for auto-BOM fallback pricing.
//
// SOURCE & DISCLAIMER
// -------------------
// These are *typical* Philippine construction unit costs based on common
// 2024-2026 Manila/Cebu fit-out market rates. They are STARTING POINTS for
// the estimator, not authoritative quotes. Every line generated from this
// catalog gets a note marking it as "Catalog estimate — verify with vendor".
//
// Prices are SUPPLY + INSTALL unless noted. Markup is the contractor's GP
// markup on cost (basis points: 3000 = 30%).
//
// Override workflow:
//   1. Edit a unit cost on the Scope tab (manual override stays per-line)
//   2. Approve a BOM with real prices → those become RAG history; future
//      auto-BOMs prefer RAG matches over catalog defaults
//   3. Replace this file with your firm's authoritative price book

export interface CatalogEntry {
  // Regex matched against the scope item description (case-insensitive)
  pattern: RegExp
  // Display description (stored on the BOM line)
  description: string
  // Unit cost in PHP centavos
  unit_cost_cents: number
  // Default markup in basis points (3000 = 30%)
  markup_bps: number
  // Optional unit override (defaults to scope item's unit)
  unit?: string
  // Source label that ends up in the BOM line note
  source: 'catalog'
  // Origin tag for the catalog: 'industry' | 'dpwh' | 'tenant'
  origin: 'industry'
}

const e = (
  pattern: RegExp,
  description: string,
  pesos: number,
  opts: { markup?: number; unit?: string } = {}
): CatalogEntry => ({
  pattern,
  description,
  unit_cost_cents: Math.round(pesos * 100),
  markup_bps: (opts.markup ?? 30) * 100,
  unit: opts.unit,
  source: 'catalog',
  origin: 'industry',
})

// Order matters: more specific patterns should come BEFORE generic ones.
export const PRICE_CATALOG: CatalogEntry[] = [
  // ─────────────────────────────────────────────────────────────
  // HVAC equipment
  // ─────────────────────────────────────────────────────────────
  e(/Fan.?Coil.?Unit|FCU\b/i, 'Fan Coil Unit (typical 2HP)', 85_000),
  e(/Air.?Handling.?Unit|\bAHU\b/i, 'Air Handling Unit (typical 5TR)', 350_000),
  e(/VRF.?Indoor|VRV.?Indoor/i, 'VRF/VRV Indoor Unit', 95_000),
  e(/Exhaust.?Fan/i, 'Exhaust Fan (small)', 8_000),

  // ─────────────────────────────────────────────────────────────
  // Electrical
  // ─────────────────────────────────────────────────────────────
  e(/Distribution.?Panel|Panel.?Board|MDB/i, 'Distribution Panel', 45_000),
  e(/Circuit.?Breaker|MCB|MCCB/i, 'Circuit Breaker (30A typical)', 500),
  e(/Lighting.?Fixture|Down.?light|Troffer/i, 'LED Downlight 18W', 1_200),
  e(/Power.?Outlet|Receptacle|GPO/i, 'Power Outlet (duplex GPO)', 350),

  // ─────────────────────────────────────────────────────────────
  // Fire protection
  // ─────────────────────────────────────────────────────────────
  e(/Sprinkler.?Head/i, 'Sprinkler Head (pendant K5.6)', 1_800),
  e(/Smoke.?Detector/i, 'Smoke Detector (photoelectric)', 2_500),

  // ─────────────────────────────────────────────────────────────
  // Plumbing fixtures
  // ─────────────────────────────────────────────────────────────
  e(/Toilet.?Fixture|Water.?Closet|^WC\b/i, 'Toilet (WC) - dual flush', 18_000),
  e(/Basin|Lavatory/i, 'Lavatory / Basin', 8_000),
  e(/Sink/i, 'Sink (stainless, single bowl)', 6_500),

  // ─────────────────────────────────────────────────────────────
  // Data / Comms
  // ─────────────────────────────────────────────────────────────
  e(/CCTV.?Camera|Dome.?Camera/i, 'CCTV Dome Camera (IP, 4MP)', 8_500),

  // ─────────────────────────────────────────────────────────────
  // Floor area composite rates (per sqm — supply + install)
  // ─────────────────────────────────────────────────────────────
  e(
    /^HVAC\b.*Floor.?Area|HVAC.*\(.*sqm.*\)/i,
    'HVAC distribution composite (per sqm)',
    4_500,
    { unit: 'sqm' }
  ),
  e(
    /^Electrical\b.*Floor.?Area|Electrical.*\(.*sqm.*\)/i,
    'Electrical rough-in composite (per sqm)',
    2_800,
    { unit: 'sqm' }
  ),
  e(
    /^Plumbing\b.*Floor.?Area|Plumbing.*\(.*sqm.*\)/i,
    'Plumbing rough-in composite (per sqm)',
    1_800,
    { unit: 'sqm' }
  ),
  e(
    /^Fire.?Protection\b.*Floor.?Area/i,
    'Fire protection composite (per sqm)',
    1_200,
    { unit: 'sqm' }
  ),
  e(
    /^Architecture.*Floor|^Architecture.*Walls/i,
    'Architecture wall/floor composite (per sqm)',
    8_500,
    { unit: 'sqm' }
  ),

  // ─────────────────────────────────────────────────────────────
  // Generic declared area (catch-all for MTEXT-extracted areas)
  // ─────────────────────────────────────────────────────────────
  e(
    /Declared area|^Pond|Landscape|Garden/i,
    'Site / landscape composite (per sqm)',
    2_500,
    { unit: 'sqm' }
  ),
]

export interface CatalogMatch {
  entry: CatalogEntry
  unit_cost_cents: number
  markup_bps: number
}

export function findCatalogPrice(description: string): CatalogMatch | null {
  for (const entry of PRICE_CATALOG) {
    if (entry.pattern.test(description)) {
      return {
        entry,
        unit_cost_cents: entry.unit_cost_cents,
        markup_bps: entry.markup_bps,
      }
    }
  }
  return null
}

// Items we explicitly DO NOT price from catalog — these are diagnostic
// (layer roll-ups, annotations) and would mislead the estimator if priced.
const NEVER_AUTOPRICE = /Layer roll-up|^Annotation:|^Bridge\b/i

export function shouldSkipAutoPrice(description: string): boolean {
  return NEVER_AUTOPRICE.test(description)
}
