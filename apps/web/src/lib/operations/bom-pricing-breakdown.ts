export interface BomPricingBreakdownLine {
  unit_cost_cents: number
  unit_rate_source: string
  notes?: string | null
}

export interface BomPricingBreakdown {
  rag: number
  catalog: number
  manual: number
  dupa: number
  clientBoq: number
  unpriced: number
  total: number
}

export function summarizeBomPricing(
  lines: ReadonlyArray<BomPricingBreakdownLine>,
): BomPricingBreakdown {
  const summary: BomPricingBreakdown = {
    rag: 0,
    catalog: 0,
    manual: 0,
    dupa: 0,
    clientBoq: 0,
    unpriced: 0,
    total: lines.length,
  }

  for (const line of lines) {
    const notes = (line.notes ?? '').trim()
    const isUnpriced = line.unit_cost_cents === 0 || notes.startsWith('No catalog')

    if (isUnpriced) {
      summary.unpriced += 1
      continue
    }

    if (notes.startsWith('Cost from RAG')) {
      summary.rag += 1
    } else if (
      notes.startsWith('Cost from Catalog') ||
      notes.startsWith('Cost from PH industry catalog')
    ) {
      summary.catalog += 1
    } else if (line.unit_rate_source === 'dupa') {
      summary.dupa += 1
    } else if (line.unit_rate_source === 'client_boq') {
      summary.clientBoq += 1
    } else {
      summary.manual += 1
    }
  }

  return summary
}
