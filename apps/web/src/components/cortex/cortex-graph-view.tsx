'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  CortexGraphCanvas,
  type RawNode,
  type RawLink,
  type SelectedNode,
} from './cortex-graph-canvas'
import { CortexEntityPanel } from './cortex-entity-panel'
import { cortexHref, cortexColor, CORTEX_TYPE_LABEL } from '@/lib/cortex/href'
import {
  activeCortexSearchIndex,
  nextCortexSearchIndex,
} from '@/lib/cortex/search-navigation'

interface GraphPayload {
  nodes: RawNode[]
  links: RawLink[]
  focusNodeId?: string
}

interface CortexSearchHit {
  id: string
  nodeType: string
  label: string
  title: string
  summary: string | null
  href: string | null
  refTable: string
  refId: string
  freshness: string
  source: 'cortex'
}

type Status = 'loading' | 'empty' | 'error' | 'ready'

interface Props {
  focus: { refTable: string; refId: string } | null
}

/**
 * The Cortex graph workspace: an organized, navigable knowledge graph.
 * Toolbar = search + per-type legend toggles + cluster layout + fit. Click a
 * node to inspect (drawer), double-click (or "Open record") to jump straight
 * into the ERP record.
 */
export function CortexGraphView({ focus }: Props) {
  const router = useRouter()
  const [data, setData] = useState<GraphPayload | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [query, setQuery] = useState('')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [grouped, setGrouped] = useState(false)
  const [fitNonce, setFitNonce] = useState(0)
  const [selected, setSelected] = useState<SelectedNode | null>(null)
  const [searchHits, setSearchHits] = useState<CortexSearchHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [searchComplete, setSearchComplete] = useState(false)
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    const graphUrl = focus
      ? `/api/cortex/graph?refTable=${encodeURIComponent(focus.refTable)}&refId=${encodeURIComponent(focus.refId)}`
      : '/api/cortex/graph'
    fetch(graphUrl, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as GraphPayload
      })
      .then((p) => {
        setData(p)
        const focused = p.focusNodeId
          ? p.nodes.find((node) => node.id === p.focusNodeId) ?? null
          : null
        setSelected(
          focused
            ? {
                refTable: focused.refTable,
                refId: focused.refId,
                title: focused.title,
                type: focused.type,
                projectId: focused.projectId,
              }
            : null
        )
        setStatus(p.nodes.length === 0 ? 'empty' : 'ready')
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setStatus('error')
    })
    return () => controller.abort()
  }, [focus])

  // Server retrieval searches titles + summaries across the full tenant graph;
  // debounce so typing never floods the API or an external provider.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setSearchHits([])
      setSearchLoading(false)
      setSearchError(false)
      setSearchComplete(false)
      setActiveSearchIndex(-1)
      return
    }

    const controller = new AbortController()
    setSearchHits([])
    setSearchLoading(false)
    setSearchError(false)
    setSearchComplete(false)
    setActiveSearchIndex(-1)
    const timer = window.setTimeout(() => {
      setSearchLoading(true)
      fetch(`/api/cortex/search?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status))
          return (await res.json()) as { hits?: CortexSearchHit[] }
        })
        .then((payload) => {
          setSearchHits(payload.hits ?? [])
          setSearchError(false)
          setSearchComplete(true)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setSearchHits([])
          setSearchError(true)
          setSearchComplete(true)
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false)
        })
    }, 220)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

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

  function onSearchKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSearchIndex((current) =>
        nextCortexSearchIndex(
          current,
          searchHits,
          e.key === 'ArrowDown' ? 1 : -1
        )
      )
      return
    }
    if (e.key === 'Enter') {
      const activeIndex = activeCortexSearchIndex(activeSearchIndex, searchHits)
      const index = activeIndex >= 0 ? activeIndex : nextCortexSearchIndex(-1, searchHits, 1)
      const hit = index >= 0 ? searchHits[index] : null
      if (hit?.href) router.push(hit.href)
      return
    }
    if (e.key === 'Escape') {
      setActiveSearchIndex(-1)
      setSearchHits([])
      setSearchComplete(false)
    }
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
  const focusedNode = data?.focusNodeId
    ? data.nodes.find((node) => node.id === data.focusNodeId) ?? null
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
        {focusedNode && (
          <div className="cortex-focusbar" role="status">
            <span className="cortex-focusbar__eyebrow">Focused record</span>
            <strong className="cortex-focusbar__title">
              {focusedNode.title ??
                CORTEX_TYPE_LABEL[focusedNode.type] ??
                focusedNode.type}
            </strong>
            <span className="cortex-focusbar__meta">
              {data.links.length} connection
              {data.links.length === 1 ? '' : 's'} shown
            </span>
            <button
              type="button"
              className="cortex-focusbar__clear"
              onClick={() => router.push('/cortex')}
            >
              Show all records
            </button>
          </div>
        )}
        <div className="cortex-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search records…  (press /)"
            aria-label="Search the graph"
            aria-controls="cortex-search-results"
            aria-expanded={
              query.trim().length >= 2 &&
              (searchLoading || searchError || searchComplete || searchHits.length > 0)
            }
            aria-activedescendant={
              activeSearchIndex >= 0
                ? `cortex-search-result-${activeSearchIndex}`
                : undefined
            }
          />
          {(searchLoading || searchError || searchComplete || searchHits.length > 0) && query.trim().length >= 2 && (
            <div
              id="cortex-search-results"
              className="cortex-search-results"
              role="listbox"
              aria-label="Cortex search results"
              aria-busy={searchLoading}
            >
              {searchLoading && (
                <div className="cortex-search-results__status" role="status">
                  Finding source records...
                </div>
              )}
              {!searchLoading && searchError && (
                <div className="cortex-search-results__status" role="alert">
                  Search is unavailable. Try again in a moment.
                </div>
              )}
              {!searchLoading && !searchError && searchHits.length === 0 && (
                <div className="cortex-search-results__status" role="status">
                  No records found for “{query.trim()}”.
                </div>
              )}
              {!searchLoading &&
                searchHits.map((hit, index) => (
                  <button
                    key={hit.id}
                    type="button"
                    className="cortex-search-result"
                    onClick={() => hit.href && router.push(hit.href)}
                    disabled={!hit.href}
                    role="option"
                    id={`cortex-search-result-${index}`}
                    aria-selected={activeSearchIndex === index}
                  >
                    <span className="cortex-search-result__title">
                      {hit.title}
                    </span>
                    <span className="cortex-search-result__meta">
                      {hit.label} - {hit.freshness}
                    </span>
                    {hit.summary && (
                      <span className="cortex-search-result__summary">
                        {hit.summary}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}
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
          focusNodeId={data.focusNodeId ?? null}
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
              showGraphLink={false}
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
