'use client'

import { useState, useTransition } from 'react'
import { resolveChangeRequest } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface ResolveChangeRequestButtonProps {
  changeRequestId: string
}

export function ResolveChangeRequestButton({ changeRequestId }: ResolveChangeRequestButtonProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await resolveChangeRequest(formData)
      if (result.error) setError(result.error)
    })
  }

  return (
    <form action={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 145 }}>
      <input type="hidden" name="change_request_id" value={changeRequestId} />
      <input
        name="resolution_note"
        aria-label="Resolution note"
        placeholder="Resolution note (optional)"
        maxLength={2000}
        disabled={pending}
        style={{
          width: '100%',
          fontFamily: 'inherit',
          fontSize: 11,
          padding: '5px 7px',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
        }}
      />
      <button
        type="submit"
        disabled={pending}
        className="user-chip"
        style={{ cursor: pending ? 'wait' : 'pointer', alignSelf: 'flex-start' }}
      >
        {pending ? 'Resolving...' : 'Resolve request'}
      </button>
      {error && <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>{error}</span>}
    </form>
  )
}
