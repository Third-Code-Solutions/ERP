// Header for the Progress Claim detail page. Server component — renders
// the claim number, project crumb, and status badge. Keeping this separate
// from the page so the breadcrumb + title block can be reused (e.g. by a
// print/PDF view) without dragging the whole page along.

import Link from 'next/link'
import { ClaimStatusBadge } from './claim-status-badge'

interface ClaimDetailHeaderProps {
  claimNumber: string
  status: string
  projectId: string
  projectName: string
  milestonePct: number
}

export function ClaimDetailHeader({
  claimNumber,
  status,
  projectId,
  projectName,
  milestonePct,
}: ClaimDetailHeaderProps) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/claims"
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          Claims
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link
          href={`/projects/${projectId}`}
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          {projectName}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>
          {claimNumber}
        </span>
      </div>

      <div className="page-header">
        <p className="page-eyebrow">Construction · Progress Claim</p>
        <h1 className="page-title" style={{ marginBottom: 8 }}>
          {claimNumber}
        </h1>
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <ClaimStatusBadge status={status} />
          <span
            style={{
              fontSize: '0.8125rem',
              color: 'var(--color-neutral-600)',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            Milestone {milestonePct}%
          </span>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-600)' }}>
            {projectName}
          </span>
        </div>
      </div>
    </>
  )
}
