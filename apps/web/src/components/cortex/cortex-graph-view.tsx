'use client'

import { useState } from 'react'
import { CortexGraphCanvas, type SelectedNode } from './cortex-graph-canvas'
import { CortexEntityPanel } from './cortex-entity-panel'

const TYPE_LABEL: Record<string, string> = {
  project: 'Project',
  account: 'Account',
  employee: 'Person',
  opportunity: 'Opportunity',
  document: 'Document',
  bom: 'BOM',
  purchase_order: 'PO',
  invoice: 'Invoice',
  task: 'Task',
}

/**
 * The interactive graph plus a detail drawer. Click a node → the drawer shows
 * that record's source-grounded context (reuses CortexEntityPanel).
 */
export function CortexGraphView() {
  const [sel, setSel] = useState<SelectedNode | null>(null)

  return (
    <div className="cortex-graphview">
      <CortexGraphCanvas onSelect={setSel} />
      {sel && (
        <aside className="cortex-graph-drawer" aria-label="Record detail">
          <div className="cortex-graph-drawer__head">
            <span className="cortex-graph-drawer__type">{TYPE_LABEL[sel.type] ?? sel.type}</span>
            <button
              type="button"
              className="cortex-graph-drawer__close"
              onClick={() => setSel(null)}
              aria-label="Close detail"
            >
              ×
            </button>
          </div>
          <CortexEntityPanel key={`${sel.refTable}/${sel.refId}`} refTable={sel.refTable} refId={sel.refId} />
        </aside>
      )}
    </div>
  )
}
