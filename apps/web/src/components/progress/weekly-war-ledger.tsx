'use client'

import React, { useState, useTransition } from 'react'
import type { ProjectWeeklyProgressRow } from '@third-code-erp/shared-types'
import { lockWeeklyProgress } from '@/app/(dashboard)/projects/[id]/progress/actions'

interface Props {
  projectId: string
  rows: ProjectWeeklyProgressRow[]
  canLock: boolean
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function dateTimeLabel(value: string): string {
  return new Date(value).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

export function WeeklyWarLedger({ projectId, rows, canLock }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [lockedId, setLockedId] = useState<string | null>(null)

  function lock(row: ProjectWeeklyProgressRow) {
    setError(null)
    startTransition(async () => {
      const result = await lockWeeklyProgress(projectId, row.id, row.version, 'Thursday WAR cut-off')
      if (result.error) setError(result.error)
      else setLockedId(row.id)
    })
  }

  return (
    <section className="card weekly-war-ledger" aria-labelledby="weekly-war-ledger-heading">
      <div className="card-header weekly-war-ledger__header">
        <div>
          <h2 id="weekly-war-ledger-heading" className="card-title">WAR cut-off ledger</h2>
          <p className="cost-section-sub">
            Thursday 17:00 PHT locks the submitted evidence for the weekly work-accomplishment report.
          </p>
        </div>
        <span className="weekly-war-ledger__badge">Core ledger</span>
      </div>
      {error && <p className="weekly-war-ledger__error" role="alert">{error}</p>}
      {rows.length === 0 ? (
        <p className="card-empty">No Core weekly periods yet. Submit the first update to open a WAR period.</p>
      ) : (
        <div className="weekly-war-ledger__table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Week ending</th>
                <th>Status</th>
                <th className="numeric">Overall</th>
                <th>Cut-off (PHT)</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isLocked = row.status === 'locked' || lockedId === row.id
                return (
                  <tr key={row.id}>
                    <td>{dateLabel(row.weekEnding)}</td>
                    <td>
                      <span className={`weekly-war-ledger__status weekly-war-ledger__status--${row.status}`}>
                        {isLocked ? 'Locked' : 'Open'}
                      </span>
                    </td>
                    <td className="numeric" style={{ fontWeight: 600 }}>{row.percentByCategory.overall_pct}%</td>
                    <td className="muted">{dateTimeLabel(row.cutoffAt)}</td>
                    <td className="numeric">
                      {canLock && !isLocked && (
                        <button type="button" className="button button-secondary button-small" disabled={pending} onClick={() => lock(row)}>
                          {pending ? 'Locking…' : 'Lock WAR'}
                        </button>
                      )}
                      {isLocked && <span className="muted">Immutable evidence</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
