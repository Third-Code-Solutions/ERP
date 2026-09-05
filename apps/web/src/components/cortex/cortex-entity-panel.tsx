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
  density?: 'default' | 'compact'
  expandSources?: boolean
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
  density = 'default',
  expandSources = false,
}: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const isCompact = density === 'compact'
  const graphHref = `/cortex?refTable=${encodeURIComponent(refTable)}&refId=${encodeURIComponent(refId)}`
  const summaryLines =
    state.kind === 'loaded'
      ? state.answer.summary.split('\n').filter((line) => line.trim().length > 0)
      : []
  const visibleSummaryLines = isCompact ? summaryLines.slice(0, 2) : summaryLines
  const hiddenSummaryLines = isCompact ? summaryLines.slice(2) : []

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
    <section
      className={`cortex-panel${isCompact ? ' cortex-panel--compact' : ''}`}
      aria-labelledby="cortex-panel-heading"
    >
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
            {visibleSummaryLines.map((line, index) => (
              <p key={`${line}:${index}`} className="cortex-panel__summary-line">
                {line}
              </p>
            ))}
          </div>
          {hiddenSummaryLines.length > 0 && (
            <details className="cortex-panel__summary-details">
              <summary>More record context</summary>
              {hiddenSummaryLines.map((line, index) => (
                <p key={`${line}:${index}`} className="cortex-panel__summary-line">
                  {line}
                </p>
              ))}
            </details>
          )}
          <CortexRelationshipList
            relationships={state.answer.relationships ?? []}
            limit={expandSources ? (state.answer.relationships ?? []).length : isCompact ? 4 : 12}
            moreHref={graphHref}
          />
          <CortexEvidenceTrail evidence={state.answer.evidence ?? []} />
          <div className="cortex-panel__sources">
            <span className="cortex-panel__sources-label">
              {isCompact && !expandSources && state.answer.citations.length > 4
                ? `Top 4 of ${state.answer.citations.length} sources`
                : `${state.answer.citations.length} source${state.answer.citations.length === 1 ? '' : 's'}`}
            </span>
            <CortexCitationList
              citations={state.answer.citations}
              limit={expandSources ? state.answer.citations.length : isCompact ? 4 : 12}
            />
            {isCompact && !expandSources && state.answer.citations.length > 4 && (
              <Link href={graphHref} className="cortex-panel__more-link">
                View all sources in graph
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
          {showGraphLink && (
            <Link
              className="cortex-panel__graph-link"
              href={graphHref}
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
