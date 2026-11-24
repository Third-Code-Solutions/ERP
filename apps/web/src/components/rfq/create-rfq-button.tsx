'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createRfqFromBom } from '@/app/(dashboard)/procurement/rfqs/actions'

/** Create the RFQ of an approved BOM, then open it. A refusal is shown beside the button. */
export function CreateRfqButton({ bomId }: { bomId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await createRfqFromBom(bomId)
            if ('error' in result) {
              setError(result.error)
              return
            }
            router.push(`/procurement/rfqs/${result.rfqId}`)
          })
        }}
        style={{
          background: '#0F2D4A',
          color: 'white',
          border: 'none',
          padding: '6px 12px',
          borderRadius: 6,
          fontSize: 12.5,
          fontWeight: 500,
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Creating...' : 'Create RFQ'}
      </button>
      {error && (
        <span role="alert" style={{ color: '#b42318', fontSize: 12 }}>
          {error}
        </span>
      )}
    </span>
  )
}
