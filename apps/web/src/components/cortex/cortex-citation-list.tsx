import Link from 'next/link'
import {
  CORTEX_TYPE_LABEL,
  cortexHref,
} from '@/lib/cortex/href'
import type { NavigableCortexCitation } from '@/lib/cortex/citation-header'

interface Props {
  citations: NavigableCortexCitation[]
  limit?: number
  className?: string
}

/** Canonical record links for source-grounded Cortex answers. */
export function CortexCitationList({
  citations,
  limit = 12,
  className = '',
}: Props) {
  const visible = citations.slice(0, limit)
  if (visible.length === 0) return null

  return (
    <ul
      className={`cortex-panel__chips${className ? ` ${className}` : ''}`}
      aria-label="Sources"
    >
      {visible.map((citation) => {
        const typeLabel =
          CORTEX_TYPE_LABEL[citation.nodeType] ?? citation.nodeType
        const recordLabel =
          citation.title ?? citation.refId.slice(0, 8)
        const href = cortexHref({
          type: citation.nodeType,
          refId: citation.refId,
          projectId: citation.projectId,
        })
        const content = (
          <>
            <span className="cortex-chip__type">{typeLabel}</span>
            <span className="cortex-chip__name">{recordLabel}</span>
          </>
        )

        return (
          <li key={citation.nodeId}>
            {href ? (
              <Link
                href={href}
                className="cortex-chip cortex-chip--link"
                title={`Open ${typeLabel}: ${recordLabel}`}
                aria-label={`Open ${typeLabel}: ${recordLabel}`}
              >
                {content}
              </Link>
            ) : (
              <span
                className="cortex-chip cortex-chip--static"
                title={recordLabel}
              >
                {content}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
