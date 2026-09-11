'use client'

import React from 'react'
import Link from 'next/link'
import {
  STAGE_LEGACY_MAP,
  formatCentsCompact,
  type PipelineStage,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { StageAdvanceButton } from './stage-advance-button'
import type { KanbanCardData } from './opportunity-kanban-card'
import styles from './pipeline-workspace.module.css'

const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: 'Lead',
  site_survey: 'Site survey',
  design: 'Design',
  bom_submission: 'BOM submission',
  negotiation: 'Negotiation',
  contract: 'Contract',
  won: 'Won',
  lost: 'Lost',
}

function canonicalStage(stage: OpportunityStage): PipelineStage {
  return STAGE_LEGACY_MAP[stage]
}

function grossMargin(card: KanbanCardData): string {
  if (card.tcv_cents <= 0) return '0.0%'
  return `${((card.gp_cents / card.tcv_cents) * 100).toFixed(1)}%`
}

export interface PipelineListTableProps {
  cards: KanbanCardData[]
  canAdvance: boolean
}

export function PipelineListTable({
  cards,
  canAdvance,
}: PipelineListTableProps) {
  return (
    <div className={styles.listTableWrap}>
      <table className={styles.listTable}>
        <caption className={styles.srOnly}>
          Pipeline opportunities in list view
        </caption>
        <thead>
          <tr>
            <th scope="col">Opportunity</th>
            <th scope="col">Stage</th>
            <th scope="col">Owner</th>
            <th scope="col" className={styles.numericCell}>
              TCV
            </th>
            <th scope="col" className={styles.numericCell}>
              Probability
            </th>
            <th scope="col" className={styles.numericCell}>
              GP margin
            </th>
            <th scope="col">Expected close</th>
            <th scope="col" className={styles.actionsCell}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => {
            const stage = canonicalStage(card.stage)
            const title = card.account_name ?? card.project_name ?? 'Untitled'
            return (
              <tr key={card.id}>
                <th scope="row">
                  <Link href={`/crm/opportunities/${card.id}`}>
                    {title}
                  </Link>
                  {card.project_name && card.account_name ? (
                    <span className={styles.listSecondaryText}>
                      {card.project_name}
                    </span>
                  ) : null}
                </th>
                <td>
                  <span
                    className={`${styles.stageBadge} ${styles[`stage${stage}`]}`}
                  >
                    {STAGE_LABELS[stage]}
                  </span>
                  {card.opportunity_kyc_gate ? (
                    <span className={styles.listWarning}>KYC attention</span>
                  ) : null}
                </td>
                <td>
                  <span className={styles.listOwner}>
                    {card.rep_email ?? 'Unassigned'}
                  </span>
                  {card.sla ? (
                    <span className={styles.listSecondaryText}>
                      SLA {card.sla}
                    </span>
                  ) : null}
                </td>
                <td className={styles.numericCell}>
                  {formatCentsCompact(card.tcv_cents)}
                </td>
                <td className={styles.numericCell}>{card.probability}%</td>
                <td className={styles.numericCell}>{grossMargin(card)}</td>
                <td>{card.closing_date ?? 'Not set'}</td>
                <td className={styles.actionsCell}>
                  <div className={styles.listActions}>
                    <Link
                      className={styles.listOpenLink}
                      href={`/crm/opportunities/${card.id}`}
                    >
                      Open
                    </Link>
                    {canAdvance ? (
                      <StageAdvanceButton
                        opportunityId={card.id}
                        currentStage={card.stage}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
