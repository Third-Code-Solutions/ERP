'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  cortexSemanticIndexAcceptedSchema,
  cortexSemanticIndexStatusSchema,
  type CortexSemanticIndexStatus,
} from '@third-code-erp/shared-types'

type State =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'active'; jobId: string; status: 'queued' | 'processing' }
  | { kind: 'done'; processed: number }
  | { kind: 'error'; message: string }

const POLL_INTERVAL_MS = 1_500
const MAX_STATUS_POLLS = 120
const PAUSED_REASON =
  'The provider-spend canary is closed for this tenant; no external indexing request can be sent.'

function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, POLL_INTERVAL_MS)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export function CortexIndexButton({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const dialogRef = useRef<HTMLDialogElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  function openConfirmation() {
    if (!enabled || state.kind === 'submitting' || state.kind === 'active') return
    dialogRef.current?.showModal()
  }

  async function approve() {
    dialogRef.current?.close()
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ kind: 'submitting' })

    try {
      const response = await fetch('/api/cortex/semantic-index-jobs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({ maxNodes: 64, costConsent: true }),
        signal: controller.signal,
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const error = payload as { error?: unknown } | null
        throw new Error(
          typeof error?.error === 'string'
            ? error.error
            : `Indexing request failed (${response.status})`
        )
      }

      const accepted = cortexSemanticIndexAcceptedSchema.safeParse(payload)
      if (accepted.success) {
        setState({ kind: 'active', jobId: accepted.data.jobId, status: 'queued' })
        await poll(accepted.data.jobId, controller)
        return
      }
      const status = cortexSemanticIndexStatusSchema.safeParse(payload)
      if (!status.success) throw new Error('Indexer returned an invalid job')
      await applyStatus(status.data, controller)
    } catch (error) {
      if (controller.signal.aborted) return
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not reach the indexer',
      })
    }
  }

  async function applyStatus(
    status: CortexSemanticIndexStatus,
    controller: AbortController
  ) {
    if (status.status === 'succeeded') {
      setState({ kind: 'done', processed: status.processedNodes })
      return
    }
    if (status.status === 'failed') {
      setState({ kind: 'error', message: 'Semantic indexing did not complete.' })
      return
    }
    setState({ kind: 'active', jobId: status.jobId, status: status.status })
    await poll(status.jobId, controller)
  }

  async function poll(jobId: string, controller: AbortController) {
    for (let pollNumber = 0; pollNumber < MAX_STATUS_POLLS; pollNumber += 1) {
      await waitForNextPoll(controller.signal)
      const response = await fetch(
        `/api/cortex/semantic-index-jobs/${encodeURIComponent(jobId)}`,
        { cache: 'no-store', signal: controller.signal }
      )
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(`Index status failed (${response.status})`)
      const parsed = cortexSemanticIndexStatusSchema.safeParse(payload)
      if (!parsed.success) throw new Error('Indexer returned an invalid status')
      if (parsed.data.status === 'succeeded') {
        setState({ kind: 'done', processed: parsed.data.processedNodes })
        return
      }
      if (parsed.data.status === 'failed') {
        setState({ kind: 'error', message: 'Semantic indexing did not complete.' })
        return
      }
      setState({
        kind: 'active',
        jobId: parsed.data.jobId,
        status: parsed.data.status,
      })
    }
    setState({
      kind: 'error',
      message: 'Indexing is still running. Refresh to check again.',
    })
  }

  const busy = state.kind === 'submitting' || state.kind === 'active'
  const label = !enabled
    ? 'Semantic indexing paused'
    : state.kind === 'submitting'
      ? 'Creating index job…'
      : state.kind === 'active'
        ? state.status === 'queued'
          ? 'Index queued'
          : 'Indexing up to 64 records…'
        : state.kind === 'done'
          ? `Indexed ${state.processed} records`
          : 'Index up to 64 records'

  return (
    <div className="cortex-index-ctl">
      <button
        type="button"
        className="cortex-tool-btn"
        onClick={openConfirmation}
        disabled={!enabled || busy}
        aria-disabled={!enabled || busy}
        aria-describedby={!enabled ? 'cortex-index-paused-reason' : undefined}
        title={
          enabled
            ? 'Create one cost-bounded semantic indexing job'
            : PAUSED_REASON
        }
      >
        {label}
      </button>

      {!enabled && (
        <span id="cortex-index-paused-reason" className="cortex-index-ctl__paused-reason">
          {PAUSED_REASON}
        </span>
      )}

      <dialog
        ref={dialogRef}
        className="cortex-index-dialog"
        role="alertdialog"
        aria-labelledby="cortex-index-dialog-title"
        aria-describedby="cortex-index-dialog-description"
      >
        <div className="cortex-index-dialog__body">
          <p className="cortex-index-dialog__eyebrow">Cost-controlled action</p>
          <h2 id="cortex-index-dialog-title">Build one semantic index batch?</h2>
          <p id="cortex-index-dialog-description">
            This indexes up to 64 records and permits at most one external
            embedding-provider call. Another batch always needs another approval.
          </p>
          <div className="cortex-index-dialog__actions">
            <button
              type="button"
              className="cortex-tool-btn"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cortex-tool-btn is-active"
              onClick={() => void approve()}
            >
              Approve 1 provider call
            </button>
          </div>
        </div>
      </dialog>

      <span className="cortex-index-ctl__status" aria-live="polite">
        {state.kind === 'error' ? state.message : ''}
      </span>
    </div>
  )
}
