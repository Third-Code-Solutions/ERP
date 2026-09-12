'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

import { addInspectionRfi } from '@/app/(dashboard)/crm/opportunities/[id]/proposal/actions'

import {
  createRfiPendingEnvelope,
  deleteRfiPending,
  loadRfiSnapshot,
  putRfiPending,
  rfiScopeKey,
  saveRfiDraft,
  sameRfiScope,
  type RfiDraftInput,
  type RfiPendingEnvelope,
  type RfiScope,
} from './rfi-offline-store'

interface RfiFormProps {
  opportunityId: string
  inspectionId: string
  submissionId: string
  actorId: string
  tenantId: string
}

type SyncState = 'idle' | 'queued' | 'syncing' | 'rejected' | 'unknown' | 'confirmed'

const rfiActionSuccessSchema = z.object({
  ok: z.literal(true),
  rfiId: z.string().uuid(),
  replayed: z.boolean(),
  refreshFailed: z.boolean(),
  confirmation: z.object({
    actorId: z.string().uuid(),
    tenantId: z.string().uuid(),
    submissionId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    inspectionId: z.string().uuid(),
  }).strict(),
}).strict()

const rfiActionFailureSchema = z.object({
  ok: z.literal(false),
  error: z.string().trim().min(1),
  code: z.string().trim().min(1),
  outcome: z.enum(['rejected', 'unknown']),
}).strict()

type RfiActionSuccess = z.infer<typeof rfiActionSuccessSchema>
type RfiActionFailure = z.infer<typeof rfiActionFailureSchema>

function samePendingEnvelope(left: RfiPendingEnvelope, right: RfiPendingEnvelope): boolean {
  return (
    left.scopeKey === right.scopeKey &&
    sameRfiScope(left.scope, right.scope) &&
    left.submissionId === right.submissionId &&
    left.description === right.description &&
    left.priority === right.priority
  )
}

function isMatchingSuccess(
  value: unknown,
  pending: RfiPendingEnvelope,
): value is RfiActionSuccess {
  const parsed = rfiActionSuccessSchema.safeParse(value)
  if (!parsed.success) return false
  const confirmation = parsed.data.confirmation
  return (
    confirmation.actorId === pending.scope.actorId &&
    confirmation.tenantId === pending.scope.tenantId &&
    confirmation.submissionId === pending.submissionId &&
    confirmation.opportunityId === pending.scope.opportunityId &&
    confirmation.inspectionId === pending.scope.inspectionId
  )
}

function readFailure(value: unknown): RfiActionFailure | null {
  const parsed = rfiActionFailureSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function isNamedError(value: unknown, name: string): boolean {
  return value instanceof Error && value.name === name
}

function storageSaveFailureMessage(): string {
  return 'This browser could not save the RFI locally. Nothing was sent.'
}

function storageReadFailureMessage(): string {
  return 'Saved RFI state could not be read from this device. No local data was changed.'
}

function pendingReadFailureMessage(): string {
  return 'The queued RFI could not be read from this device. Its outcome remains unconfirmed; retry to check it again.'
}

function draftRestoredMessage(updatedAt: number): string {
  const savedAt = new Date(updatedAt)
  if (Number.isNaN(savedAt.getTime())) return 'Saved draft restored on this device.'
  return `Saved draft restored from ${savedAt.toLocaleString()}.`
}

export function RfiForm({
  opportunityId,
  inspectionId,
  submissionId,
  actorId,
  tenantId,
}: RfiFormProps) {
  const scope = useMemo<RfiScope>(() => ({
    actorId,
    tenantId,
    opportunityId,
    inspectionId,
  }), [actorId, inspectionId, opportunityId, tenantId])
  const scopeKey = useMemo(() => rfiScopeKey(scope), [scope])
  const [retryKey, setRetryKey] = useState(submissionId)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'minor' | 'major'>('minor')
  const [error, setError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [connectionGeneration, setConnectionGeneration] = useState(0)
  const [storageState, setStorageState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [hydrated, setHydrated] = useState(false)
  const [pendingEnvelope, setPendingEnvelope] = useState<RfiPendingEnvelope | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [submitting, setSubmitting] = useState(false)
  const inFlightRef = useRef<{ scopeKey: string; epoch: number } | null>(null)
  const scopeEpochRef = useRef(0)
  const draftTimerRef = useRef<number | null>(null)
  const autoAttemptRef = useRef<string | null>(null)
  const draftSaveChainRef = useRef<Promise<void>>(Promise.resolve())
  const revisionRef = useRef(0)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const seededSubmissionIdRef = useRef(submissionId)

  useEffect(() => {
    seededSubmissionIdRef.current = submissionId
  }, [scopeKey, submissionId])

  const isCurrentScope = useCallback((epoch: number, expectedScopeKey: string) => {
    return scopeEpochRef.current === epoch && expectedScopeKey === scopeKey
  }, [scopeKey])

  const persistDraft = useCallback(async (
    input: RfiDraftInput,
    epoch = scopeEpochRef.current,
  ): Promise<boolean> => {
    const write = draftSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (!isCurrentScope(epoch, scopeKey)) return false
        const nextRevision = await saveRfiDraft(scope, input, revisionRef.current)
        if (!isCurrentScope(epoch, scopeKey)) return false
        revisionRef.current = nextRevision
        return true
      })
    draftSaveChainRef.current = write.then(() => undefined, () => undefined)
    try {
      const saved = await write
      if (!saved || !isCurrentScope(epoch, scopeKey)) return false
      setStorageState('ready')
      setStorageError(null)
      setDraftMessage(
        online === false
          ? 'Draft saved on this device while offline.'
          : 'Draft saved on this device.',
      )
      return true
    } catch (reason) {
      if (!isCurrentScope(epoch, scopeKey)) return false
      // A queued envelope intentionally blocks late draft writes. Surface the
      // conflict so a stale tab cannot imply that its edit was saved.
      if (isNamedError(reason, 'RfiPendingConflictError')) {
        setDraftMessage(null)
        setStorageError('This RFI changed in another tab, so your local edit was not saved. Reload this inspection before continuing.')
        return false
      }
      setStorageState('failed')
      setDraftMessage(null)
      setStorageError(storageSaveFailureMessage())
      return false
    }
  }, [isCurrentScope, online, scope, scopeKey])

  const scheduleDraftSave = useCallback((input: RfiDraftInput) => {
    if (!hydrated || pendingEnvelope) return
    if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current)
    const epoch = scopeEpochRef.current
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null
      void persistDraft(input, epoch)
    }, 220)
  }, [hydrated, pendingEnvelope, persistDraft])

  const syncPending = useCallback(async (
    envelope: RfiPendingEnvelope,
    epoch: number,
    alreadyOwned = false,
  ) => {
    const expectedScopeKey = envelope.scopeKey
    if (!isCurrentScope(epoch, expectedScopeKey)) return
    if (online !== true) {
      setSyncState('queued')
      setSuccess(null)
      setError(null)
      setDraftMessage(
        online === false
          ? 'Saved offline. It will sync when connection returns.'
          : 'Connection status is not available. The queued RFI remains on this device.',
      )
      return
    }
    if (!alreadyOwned) {
      if (inFlightRef.current) return
      inFlightRef.current = { scopeKey: expectedScopeKey, epoch }
    }
    setSyncState('syncing')
    setError(null)
    setSuccess(null)
    setDraftMessage(null)

    try {
      let stored: RfiPendingEnvelope | null
      let snapshotRevision = 0
      try {
        const snapshot = await loadRfiSnapshot(envelope.scope)
        stored = snapshot.pending
        snapshotRevision = snapshot.revision
      } catch {
        if (isCurrentScope(epoch, expectedScopeKey)) {
          setStorageState('failed')
          setSyncState('unknown')
          setError(pendingReadFailureMessage())
        }
        return
      }
      if (!isCurrentScope(epoch, expectedScopeKey)) return
      revisionRef.current = snapshotRevision
      setStorageState('ready')
      if (!stored || !samePendingEnvelope(stored, envelope)) {
        if (isCurrentScope(epoch, expectedScopeKey)) {
          setSyncState('unknown')
          setError('The queued RFI changed before it could be sent. It remains unconfirmed; retry to check it again.')
        }
        return
      }

      const formData = new FormData()
      formData.set('submission_id', stored.submissionId)
      formData.set('description', stored.description)
      formData.set('priority', stored.priority)
      let result: unknown
      try {
        result = await addInspectionRfi(
          stored.scope.opportunityId,
          stored.scope.inspectionId,
          formData,
          { actorId: stored.scope.actorId, tenantId: stored.scope.tenantId },
        )
      } catch {
        if (isCurrentScope(epoch, expectedScopeKey)) {
          setSyncState('unknown')
          setError('The RFI outcome could not be confirmed. The queued request is preserved; retry to check it again.')
        }
        return
      }

      if (!isCurrentScope(epoch, expectedScopeKey)) return
      if (isMatchingSuccess(result, stored)) {
        try {
          // The matching draft was consumed atomically when this command was
          // enqueued; this transaction removes only the exact queued command
          // after the server acknowledgement. No key rotation precedes it.
          const nextRevision = await deleteRfiPending(stored)
          if (!isCurrentScope(epoch, expectedScopeKey)) return
          revisionRef.current = nextRevision
        } catch {
          if (!isCurrentScope(epoch, expectedScopeKey)) return
          setSyncState('unknown')
          setError('RFI was accepted, but this device could not clear its queued copy. The same request is preserved; retry to confirm it again.')
          return
        }
        if (!isCurrentScope(epoch, expectedScopeKey)) return

        setPendingEnvelope(null)
        setSyncState('confirmed')
        setDescription('')
        setPriority('minor')
        setRetryKey(crypto.randomUUID())
        setError(null)
        setStorageError(null)
        const confirmationMessage = result.replayed
          ? 'This RFI was already added. The existing record was recovered.'
          : 'RFI added.'
        setSuccess(
          result.refreshFailed
            ? `${confirmationMessage} The server refresh is pending; the record was confirmed.`
            : confirmationMessage,
        )
        setDraftMessage(null)
        return
      }

      const failure = readFailure(result)
      if (failure?.outcome === 'rejected') {
        setSyncState('rejected')
        setError(`RFI was not accepted: ${failure.error} The queued request is preserved; retry to send it again.`)
      } else {
        setSyncState('unknown')
        setError(
          failure
            ? `RFI submission is unconfirmed: ${failure.error} The queued request is preserved; retry to check it again.`
            : 'RFI submission is unconfirmed. The queued request is preserved; retry to check it again.',
        )
      }
    } finally {
      if (!alreadyOwned && inFlightRef.current?.scopeKey === expectedScopeKey && inFlightRef.current.epoch === epoch) {
        inFlightRef.current = null
      }
    }
  }, [isCurrentScope, online])

  useEffect(() => {
    const epoch = scopeEpochRef.current + 1
    scopeEpochRef.current = epoch
    let active = true
    if (draftTimerRef.current !== null) {
      window.clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    inFlightRef.current = null
    setSubmitting(false)
    autoAttemptRef.current = null
    draftSaveChainRef.current = Promise.resolve()
    revisionRef.current = 0
    setHydrated(false)
    setStorageState('loading')
    setStorageError(null)
    setError(null)
    setSuccess(null)
    setDraftMessage(null)
    setDescription('')
    setPriority('minor')
    setRetryKey(seededSubmissionIdRef.current)
    setPendingEnvelope(null)
    setSyncState('idle')

    void loadRfiSnapshot(scope).then(
      (snapshot) => {
        if (!active || !isCurrentScope(epoch, scopeKey)) return
        revisionRef.current = snapshot.revision
        setStorageState('ready')
        setHydrated(true)
        const { draft, pending: queued } = snapshot
        if (queued) {
          setPendingEnvelope(queued)
          setRetryKey(queued.submissionId)
          setDescription(queued.description)
          setPriority(queued.priority)
          setSyncState('queued')
          setDraftMessage('A queued RFI is ready to sync.')
        } else if (draft) {
          setDescription(draft.description)
          setPriority(draft.priority)
          setDraftMessage(draftRestoredMessage(draft.updatedAt))
        }
      },
      () => {
        if (!active || !isCurrentScope(epoch, scopeKey)) return
        setHydrated(true)
        setStorageState('failed')
        setStorageError(storageReadFailureMessage())
      },
    )
    return () => {
      active = false
      scopeEpochRef.current += 1
      inFlightRef.current = null
      if (draftTimerRef.current !== null) {
        window.clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
    }
  }, [inspectionId, isCurrentScope, opportunityId, scope, scopeKey, tenantId, actorId])

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    let lastOnline = navigator.onLine
    setOnline(lastOnline)
    const handleOnline = () => {
      if (lastOnline) return
      lastOnline = true
      setOnline(true)
      setConnectionGeneration((current) => current + 1)
    }
    const handleOffline = () => {
      if (!lastOnline) return
      lastOnline = false
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!hydrated || storageState === 'failed' || online !== true || !pendingEnvelope) return
    const attemptKey = `${scopeKey}:${connectionGeneration}`
    if (autoAttemptRef.current === attemptKey) return
    autoAttemptRef.current = attemptKey
    void syncPending(pendingEnvelope, scopeEpochRef.current)
  }, [connectionGeneration, hydrated, online, pendingEnvelope, scopeKey, storageState, syncPending])

  useEffect(() => {
    const input = descriptionRef.current
    if (!input) return
    input.setCustomValidity(
      description.length > 0 && description.trim().length < 2
        ? 'Enter at least two non-space characters.'
        : '',
    )
    return () => input.setCustomValidity('')
  }, [description])

  function clearFeedback() {
    setError(null)
    setSuccess(null)
    setStorageError(null)
    setDraftMessage(null)
    if (syncState === 'confirmed') setSyncState('idle')
  }

  function onSubmit(formData: FormData) {
    if (inFlightRef.current) return
    if (pendingEnvelope) return
    const rawDescription = formData.get('description')
    const rawPriority = formData.get('priority')
    if (typeof rawDescription !== 'string' || typeof rawPriority !== 'string') {
      setError('Enter an RFI description and priority before submitting.')
      setSuccess(null)
      return
    }
    const normalizedDescription = rawDescription.trim()
    if (normalizedDescription.length < 2 || (rawPriority !== 'minor' && rawPriority !== 'major')) {
      setError('Enter at least two non-space characters and choose a valid priority.')
      setSuccess(null)
      return
    }
    if (!retryKey) {
      setError('This RFI does not have a submission identity yet. Reload and retry.')
      setSuccess(null)
      return
    }

    const input: RfiDraftInput = {
      description: normalizedDescription,
      priority: rawPriority,
    }
    const envelope = createRfiPendingEnvelope(scope, input, retryKey)
    const epoch = scopeEpochRef.current
    inFlightRef.current = { scopeKey, epoch }
    setError(null)
    setSuccess(null)
    setStorageError(null)

    setSubmitting(true)
    void (async () => {
      try {
        if (draftTimerRef.current !== null) {
          window.clearTimeout(draftTimerRef.current)
          draftTimerRef.current = null
        }
        const persisted = await persistDraft(input, epoch)
        if (!persisted || !isCurrentScope(epoch, scopeKey)) return
        const nextRevision = await putRfiPending(envelope, revisionRef.current)
        if (!isCurrentScope(epoch, scopeKey)) return
        revisionRef.current = nextRevision
        setStorageState('ready')
        setPendingEnvelope(envelope)
        setSyncState('queued')
        setDescription(input.description)
        setPriority(input.priority)
        setDraftMessage(
          online === false
            ? 'Saved offline. It will sync when connection returns.'
            : 'RFI queued locally and ready to sync.',
        )
        if (online === true) {
          await syncPending(envelope, epoch, true)
        }
      } catch (reason) {
        if (!isCurrentScope(epoch, scopeKey)) return
        setSyncState('idle')
        if (isNamedError(reason, 'RfiPendingConflictError')) {
          setError('Another tab has a different queued RFI for this inspection. Review it there before submitting another request.')
        } else {
          setStorageState('failed')
          setError(storageSaveFailureMessage())
        }
        setSuccess(null)
      } finally {
        if (inFlightRef.current?.scopeKey === scopeKey && inFlightRef.current.epoch === epoch) {
          inFlightRef.current = null
          setSubmitting(false)
        }
      }
    })()
  }

  function retryPending() {
    if (!pendingEnvelope || inFlightRef.current) return
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    const epoch = scopeEpochRef.current
    void syncPending(pendingEnvelope, epoch).finally(() => {
      if (isCurrentScope(epoch, scopeKey)) setSubmitting(false)
    })
  }

  const readOnly = pendingEnvelope !== null || syncState === 'syncing'
  const statusText = syncState === 'syncing'
    ? 'RFI is syncing…'
    : syncState === 'queued'
      ? online === false
        ? 'Saved offline. It will sync when connection returns.'
        : 'RFI is queued on this device.'
      : syncState === 'rejected'
        ? 'RFI was not accepted. Retry keeps the same request.'
        : syncState === 'unknown'
          ? 'RFI outcome is unconfirmed. Retry keeps the same request.'
          : syncState === 'confirmed'
            ? success ?? 'RFI added.'
            : draftMessage
              ?? (online === null
                ? 'Checking connection status…'
                : online === false
                  ? 'Offline. Draft changes stay on this device until you submit.'
                  : '')

  return (
    <form
      action={onSubmit}
      aria-busy={submitting || syncState === 'syncing'}
      aria-describedby="rfi-form-status"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}
    >
      <input type="hidden" name="submission_id" value={retryKey} />
      <div
        className="form-row-2col"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}
      >
        <div>
          <label className="form-label" htmlFor="rfi-description">Description</label>
          <textarea
            ref={descriptionRef}
            className="form-input"
            id="rfi-description"
            name="description"
            required
            minLength={2}
            maxLength={2000}
            rows={3}
            placeholder="New RFI…"
            value={description}
            disabled={readOnly}
            onChange={(event) => {
              const value = event.target.value
              setDescription(value)
              clearFeedback()
              scheduleDraftSave({ description: value, priority })
            }}
            onBlur={() => void persistDraft({ description, priority })}
            aria-invalid={Boolean(error)}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="rfi-priority">Priority</label>
          <select
            id="rfi-priority"
            name="priority"
            className="form-input"
            value={priority}
            disabled={readOnly}
            onChange={(event) => {
              const value = event.target.value
              if (value !== 'minor' && value !== 'major') return
              setPriority(value)
              clearFeedback()
              scheduleDraftSave({ description, priority: value })
            }}
            onBlur={() => void persistDraft({ description, priority })}
          >
            <option value="minor">Minor</option>
            <option value="major">Major</option>
          </select>
        </div>
      </div>

      <div id="rfi-form-status" aria-live="polite" aria-atomic="true">
        {statusText && <p className="form-help" role="status">{statusText}</p>}
        {error && <p className="form-error" role="alert" aria-live="assertive">{error}</p>}
        {storageError && <p className="form-error" role="alert" aria-live="assertive">{storageError}</p>}
      </div>

      <div className="action-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {readOnly ? (
          <button
            type="button"
            disabled={submitting || storageState === 'loading'}
            className="button-primary"
            onClick={retryPending}
          >
            {submitting || syncState === 'syncing' ? 'Retrying…' : 'Retry RFI'}
          </button>
        ) : (
          <button
            type="submit"
            disabled={submitting || !hydrated || storageState === 'loading'}
            className="button-primary"
          >
            {submitting ? 'Saving…' : 'Add RFI'}
          </button>
        )}
      </div>
    </form>
  )
}
