'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type CSSProperties } from 'react'
import {
  awardLockedBom,
  reverseAwardHandoff,
  type AwardActionResult,
} from '@/app/(dashboard)/projects/[id]/bom/award-actions'

interface ExistingHandoff {
  id: string
  status: 'active' | 'reversed'
  projectCode: string
  budgetId: string
  dpInvoiceId: string
  projectTrackerId: string
  taskIds: Record<string, string>
}

interface AwardAutomationPanelProps {
  projectId: string
  bomId: string
  projectCode: string | null
  handoff: ExistingHandoff | null
}

const taskLabels: Array<[string, string]> = [
  ['arProjectCode', 'AR / project code'],
  ['downPaymentInvoice', 'Down-payment invoice'],
  ['cari', 'CARI'],
  ['projectTracker', 'Project Tracker'],
  ['cxOnboarding', 'CX onboarding'],
]

export function AwardAutomationPanel({
  projectId,
  bomId,
  projectCode,
  handoff,
}: AwardAutomationPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<AwardActionResult | { ok: true } | null>(null)

  const submitAward = (formData: FormData) => {
    startTransition(() => {
      void awardLockedBom(formData).then((nextResult) => {
        setResult(nextResult)
        if (nextResult.ok) router.refresh()
      })
    })
  }

  const submitReverse = (formData: FormData) => {
    startTransition(() => {
      void reverseAwardHandoff(formData).then((nextResult) => {
        setResult(nextResult)
        if (nextResult.ok) router.refresh()
      })
    })
  }

  const activeHandoff = handoff?.status === 'active' ? handoff : null

  return (
    <section
      aria-labelledby="award-automation-title"
      style={{
        marginTop: 24,
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        background: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start', flexWrap: 'wrap' }}>
          <div>
            <h2 id="award-automation-title" style={{ margin: 0, fontSize: 15, color: 'var(--color-neutral-900)' }}>
              Award handoff
            </h2>
            <p style={{ margin: '5px 0 0', maxWidth: 680, fontSize: 12.5, lineHeight: 1.55, color: 'var(--color-neutral-500)' }}>
              Promote this locked BOM into one auditable execution handoff. Existing project shells are promoted in place; no duplicate project is created.
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 28,
              padding: '0 10px',
              borderRadius: 999,
              background: activeHandoff ? 'var(--color-success-soft)' : 'var(--color-neutral-100)',
              color: activeHandoff ? 'var(--color-success)' : 'var(--color-neutral-600)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {activeHandoff ? 'Awarded' : handoff?.status === 'reversed' ? 'Reversed' : 'Locked BOM'}
          </span>
        </div>
      </div>

      <div style={{ padding: 18 }}>
        {activeHandoff ? (
          <div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: 0 }}>
              <Metric label="Project code" value={activeHandoff.projectCode} />
              <Metric label="Budget baseline" value={activeHandoff.budgetId} mono />
              <Metric label="DP invoice draft" value={activeHandoff.dpInvoiceId} mono />
              <Metric label="Tracker" value={activeHandoff.projectTrackerId} mono />
            </dl>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 18 }}>
              {taskLabels.map(([key, label]) => (
                <div key={key} style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{label}</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--color-neutral-800)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflowWrap: 'anywhere' }}>
                    {activeHandoff.taskIds[key] ?? '—'}
                  </div>
                </div>
              ))}
            </div>
            <form action={submitReverse} style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="handoffId" value={activeHandoff.id} />
              <label style={{ flex: '1 1 280px', fontSize: 12, color: 'var(--color-neutral-600)' }}>
                Reversal reason
                <input
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  defaultValue="Commercial award requires correction"
                  style={inputStyle}
                />
              </label>
              <button type="submit" disabled={isPending} style={secondaryButtonStyle}>
                {isPending ? 'Reversing…' : 'Reverse handoff'}
              </button>
            </form>
          </div>
        ) : handoff?.status === 'reversed' ? (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--color-warning)' }}>
            This BOM has a recorded reversal. A new award requires an explicit re-award policy; this UI will not silently create duplicate finance artifacts.
          </p>
        ) : (
          <form action={submitAward} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) 1fr', gap: 16, alignItems: 'end' }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="bomId" value={bomId} />
            <label style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
              Down payment %
              <input name="downPaymentPercent" type="number" min="0" max="100" step="0.01" defaultValue="0" inputMode="decimal" style={inputStyle} />
            </label>
            <div>
              <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.5, color: 'var(--color-neutral-500)' }}>
                {projectCode ? `Current project code: ${projectCode}.` : 'A project code will be allocated under tenant scope.'} A zero rate creates a clearly labelled draft placeholder; Finance must confirm tax and billing treatment before issue.
              </p>
              <button type="submit" disabled={isPending} style={primaryButtonStyle}>
                {isPending ? 'Creating handoff…' : 'Create award handoff'}
              </button>
            </div>
          </form>
        )}

        {result && (
          <p role="status" aria-live="polite" style={{ margin: '16px 0 0', fontSize: 12.5, color: result.ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {result.ok ? 'Award handoff committed and the page was refreshed.' : result.error}
          </p>
        )}
      </div>
    </section>
  )
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>{label}</dt>
      <dd style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--color-neutral-900)', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined, overflowWrap: 'anywhere' }}>{value}</dd>
    </div>
  )
}

const inputStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  marginTop: 6,
  padding: '9px 11px',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-background)',
  color: 'var(--color-neutral-900)',
  font: 'inherit',
}

const primaryButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 16px',
  border: 0,
  borderRadius: 8,
  background: 'var(--color-navy-700)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: 'transparent',
  border: '1px solid var(--color-border)',
  color: 'var(--color-neutral-800)',
}
