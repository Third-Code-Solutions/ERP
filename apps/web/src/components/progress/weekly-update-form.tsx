'use client'

/**
 * Weekly progress update form (US-Con-003 #1).
 *
 * Five percentage fields (Civil / Electrical / MEP / Finishes / Overall).
 * Overall is editable but auto-suggested from the weighted average when
 * the user hasn't touched it yet.
 */

import { useState, useTransition } from 'react'
import { submitWeeklyProgress } from '@/app/(dashboard)/projects/[id]/progress/actions'

interface Props {
  projectId: string
  defaultWeekEnding?: string
}

type Field = 'civil_pct' | 'electrical_pct' | 'mep_pct' | 'finishes_pct' | 'overall_pct'

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultSunday(): string {
  const today = new Date()
  const dow = today.getDay() // 0 = Sun
  const offset = dow === 0 ? 0 : 7 - dow
  const sunday = new Date(today)
  sunday.setDate(today.getDate() + offset)
  return toIsoDate(sunday)
}

export function WeeklyUpdateForm({ projectId, defaultWeekEnding }: Props) {
  const [weekEnding, setWeekEnding] = useState(defaultWeekEnding ?? defaultSunday())
  const [values, setValues] = useState<Record<Field, number>>({
    civil_pct: 0,
    electrical_pct: 0,
    mep_pct: 0,
    finishes_pct: 0,
    overall_pct: 0,
  })
  const [overallTouched, setOverallTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  function setField(f: Field, raw: string) {
    const n = Number(raw)
    const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0
    setValues((prev) => {
      const next: Record<Field, number> = { ...prev, [f]: clamped }
      if (f !== 'overall_pct' && !overallTouched) {
        // Simple average of category fields as a sensible default.
        next.overall_pct =
          Math.round(
            ((next.civil_pct + next.electrical_pct + next.mep_pct + next.finishes_pct) / 4) *
              10,
          ) / 10
      }
      return next
    })
    if (f === 'overall_pct') setOverallTouched(true)
  }

  function onSubmit() {
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const res = await submitWeeklyProgress(projectId, weekEnding, values)
      if (res.error) setError(res.error)
      else {
        setSuccess(true)
        setOverallTouched(false)
      }
    })
  }

  const rows: { label: string; field: Field }[] = [
    { label: 'Civil', field: 'civil_pct' },
    { label: 'Electrical', field: 'electrical_pct' },
    { label: 'MEP', field: 'mep_pct' },
    { label: 'Finishes', field: 'finishes_pct' },
    { label: 'Overall', field: 'overall_pct' },
  ]

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>Week ending</span>
        <input
          type="date"
          required
          value={weekEnding}
          onChange={(e) => setWeekEnding(e.target.value)}
          style={inputStyle}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {rows.map((row) => (
          <label key={row.field} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
              style={{
                fontSize: 12,
                color:
                  row.field === 'overall_pct'
                    ? 'var(--color-navy-700)'
                    : 'var(--color-neutral-600)',
                fontWeight: row.field === 'overall_pct' ? 600 : 400,
              }}
            >
              {row.label} %
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={values[row.field]}
              onChange={(e) => setField(row.field, e.target.value)}
              style={inputStyle}
            />
          </label>
        ))}
      </div>

      {error && <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
      {success && (
        <p style={{ margin: 0, color: 'var(--color-success)', fontSize: 12 }}>
          Weekly update submitted.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '8px 14px',
          background: 'var(--color-navy-700)',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontWeight: 600,
          fontSize: 13,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {pending ? 'Submitting…' : 'Submit weekly progress'}
      </button>
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'white',
}
