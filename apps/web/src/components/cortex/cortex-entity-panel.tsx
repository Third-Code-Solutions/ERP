'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CortexCitationList } from './cortex-citation-list'
import { CortexEvidenceTrail } from './cortex-evidence-trail'
import { CortexRelationshipList } from './cortex-relationship-list'
import type { CortexEntityResponse } from '@/lib/cortex/entity-response'

type CortexAnswer = CortexEntityResponse

type State =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; answer: CortexAnswer }

interface Props {
  refTable: string
  refId: string
  showGraphLink?: boolean
}

/**
 * Cortex "Related" panel — renders the graph context pack for one ERP entity:
 * a source-grounded summary plus the citations that back it. Read-only and
 * tenant-scoped at the API; this only displays what the server returned.
 */
export function CortexEntityPanel({
  refTable,
  refId,
  showGraphLink = true,
}: Props) {
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
          <CortexRelationshipList
            relationships={state.answer.relationships ?? []}
          />
          <CortexEvidenceTrail evidence={state.answer.evidence ?? []} />
          <div className="cortex-panel__sources">
            <span className="cortex-panel__sources-label">
              {state.answer.citations.length} source
              {state.answer.citations.length === 1 ? '' : 's'}
            </span>
            <CortexCitationList citations={state.answer.citations} />
          </div>
          {showGraphLink && (
            <Link
              className="cortex-panel__graph-link"
              href={`/cortex?refTable=${encodeURIComponent(refTable)}&refId=${encodeURIComponent(refId)}`}
            >
              Open focused graph
              <span aria-hidden>→</span>
            </Link>
          )}
        </>
      )}
    </section>
  )
}
