import React from 'react'
import type { CortexEvidenceEvent } from '@/lib/cortex/entity-response'

interface Props {
  evidence: CortexEvidenceEvent[]
}

const EVIDENCE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
  timeZoneName: 'short',
})

export function formatCortexEvidenceTime(recordedAt: string): string {
  return EVIDENCE_TIME_FORMAT.format(new Date(recordedAt))
}

/** Safe, server-normalized provenance for one authorized Cortex record. */
export function CortexEvidenceTrail({ evidence }: Props) {
  const visible = evidence.slice(0, 6)
  if (visible.length === 0) return null

  return (
    <details className="cortex-evidence">
      <summary className="cortex-evidence__summary">
        <span className="cortex-evidence__title">Evidence trail</span>
        <span className="cortex-evidence__count">
          {visible.length} event{visible.length === 1 ? '' : 's'}
        </span>
        <span className="cortex-evidence__indicator" aria-hidden="true">
          ›
        </span>
      </summary>
      <ol className="cortex-evidence__timeline" aria-label="Evidence trail">
        {visible.map((event, index) => (
          <li
            className="cortex-evidence__event"
            key={`${event.kind}:${event.recordedAt}:${index}`}
          >
            <span className="cortex-evidence__dot" aria-hidden="true" />
            <span className="cortex-evidence__body">
              <span className="cortex-evidence__label">{event.label}</span>
              <span className="cortex-evidence__detail">{event.detail}</span>
              <time
                className="cortex-evidence__time"
                dateTime={event.recordedAt}
              >
                {formatCortexEvidenceTime(event.recordedAt)}
              </time>
            </span>
          </li>
        ))}
      </ol>
    </details>
  )
}
