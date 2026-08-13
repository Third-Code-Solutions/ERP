export interface BomHierarchyLine {
  id: string
  division_id: string | null
  division_label?: string | null
  parent_line_item_id: string | null
  line_total_cents: number
}

export interface BomDivisionGroup<TLine extends BomHierarchyLine> {
  key: string
  label: string
  lines: TLine[]
  subtotal_cents: number
}

/**
 * Preserve persisted BOQ order while projecting the flat commercial spine
 * into the division/subtotal view required by the BOM builder. Child rows are
 * excluded from the subtotal because their cost is represented by the parent
 * work item once attached to a DUPA.
 */
export function groupBomLinesByDivision<TLine extends BomHierarchyLine>(
  lines: ReadonlyArray<TLine>,
): BomDivisionGroup<TLine>[] {
  const groups = new Map<string, BomDivisionGroup<TLine>>()

  for (const line of lines) {
    const key = line.division_id ?? 'unassigned'
    const existing = groups.get(key)
    if (existing) {
      existing.lines.push(line)
      if (line.parent_line_item_id === null) existing.subtotal_cents += line.line_total_cents
      continue
    }

    groups.set(key, {
      key,
      label:
        line.division_label?.trim() ||
        (line.division_id ? `Division ${line.division_id.slice(0, 8)}` : 'Unassigned division'),
      lines: [line],
      subtotal_cents: line.parent_line_item_id === null ? line.line_total_cents : 0,
    })
  }

  return [...groups.values()]
}
