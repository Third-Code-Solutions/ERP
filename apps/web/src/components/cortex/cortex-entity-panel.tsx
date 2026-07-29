'use client'

import { useEffect, useState } from 'react'
import { CORTEX_TYPE_LABEL } from '@/lib/cortex/href'

interface Citation {
  nodeId: string
  nodeType: string
  refTable: string
  refId: string
  title: string | null
}

interface CortexAnswer {
  found: boolean
  summary: string
  citations: Citation[]
}

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; answer: CortexAnswer }

interface Props {
  refTable: string
  refId: string
}

/**
 * Cortex "Related" panel — renders the graph context pack for one ERP entity:
 * a source-grounded summary plus the citations that back it. Read-only and
 * tenant-scoped at the API; this only displays what the server returned.
 */
export function CortexEntityPanel({ refTable, refId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading' })

    fetch(`/api/cortex/entity/${refTable}/${refId}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setState({ kind: 'empty' })
          return
        }
        if (!res.ok) {
          setState({ kind: 'error', message: `Cortex unavailable (${res.status})` })
          return
        }
        const answer = (await res.json()) as CortexAnswer
        setState({ kind: 'loaded', answer })
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({ kind: 'error', message: 'Could not reach Cortex' })
      })

    return () => controller.abort()
  }, [refTable, refId])

  return (
    <section className="cortex-panel" aria-labelledby="cortex-panel-heading">
      <div className="cortex-panel__head">
        <h3 id="cortex-panel-heading" className="cortex-panel__title">
          Cortex
        </h3>
        <span className="cortex-panel__tag">Graph</span>
      </div>

      {state.kind === 'loading' && (
        <div className="cortex-panel__skeleton" role="status" aria-label="Loading Cortex context">
          <span className="cortex-skel-line" />
          <span className="cortex-skel-line cortex-skel-line--short" />
          <span className="cortex-skel-line" />
        </div>
      )}

      {state.kind === 'empty' && (
        <p className="cortex-panel__muted">Not in the knowledge graph yet.</p>
      )}

      {state.kind === 'error' && (
        <p className="cortex-panel__error" role="alert">
          {state.message}
        </p>
      )}

      {state.kind === 'loaded' && (
        <>
          <div className="cortex-panel__summary">
            {state.answer.summary.split('\n').map((line, i) => (
              <p key={i} className="cortex-panel__summary-line">
                {line}
              </p>
            ))}
          </div>
          <div className="cortex-panel__sources">
            <span className="cortex-panel__sources-label">
              {state.answer.citations.length} source
              {state.answer.citations.length === 1 ? '' : 's'}
            </span>
            <ul className="cortex-panel__chips">
              {state.answer.citations.slice(0, 12).map((c) => (
                <li key={c.nodeId} className="cortex-chip" title={c.title ?? c.refId}>
                  <span className="cortex-chip__type">
                    {CORTEX_TYPE_LABEL[c.nodeType] ?? c.nodeType}
                  </span>
                  <span className="cortex-chip__name">{c.title ?? c.refId.slice(0, 8)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
