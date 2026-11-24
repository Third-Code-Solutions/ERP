'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resendSupplierPoEmail } from '@/app/(dashboard)/procurement/actions'
import { supplierEmailOutcomeMessage } from '@/lib/procurement/supplier-email-outcome'

/**
 * An issued Purchase Order whose supplier email is not on record as sent. The
 * message says why; a user with po.issue can resend once the cause is fixed.
 */
export function SupplierEmailBanner({
  poId,
  message,
  canResend,
}: {
  poId: string
  message: string
  canResend: boolean
}) {
  const router = useRouter()
  const [result, setResult] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div
      role="alert"
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        border: '1px solid color-mix(in oklch, var(--color-warning) 22%, transparent)',
        borderRadius: 6,
        background: 'var(--color-warning-soft)',
        color: 'var(--color-warning)',
        fontSize: '0.8125rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span>{result ?? message}</span>
      {canResend && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const outcome = await resendSupplierPoEmail(poId)
              if (outcome.error) {
                setResult(outcome.error)
                return
              }
              if (outcome.emailOutcome === 'sent') {
                setResult(null)
                router.refresh()
                return
              }
              setResult(
                outcome.emailOutcome
                  ? supplierEmailOutcomeMessage(outcome.emailOutcome)
                  : message
              )
            })
          }
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: pending ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {pending ? 'Sending...' : 'Resend supplier email'}
        </button>
      )}
    </div>
  )
}
