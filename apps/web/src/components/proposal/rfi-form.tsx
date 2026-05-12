'use client'

import { useRef, useState, useTransition } from 'react'
import { addInspectionRfi } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface RfiFormProps {
  opportunityId: string
  inspectionId: string
}

export function RfiForm({ opportunityId, inspectionId }: RfiFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const res = await addInspectionRfi(formData)
      if (res?.error) {
        setError(res.error)
      } else {
        formRef.current?.reset()
      }
    })
  }

  return (
    <form action={onSubmit} ref={formRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 6 }}>
        <input
          name="description"
          required
          placeholder="New RFI…"
          style={{
            fontFamily: 'inherit', fontSize: 13, padding: '7px 9px',
            border: '1px solid var(--color-border)', borderRadius: 4,
          }}
        />
        <select
          name="priority"
          defaultValue="minor"
          style={{
            fontFamily: 'inherit', fontSize: 13, padding: '7px 9px',
            border: '1px solid var(--color-border)', borderRadius: 4,
          }}
        >
          <option value="minor">Minor</option>
          <option value="major">Major</option>
        </select>
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="user-chip"
        style={{ alignSelf: 'flex-start', cursor: pending ? 'wait' : 'pointer' }}
      >
        {pending ? 'Adding…' : 'Add RFI'}
      </button>
    </form>
  )
}
