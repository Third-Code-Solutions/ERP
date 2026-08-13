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
  idempotencyKey: string
}

export function ChangeRequestForm({ opportunityId, designOptions, idempotencyKey }: ChangeRequestFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [currentIdempotencyKey, setCurrentIdempotencyKey] = useState(idempotencyKey)
  const formRef = useRef<HTMLFormElement>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await logChangeRequest(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setSuccess('Change request logged. Design has been notified.')
        formRef.current?.reset()
        setCurrentIdempotencyKey(crypto.randomUUID())
      }
    })
  }

  return (
    <form action={onSubmit} ref={formRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <input type="hidden" name="idempotency_key" value={currentIdempotencyKey} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="lbl" htmlFor="change-request-requested-by">
            Requested by (client name) *
          </label>
          <input
            id="change-request-requested-by"
            name="requested_by_name"
            required
            className="inp"
            placeholder="Client company - contact name"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="lbl" htmlFor="change-request-priority">Priority</label>
          <select id="change-request-priority" name="priority" defaultValue="minor" className="inp">
            <option value="minor">Minor</option>
            <option value="major">Major</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="lbl" htmlFor="change-request-design-file">Affected design file</label>
        <select id="change-request-design-file" name="affected_design_file_id" defaultValue="" className="inp">
          <option value="">- None / general feedback -</option>
          {designOptions.map((design) => (
            <option key={design.id} value={design.id}>{design.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="lbl" htmlFor="change-request-description">Description *</label>
        <textarea
          id="change-request-description"
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
        {pending ? 'Logging...' : 'Log change request'}
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
