'use client'

import { useEffect, useMemo, useState } from 'react'

export interface CortexNodeLite {
  id: string
  nodeType: string
  refTable: string
  refId: string
  title: string | null
}

interface Citation {
  nodeId: string
  nodeType: string
  refTable: string
  refId: string
  title: string | null
}

interface Pack {
  found: boolean
  summary: string
  citations: Citation[]
}

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

// Distinct hues per record type so the local graph reads at a glance.
const TYPE_COLOR: Record<string, string> = {
  project: '#1f3864',
  account: '#0e7490',
  employee: '#7c3aed',
  opportunity: '#b45309',
  document: '#475569',
  bom: '#15803d',
  purchase_order: '#9333ea',
  invoice: '#be123c',
  task: '#0369a1',
}

function color(t: string): string {
  return TYPE_COLOR[t] ?? '#64748b'
}

/**
 * Knowledge-graph explorer — the "better than Obsidian" surface. A typed node
 * index on the left; selecting a node renders its local graph (center node +
 * machine-derived connections) and a source-grounded summary on the right.
 */
export function CortexExplorer({ nodes }: { nodes: CortexNodeLite[] }) {
  const [filter, setFilter] = useState<string>('all')
  const [selected, setSelected] = useState<CortexNodeLite | null>(nodes[0] ?? null)
  const [pack, setPack] = useState<Pack | null>(null)
  const [loading, setLoading] = useState(false)

  const types = useMemo(() => {
    const counts = new Map<string, number>()
    for (const n of nodes) counts.set(n.nodeType, (counts.get(n.nodeType) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [nodes])

  const visible = useMemo(
    () => (filter === 'all' ? nodes : nodes.filter((n) => n.nodeType === filter)),
    [nodes, filter]
  )

  useEffect(() => {
    if (!selected) {
      setPack(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/cortex/entity/${selected.refTable}/${selected.refId}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) return { found: false, summary: '', citations: [] } as Pack
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as Pack
      })
      .then((p) => setPack(p))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setPack(null)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [selected])

  // Neighbors = citations minus the node itself.
  const neighbors = (pack?.citations ?? []).filter(
    (c) => !(c.refTable === selected?.refTable && c.refId === selected?.refId)
  )

  return (
    <div className="cortex-explorer">
      {/* Index */}
      <aside className="cortex-index">
        <div className="cortex-index__filters">
          <button
            type="button"
            className={`cortex-type-chip${filter === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <span>{nodes.length}</span>
          </button>
          {types.map(([t, n]) => (
            <button
              key={t}
              type="button"
              className={`cortex-type-chip${filter === t ? ' is-active' : ''}`}
              onClick={() => setFilter(t)}
            >
              <span className="cortex-dot" style={{ background: color(t) }} aria-hidden />
              {TYPE_LABEL[t] ?? t} <span>{n}</span>
            </button>
          ))}
        </div>
        <ul className="cortex-node-list">
          {visible.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`cortex-node-row${selected?.id === n.id ? ' is-active' : ''}`}
                onClick={() => setSelected(n)}
              >
                <span className="cortex-dot" style={{ background: color(n.nodeType) }} aria-hidden />
                <span className="cortex-node-row__title">{n.title ?? n.refId.slice(0, 8)}</span>
                <span className="cortex-node-row__type">{TYPE_LABEL[n.nodeType] ?? n.nodeType}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && <li className="cortex-index__empty">No records.</li>}
        </ul>
      </aside>

      {/* Local graph + summary */}
      <div className="cortex-focus">
        {!selected && <p className="cortex-focus__hint">Select a record to explore its connections.</p>}
        {selected && (
          <>
            <LocalGraph center={selected} neighbors={neighbors} />
            <div className="cortex-focus__summary">
              {loading && <p className="cortex-focus__muted">Loading connections…</p>}
              {!loading && pack && (
                <>
                  {pack.summary.split('\n').map((line, i) => (
                    <p key={i} className={i === 0 ? 'cortex-focus__line is-head' : 'cortex-focus__line'}>
                      {line}
                    </p>
                  ))}
                  <p className="cortex-focus__sources">
                    {neighbors.length} connection{neighbors.length === 1 ? '' : 's'}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Radial local graph: the selected node centered, neighbors on a ring. */
function LocalGraph({ center, neighbors }: { center: CortexNodeLite; neighbors: Citation[] }) {
  const W = 100
  const H = 100
  const cx = W / 2
  const cy = H / 2
  const r = 36
  const shown = neighbors.slice(0, 12)

  return (
    <svg
      className="cortex-localgraph"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Local graph for ${center.title ?? 'record'} with ${shown.length} connections`}
    >
      {shown.map((n, i) => {
        const angle = (i / shown.length) * Math.PI * 2 - Math.PI / 2
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        return (
          <g key={n.nodeId}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" strokeWidth={0.5} />
            <circle cx={x} cy={y} r={3.2} fill={color(n.nodeType)} />
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={5.5} fill={color(center.nodeType)} stroke="white" strokeWidth={1} />
    </svg>
  )
}
