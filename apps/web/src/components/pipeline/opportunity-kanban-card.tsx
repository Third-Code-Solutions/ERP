'use client'

import Link from 'next/link'
import React from 'react'
import styles from './pipeline-workspace.module.css'
import { StageAdvanceButton } from './stage-advance-button'

import {
  formatCentsCompact,
  type OpportunityStage,
} from '@third-code-erp/shared-types'

export interface KanbanCardData {
  id: string
  stage: OpportunityStage
  tcv_cents: number
  gp_cents: number
  weighted_tcv_cents: number
  probability: number
  closing_date?: string | null
  updated_at: string
  created_at: string
  account_id: string | null
  account_name: string | null
  account_kyc_status: string | null
  opportunity_kyc_initialized: boolean
  opportunity_kyc_gate: string | null
  project_id: string | null
  project_name: string | null
  rep_id: string | null
  rep_email: string | null
  sla: 'green' | 'amber' | 'red' | null
}

interface OpportunityKanbanCardProps {
  card: KanbanCardData
  isDragging?: boolean
  canAdvance: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
}

const SLA_COLORS: Record<'green' | 'amber' | 'red', string> = {
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function OpportunityKanbanCard({
  card,
  isDragging,
  canAdvance,
  onDragStart,
  onDragEnd,
}: OpportunityKanbanCardProps) {
  const title = card.account_name ?? card.project_name ?? 'Untitled'
  const sub = card.account_name && card.project_name ? card.project_name : null
  const days = daysSince(card.updated_at)
  const slaColor = card.sla
    ? SLA_COLORS[card.sla]
    : 'var(--color-neutral-300, #d1d5db)'
  const kycBlocked = card.opportunity_kyc_initialized
    ? Boolean(card.opportunity_kyc_gate)
    : Boolean(card.account_id) &&
      card.account_kyc_status !== 'approved' &&
      card.account_kyc_status !== 'not_required'
  const kycReason = card.opportunity_kyc_gate ?? 'Account KYC not approved'

  return (
    <div
      className={styles.card}
      draggable={canAdvance}
      onDragStart={(e) => {
        if (!canAdvance) return
        e.dataTransfer.setData('text/plain', card.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(card.id)
      }}
      onDragEnd={onDragEnd}
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: '6px',
        padding: '10px 12px',
        cursor: canAdvance ? 'grab' : 'default',
        boxShadow: isDragging
          ? '0 8px 20px rgba(0,0,0,0.12)'
          : '0 1px 2px rgba(0,0,0,0.04)',
        opacity: isDragging ? 0.5 : 1,
        transition: 'box-shadow 120ms ease, opacity 120ms ease',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--color-neutral-900)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={title}
        >
          {title}
        </div>
        <span
          aria-label={card.sla ? `SLA ${card.sla}` : 'no SLA'}
          title={card.sla ? `SLA ${card.sla}` : 'No SLA clock'}
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: slaColor,
            flex: '0 0 8px',
          }}
        />
      </div>

      {sub && (
        <div
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-neutral-500)',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={sub}
        >
          {sub}
        </div>
      )}

      <div
        style={{
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--color-neutral-900)',
          }}
        >
          {formatCentsCompact(card.tcv_cents)}
        </span>
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-neutral-500)',
          }}
        >
          Updated {days}d ago
        </span>
      </div>

      <div
        style={{
          marginTop: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
        }}
      >
        <span
          style={{
            fontSize: '0.6875rem',
            color: 'var(--color-neutral-500)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '60%',
          }}
          title={card.rep_email ?? undefined}
        >
          {card.rep_email ?? 'Unassigned'}
        </span>
        {kycBlocked && (
          <span
            title={kycReason}
            style={{
              fontSize: '0.625rem',
              fontWeight: 600,
              color: '#b45309',
              background: '#fef3c7',
              padding: '1px 6px',
              borderRadius: '999px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            KYC
          </span>
        )}
      </div>
      <dl className={styles.metrics}>
        <div>
          <dt>Probability</dt>
          <dd>{card.probability}%</dd>
        </div>
        <div>
          <dt>Gross profit</dt>
          <dd>
            {formatCentsCompact(card.gp_cents)} ·{' '}
            {card.tcv_cents > 0
              ? ((card.gp_cents / card.tcv_cents) * 100).toFixed(1)
              : '0.0'}
            %
          </dd>
        </div>
        <div>
          <dt>Weighted value</dt>
          <dd>{formatCentsCompact(card.weighted_tcv_cents)}</dd>
        </div>
        <div>
          <dt>Expected close</dt>
          <dd>{card.closing_date ?? 'Not set'}</dd>
        </div>
      </dl>
      <footer>
        <Link href={`/crm/opportunities/${card.id}`}>Open opportunity →</Link>
        {card.project_id && (
          <Link href={`/projects/${card.project_id}`}>Project</Link>
        )}
      </footer>
      {canAdvance && (
        <StageAdvanceButton opportunityId={card.id} currentStage={card.stage} />
      )}
    </div>
  )
}
