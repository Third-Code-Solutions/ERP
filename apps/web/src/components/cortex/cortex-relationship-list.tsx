import React from 'react'
import Link from 'next/link'
import {
  CORTEX_TYPE_LABEL,
  cortexHref,
} from '@/lib/cortex/href'
import type { CortexRelationship } from '@/lib/cortex/entity-response'

interface Props {
  relationships: CortexRelationship[]
}

function originLabel(origin: string): string {
  return origin === 'ai'
    ? 'AI-derived'
    : origin.charAt(0).toUpperCase() + origin.slice(1)
}

/** Human-readable, canonical backlinks for a role-filtered context pack. */
export function CortexRelationshipList({ relationships }: Props) {
  if (relationships.length === 0) return null

  return (
    <div className="cortex-panel__connections">
      <span className="cortex-panel__sources-label">Connections</span>
      <ul
        className="cortex-relationships"
        aria-label="Connections"
      >
        {relationships.slice(0, 12).map((relationship) => {
          const { citation } = relationship
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
              <span className="cortex-relationship__kind">
                {relationship.label}
              </span>
              <span className="cortex-relationship__record">
                <span className="cortex-relationship__type">
                  {typeLabel}
                </span>
                <span className="cortex-relationship__name">
                  {recordLabel}
                </span>
              </span>
              <span className="cortex-relationship__origin">
                {originLabel(relationship.origin)}
              </span>
            </>
          )
          const accessibleLabel = `${relationship.label} ${typeLabel}: ${recordLabel}`

          return (
            <li key={relationship.edgeId}>
              {href ? (
                <Link
                  href={href}
                  className="cortex-relationship cortex-relationship--link"
                  title={accessibleLabel}
                  aria-label={accessibleLabel}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className="cortex-relationship cortex-relationship--static"
                  title={accessibleLabel}
                >
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
