'use client'

import { useState, useTransition } from 'react'
import {
  markDesignReady,
  markDesignApproved,
  approveWithoutChanges,
} from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

interface DesignFileActionsProps {
  designFileId: string
  isReadyForPresentation: boolean
  isClientApproved: boolean
  canMarkReady: boolean
  canMarkApproved: boolean
}

export function DesignFileActions({
  designFileId,
  isReadyForPresentation,
  isClientApproved,
  canMarkReady,
  canMarkApproved,
}: DesignFileActionsProps) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function trigger(action: 'ready' | 'approved' | 'lock') {
    setError(null)
    startTransition(async () => {
      let res: { error?: string } = {}
      if (action === 'ready') res = await markDesignReady(designFileId)
      else if (action === 'approved') res = await markDesignApproved(designFileId)
      else res = await approveWithoutChanges(designFileId)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {canMarkReady && !isReadyForPresentation && !isClientApproved && (
          <button
            type="button"
            disabled={pending}
            onClick={() => trigger('ready')}
            className="user-chip"
            style={{ cursor: pending ? 'wait' : 'pointer' }}
          >
            Mark ready
          </button>
        )}
        {canMarkApproved && !isClientApproved && (
          <button
            type="button"
            disabled={pending}
            onClick={() => trigger('approved')}
            className="user-chip"
            style={{
              cursor: pending ? 'wait' : 'pointer',
              background: 'var(--color-navy-700)',
              color: 'white',
              borderColor: 'var(--color-navy-700)',
            }}
          >
            Mark approved
          </button>
        )}
        {canMarkApproved && !isClientApproved && (
          <button
            type="button"
            disabled={pending}
            onClick={() => trigger('lock')}
            className="user-chip"
            style={{ cursor: pending ? 'wait' : 'pointer' }}
            title="Locks design and triggers BOM generation"
          >
            Approve without changes
          </button>
        )}
      </div>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  )
}
