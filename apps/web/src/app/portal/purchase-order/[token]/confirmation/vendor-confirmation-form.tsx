'use client'

import { useActionState, useState } from 'react'
import type { VendorConfirmationDecision } from '@third-code-erp/shared-types'
import {
  submitVendorConfirmationAction,
  type VendorConfirmationActionState,
} from './actions'

const INITIAL_STATE: VendorConfirmationActionState = { ok: false }

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `vendor-${Date.now()}`
}

export function VendorConfirmationForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    submitVendorConfirmationAction.bind(null, token),
    INITIAL_STATE
  )
  const [decision, setDecision] = useState<VendorConfirmationDecision>('accepted')
  const [idempotencyKey] = useState(newIdempotencyKey)

  if (state.ok) {
    return (
      <section className="vendor-confirmation-success" aria-live="polite">
        <p className="vendor-confirmation-kicker">Response recorded</p>
        <h2>Thanks. Your supplier response is on file.</h2>
        <p>
          The project team can now continue with the order. You can close this
          window; no second response is needed.
        </p>
      </section>
    )
  }

  return (
    <form action={formAction} className="vendor-confirmation-form">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="vendor-confirmation-field">
        <label htmlFor="vendor-responder-name">Your name</label>
        <input
          id="vendor-responder-name"
          name="responderName"
          autoComplete="name"
          maxLength={255}
          required
          placeholder="Name of person responding"
        />
      </div>

      <div className="vendor-confirmation-field">
        <label htmlFor="vendor-responder-email">Email (optional)</label>
        <input
          id="vendor-responder-email"
          name="responderEmail"
          type="email"
          autoComplete="email"
          maxLength={255}
          placeholder="you@company.com"
        />
      </div>

      <fieldset className="vendor-confirmation-fieldset">
        <legend>Response</legend>
        <div className="vendor-confirmation-decisions">
          {(
            [
              ['accepted', 'Accept order', 'Confirm quantities, pricing, and delivery.'],
              ['changes_requested', 'Request changes', 'Ask the project team to revise this order.'],
              ['declined', 'Decline order', 'Tell the project team why you cannot accept it.'],
            ] as const
          ).map(([value, label, description]) => (
            <button
              key={value}
              type="submit"
              name="decision"
              value={value}
              aria-pressed={decision === value}
              className={`vendor-confirmation-decision ${decision === value ? 'is-selected' : ''} decision-${value}`}
              disabled={pending}
              onClick={() => setDecision(value)}
            >
              <span>{label}</span>
              <small>{description}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="vendor-confirmation-field">
        <label htmlFor="vendor-response-note">
          Note {decision === 'accepted' ? '(optional)' : '(required)'}
        </label>
        <textarea
          id="vendor-response-note"
          name="note"
          rows={4}
          maxLength={2_000}
          required={decision !== 'accepted'}
          placeholder={
            decision === 'accepted'
              ? 'Add a delivery note or question, if useful.'
              : 'Explain what needs to change or why you cannot accept.'
          }
        />
      </div>

      {state.message && (
        <p className="vendor-confirmation-error" role="alert">
          {state.message}
        </p>
      )}

      <p className="vendor-confirmation-submit-note">
        Your response is committed once, then protected against duplicate retries.
      </p>
    </form>
  )
}
