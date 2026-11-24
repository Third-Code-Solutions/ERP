'use client'

import { useEffect, useState } from 'react'

/** The slice of a form action state that tells whether the save committed. */
export interface SubmitOutcome {
  ok: boolean
  success?: string
}

function newRequestId(): string {
  return globalThis.crypto.randomUUID()
}

/**
 * Keeps the id when nothing committed, so a retried submit stays idempotent,
 * and replaces it once a save succeeded so the next record is not rejected
 * as a duplicate of the one just created.
 */
export function nextClientRequestId(
  current: string,
  outcome: SubmitOutcome,
  generate: () => string = newRequestId,
): string {
  if (current === '' || (outcome.ok && Boolean(outcome.success))) {
    return generate()
  }
  return current
}

/**
 * One idempotency key per record being created. Empty until mounted so the
 * server and client markup match; callers disable submit while it is empty.
 */
export function useClientRequestId(outcome: SubmitOutcome): string {
  const [clientRequestId, setClientRequestId] = useState('')

  useEffect(() => {
    setClientRequestId((current) => nextClientRequestId(current, outcome))
  }, [outcome])

  return clientRequestId
}
