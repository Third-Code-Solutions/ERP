'use client'

import { useState, useTransition } from 'react'
import { updateChecklistItemStatusForm } from '@/app/(dashboard)/projects/[id]/checklist/actions'

export interface ChecklistItemRowProps {
  projectId: string
  item: {
    id: string
    title: string
    owner_role: string | null
    sla_days: number | null
    status: 'not_started' | 'in_progress' | 'blocked' | 'done'
    blocker_reason: string | null
    sla_clock_started_at: Date | string | null
    completed_at: Date | string | null
    depends_on_item_id: string | null
  }
  /** Map of id → title for dependency labels. */
  dependencyTitle?: string | null
}

const STATUS_LABEL: Record<ChecklistItemRowProps['item']['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

const STATUS_COLOR: Record<ChecklistItemRowProps['item']['status'], string> = {
  not_started: 'var(--color-neutral-500)',
  in_progress: 'var(--color-info, #2563eb)',
  blocked: 'var(--color-warning, #f59e0b)',
  done: 'var(--color-success, #10b981)',
}

const NEXT_STATUSES: Record<
  ChecklistItemRowProps['item']['status'],
  ChecklistItemRowProps['item']['status'][]
> = {
  not_started: ['in_progress'],
  in_progress: ['blocked', 'done'],
  blocked: ['in_progress', 'done'],
  done: ['in_progress'],
}

export function ChecklistItemRow({ projectId, item, dependencyTitle }: ChecklistItemRowProps) {
  const [pending, startTransition] = useTransition()
  const [blockerInput, setBlockerInput] = useState('')
  const [showBlocker, setShowBlocker] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slaInfo = computeSlaInfo(item.sla_days, item.sla_clock_started_at, item.status)
  const isOverdue = slaInfo?.daysRemaining !== null && (slaInfo?.daysRemaining ?? 0) < 0

  const submit = (status: ChecklistItemRowProps['item']['status'], blocker?: string) => {
    const fd = new FormData()
    fd.set('item_id', item.id)
    fd.set('status', status)
    if (blocker) fd.set('blocker_reason', blocker)
    startTransition(async () => {
      const result = await updateChecklistItemStatusForm(projectId, fd)
      if (result.error) {
        setError(result.error)
      } else {
        setError(null)
        setShowBlocker(false)
        setBlockerInput('')
      }
    })
  }

  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderLeft: `3px solid ${STATUS_COLOR[item.status]}`,
        borderRadius: '6px',
        padding: '14px 16px',
        marginBottom: '8px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '12px',
        alignItems: 'center',
      }}
    >
      <div>
        <div
          style={{
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--color-neutral-900)',
            marginBottom: '4px',
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            fontSize: '0.75rem',
            color: 'var(--color-neutral-500)',
          }}
        >
          {item.owner_role && (
            <span>
              Owner:{' '}
              <strong style={{ color: 'var(--color-neutral-700)' }}>
                {formatRole(item.owner_role)}
              </strong>
            </span>
          )}
          {item.sla_days !== null && <span>SLA: {item.sla_days}d</span>}
          {slaInfo && (
            <span style={{ color: isOverdue ? 'var(--color-danger, #ef4444)' : undefined, fontWeight: isOverdue ? 600 : 400 }}>
              {slaInfo.label}
            </span>
          )}
          {dependencyTitle && (
            <span>
              After: <em>{dependencyTitle}</em>
            </span>
          )}
        </div>
        {item.blocker_reason && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '0.8125rem',
              color: 'var(--color-warning, #f59e0b)',
              background: 'rgba(245, 158, 11, 0.08)',
              padding: '6px 10px',
              borderRadius: '4px',
            }}
          >
            <strong>Blocker:</strong> {item.blocker_reason}
          </div>
        )}
        {error && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '0.8125rem',
              color: 'var(--color-danger, #ef4444)',
            }}
          >
            {error}
          </div>
        )}
        {showBlocker && (
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={blockerInput}
              onChange={(e) => setBlockerInput(e.target.value)}
              placeholder="Reason for the block…"
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '0.8125rem',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
              }}
            />
            <button
              type="button"
              disabled={pending || !blockerInput.trim()}
              onClick={() => submit('blocked', blockerInput.trim())}
              className="btn btn-secondary"
              style={{ fontSize: '0.8125rem' }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setShowBlocker(false)
                setBlockerInput('')
              }}
              className="btn btn-ghost"
              style={{ fontSize: '0.8125rem' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '999px',
            background: 'var(--color-neutral-50)',
            border: '1px solid var(--color-border)',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: STATUS_COLOR[item.status],
            whiteSpace: 'nowrap',
          }}
        >
          {STATUS_LABEL[item.status]}
        </span>
        {NEXT_STATUSES[item.status].map((next) => {
          if (next === 'blocked') {
            return (
              <button
                key={next}
                type="button"
                disabled={pending}
                onClick={() => setShowBlocker(true)}
                className="btn btn-ghost"
                style={{ fontSize: '0.8125rem' }}
              >
                Block
              </button>
            )
          }
          return (
            <button
              key={next}
              type="button"
              disabled={pending}
              onClick={() => submit(next)}
              className={next === 'done' ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ fontSize: '0.8125rem' }}
            >
              {actionLabel(next)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function actionLabel(status: ChecklistItemRowProps['item']['status']): string {
  switch (status) {
    case 'not_started':
      return 'Reset'
    case 'in_progress':
      return 'Start'
    case 'blocked':
      return 'Block'
    case 'done':
      return 'Complete'
  }
}

function formatRole(role: string): string {
  // Match the Third Code ERP nomenclature.
  if (role === 'sd_pm_pe') return 'SD / PM / PE'
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function computeSlaInfo(
  slaDays: number | null,
  startedAt: Date | string | null,
  status: ChecklistItemRowProps['item']['status']
): { label: string; daysRemaining: number | null } | null {
  if (slaDays === null) return null
  if (status === 'done') return { label: 'Completed', daysRemaining: null }
  if (!startedAt) return { label: 'Clock pending dependency', daysRemaining: null }

  const startMs = new Date(startedAt).getTime()
  const elapsedDays = Math.floor((Date.now() - startMs) / 86_400_000)
  const remaining = slaDays - elapsedDays
  if (remaining < 0) return { label: `${Math.abs(remaining)}d overdue`, daysRemaining: remaining }
  if (remaining === 0) return { label: 'Due today', daysRemaining: 0 }
  return { label: `${remaining}d left`, daysRemaining: remaining }
}
