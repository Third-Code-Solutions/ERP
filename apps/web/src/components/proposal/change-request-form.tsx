'use client'

import { useRef, useState, useTransition } from 'react'
import { logChangeRequest } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface DesignOption {
  id: string
  name: string
}

interface ChangeRequestFormProps {
  opportunityId: string
  designOptions: DesignOption[]
}

export function ChangeRequestForm({ opportunityId, designOptions }: ChangeRequestFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const idempotencyKeyRef = useRef<string | null>(null)

  function idempotencyKey(): string {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = globalThis.crypto.randomUUID()
    }
    return idempotencyKeyRef.current
  }

  function onSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    formData.set('idempotency_key', idempotencyKey())
    startTransition(async () => {
      const res = await logChangeRequest(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        setSuccess('Change request logged. Design has been notified.')
        formRef.current?.reset()
        idempotencyKeyRef.current = null
      }
    })
  }

  return (
    <form action={onSubmit} ref={formRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="opportunity_id" value={opportunityId} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="lbl">Requested by (client name) *</label>
          <input name="requested_by_name" required className="inp" placeholder="Acme Corp · Ana Reyes" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="lbl">Priority</label>
          <select name="priority" defaultValue="minor" className="inp">
            <option value="minor">Minor</option>
            <option value="major">Major</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="lbl">Affected design file</label>
        <select name="affected_design_file_id" defaultValue="" className="inp">
          <option value="">— None / general feedback —</option>
          {designOptions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="lbl">Description *</label>
        <textarea
          name="description"
          required
          rows={4}
          className="inp"
          placeholder="What does the client want changed?"
        />
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: 0 }}>{error}</p>}
      {success && <p style={{ color: 'var(--color-success, #15803d)', fontSize: 12, margin: 0 }}>{success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="user-chip"
        style={{
          alignSelf: 'flex-start',
          cursor: pending ? 'wait' : 'pointer',
          background: 'var(--color-navy-700)',
          color: 'white',
          borderColor: 'var(--color-navy-700)',
        }}
      >
        {pending ? 'Logging…' : 'Log change request'}
      </button>

      <style>{`
        .lbl { font-size: 12px; font-weight: 500; color: var(--color-neutral-700); }
        .inp {
          font-family: inherit; font-size: 13px; padding: 7px 9px;
          border: 1px solid var(--color-border); border-radius: 4px;
          background: white;
        }
        .inp:focus {
          outline: 0; border-color: var(--color-navy-500);
          box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-navy-500) 18%, transparent);
        }
      `}</style>
    </form>
  )
}
