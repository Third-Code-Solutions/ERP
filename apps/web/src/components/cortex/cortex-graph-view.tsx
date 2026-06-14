'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CortexGraphCanvas,
  type RawNode,
  type RawLink,
  type SelectedNode,
} from './cortex-graph-canvas'
import { CortexEntityPanel } from './cortex-entity-panel'
import { cortexHref, cortexColor, CORTEX_TYPE_LABEL } from '@/lib/cortex/href'

interface GraphPayload {
  nodes: RawNode[]
  links: RawLink[]
}

type Status = 'loading' | 'empty' | 'error' | 'ready'

/**
 * The Cortex graph workspace: an organized, navigable knowledge graph.
 * Toolbar = search + per-type legend toggles + cluster layout + fit. Click a
 * node to inspect (drawer), double-click (or "Open record") to jump straight
 * into the ERP record.
 */
export function CortexGraphView() {
  const router = useRouter()
  const [data, setData] = useState<GraphPayload | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [query, setQuery] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [grouped, setGrouped] = useState(false)
  const [fitNonce, setFitNonce] = useState(0)
  const [selected, setSelected] = useState<SelectedNode | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/cortex/graph', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as GraphPayload
      })
      .then((p) => {
        setData(p)
        setStatus(p.nodes.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setStatus('error')
      })
    return () => controller.abort()
  }, [])

  const types = useMemo(() => {
    if (!data) return []
    const counts = new Map<string, number>()
    for (const n of data.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [data])

  const visibleTypes = useMemo(
    () => new Set(types.map(([t]) => t).filter((t) => !hidden.has(t))),
    [types, hidden]
  )

  function navigate(n: SelectedNode) {
    const href = cortexHref({ type: n.type, refId: n.refId, projectId: n.projectId })
    if (href) router.push(href)
  }

  function toggleType(t: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  // Keyboard: Esc closes the drawer, "/" focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openHref = selected
    ? cortexHref({ type: selected.type, refId: selected.refId, projectId: selected.projectId })
    : null

  if (status === 'loading') {
    return <div className="cortex-graph-shell cortex-graph-shell--msg">Loading knowledge graph…</div>
  }
  if (status === 'error') {
    return (
      <div className="cortex-graph-shell cortex-graph-shell--msg" role="alert">
        Could not load the graph.
      </div>
    )
  }
  if (status === 'empty' || !data) {
    return (
      <div className="cortex-graph-shell cortex-graph-shell--msg">
        The graph is empty for now. As records are created they mirror in automatically.
      </div>
    )
  }

  return (
    <div className="cortex-graph-shell">
      {/* Toolbar */}
      <div className="cortex-toolbar">
        <div className="cortex-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search records…  (press /)"
            aria-label="Search the graph"
          />
        </div>
        <div className="cortex-legend">
          {types.map(([t, n]) => {
            const off = hidden.has(t)
            return (
              <button
                key={t}
                type="button"
                className={`cortex-legend-chip${off ? ' is-off' : ''}`}
                onClick={() => toggleType(t)}
                aria-pressed={!off}
                title={off ? `Show ${CORTEX_TYPE_LABEL[t] ?? t}` : `Hide ${CORTEX_TYPE_LABEL[t] ?? t}`}
              >
                <span className="cortex-dot" style={{ background: cortexColor(t) }} aria-hidden />
                {CORTEX_TYPE_LABEL[t] ?? t}
                <span className="cortex-legend-chip__n">{n}</span>
              </button>
            )
          })}
        </div>
        <div className="cortex-toolbar__actions">
          <button
            type="button"
            className={`cortex-tool-btn${grouped ? ' is-active' : ''}`}
            onClick={() => setGrouped((v) => !v)}
            aria-pressed={grouped}
          >
            Cluster by type
          </button>
          <button type="button" className="cortex-tool-btn" onClick={() => setFitNonce((n) => n + 1)}>
            Fit
          </button>
        </div>
      </div>

      {/* Graph + drawer */}
      <div className="cortex-graphview">
        <CortexGraphCanvas
          nodes={data.nodes}
          links={data.links}
          visibleTypes={visibleTypes}
          query={query}
          groupByType={grouped}
          fitNonce={fitNonce}
          onSelect={setSelected}
          onNavigate={navigate}
        />
        {selected && (
          <aside className="cortex-graph-drawer" aria-label="Record detail">
            <div className="cortex-graph-drawer__head">
              <span className="cortex-graph-drawer__type">
                {CORTEX_TYPE_LABEL[selected.type] ?? selected.type}
              </span>
              <button
                type="button"
                className="cortex-graph-drawer__close"
                onClick={() => setSelected(null)}
                aria-label="Close detail"
              >
                ×
              </button>
            </div>
            <CortexEntityPanel
              key={`${selected.refTable}/${selected.refId}`}
              refTable={selected.refTable}
              refId={selected.refId}
            />
            {openHref && (
              <button type="button" className="cortex-open-record" onClick={() => navigate(selected)}>
                Open record →
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
