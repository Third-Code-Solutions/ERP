import { z } from 'zod'

export const RFI_OFFLINE_DB_NAME = 'abi-ops-inspection-rfi'
export const RFI_DRAFT_STORE_NAME = 'drafts'
export const RFI_PENDING_STORE_NAME = 'pending'
const stores = [RFI_DRAFT_STORE_NAME, RFI_PENDING_STORE_NAME]
const uuid = z.string().uuid()
const prioritySchema = z.enum(['minor', 'major'])
const scopeSchema = z.object({ actorId: uuid, tenantId: uuid, opportunityId: uuid, inspectionId: uuid }).strict()
const draftInputSchema = z.object({ description: z.string().max(2000), priority: prioritySchema }).strict()
const integer = z.number().finite().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const draftSchema = z.object({ scope: scopeSchema, scopeKey: z.string().max(200), description: z.string().max(2000), priority: prioritySchema, updatedAt: integer }).strict()
const pendingSchema = z.object({ scope: scopeSchema, scopeKey: z.string().max(200), submissionId: uuid, description: z.string().min(2).max(2000).refine(value => value === value.trim()), priority: prioritySchema, createdAt: integer, updatedAt: integer }).strict()
const revisionSchema = z.object({ scopeKey: z.string().max(220), revision: integer }).strict()

export type RfiScope = z.infer<typeof scopeSchema>
export type RfiPriority = z.infer<typeof prioritySchema>
export type RfiDraftInput = z.infer<typeof draftInputSchema>
export type RfiDraft = z.infer<typeof draftSchema>
export type RfiPendingEnvelope = z.infer<typeof pendingSchema>
export type RfiSnapshot = { draft: RfiDraft | null; pending: RfiPendingEnvelope | null; revision: number }

export class RfiOfflineStorageError extends Error {
  constructor(message = 'RFI browser storage failed. Your request has not been confirmed.') {
    super(message)
    this.name = 'RfiOfflineStorageError'
  }
}
export class RfiPendingConflictError extends Error {
  constructor() {
    super('Saved RFI state changed in another tab. Reload it before continuing.')
    this.name = 'RfiPendingConflictError'
  }
}

export function rfiScopeKey(scope: RfiScope): string {
  const value = scopeSchema.parse(scope)
  return [value.actorId, value.tenantId, value.opportunityId, value.inspectionId].join('|')
}
export function sameRfiScope(left: RfiScope, right: RfiScope): boolean {
  return rfiScopeKey(left) === rfiScopeKey(right)
}
export function createRfiPendingEnvelope(scope: RfiScope, input: RfiDraftInput, submissionId: string, now = Date.now()): RfiPendingEnvelope {
  const value = draftInputSchema.parse(input)
  return pendingSchema.parse({ scope, scopeKey: rfiScopeKey(scope), submissionId, description: value.description.trim(), priority: value.priority, createdAt: now, updatedAt: now })
}

function checkedDraft(value: unknown, key: string): RfiDraft | null {
  if (value === undefined) return null
  const result = draftSchema.safeParse(value)
  if (!result.success || result.data.scopeKey !== key || rfiScopeKey(result.data.scope) !== key) {
    throw new RfiOfflineStorageError('Stored RFI draft is invalid. It was preserved and was not submitted.')
  }
  return result.data
}
function checkedPending(value: unknown, key: string): RfiPendingEnvelope | null {
  if (value === undefined) return null
  const result = pendingSchema.safeParse(value)
  if (!result.success || result.data.scopeKey !== key || rfiScopeKey(result.data.scope) !== key || result.data.updatedAt < result.data.createdAt) {
    throw new RfiOfflineStorageError('Stored queued RFI is invalid. It was preserved and was not submitted.')
  }
  return result.data
}
function samePending(left: RfiPendingEnvelope, right: RfiPendingEnvelope): boolean {
  return left.scopeKey === right.scopeKey && left.submissionId === right.submissionId && left.description === right.description && left.priority === right.priority
}
function validateEnvelope(envelope: RfiPendingEnvelope): RfiPendingEnvelope {
  const result = checkedPending(envelope, rfiScopeKey(envelope.scope))
  if (!result) throw new RfiOfflineStorageError('The queued RFI is missing.')
  return result
}

function openDatabase(): Promise<IDBDatabase> {
  // Each operation owns and closes its connection. No cached closed handle can
  // survive versionchange, a rejected open, or an abnormal database close.
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    let failed = false
    const fail = () => { failed = true; reject(new RfiOfflineStorageError('RFI browser storage could not be opened. Nothing was saved by this operation.')) }
    try {
      if (typeof indexedDB === 'undefined') { fail(); return }
      request = indexedDB.open(RFI_OFFLINE_DB_NAME, 1)
      request.onupgradeneeded = () => {
        try {
          for (const name of stores) {
            if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'scopeKey' })
          }
        } catch {
          fail()
          try { request.transaction?.abort() } catch { /* Open already failed; onsuccess closes any late handle. */ }
        }
      }
      request.onerror = fail
      request.onblocked = fail
      request.onsuccess = () => {
        const database = request.result
        if (failed) { database.close(); return }
        database.onversionchange = () => database.close()
        resolve(database)
      }
    } catch { fail() }
  })
}

// One RFI-specific transaction reads both stores and retained revision metadata.
// Metadata shares the drafts store under a disjoint key; version 1 needs no
// extra object store. Retaining it after acknowledgement fences stale autosaves.
async function withSnapshot<T>(scope: RfiScope, mode: IDBTransactionMode, work: (snapshot: RfiSnapshot, drafts: IDBObjectStore, pending: IDBObjectStore) => T): Promise<T> {
  const key = rfiScopeKey(scope)
  const revisionKey = `revision|${key}`
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction
    let failure: Error | null = null
    let outcome: { value: T } | null = null
    const fail = (error: unknown) => {
      failure ??= error instanceof RfiOfflineStorageError || error instanceof RfiPendingConflictError ? error : new RfiOfflineStorageError()
      try { tx.abort() } catch { database.close(); reject(failure) }
    }
    try {
      tx = database.transaction(stores, mode)
      tx.oncomplete = () => {
        database.close()
        if (failure) reject(failure)
        else if (outcome) resolve(outcome.value)
        else reject(new RfiOfflineStorageError())
      }
      tx.onabort = () => { database.close(); reject(failure ?? new RfiOfflineStorageError()) }
      tx.onerror = () => fail(tx.error)
      const drafts = tx.objectStore(RFI_DRAFT_STORE_NAME)
      const pending = tx.objectStore(RFI_PENDING_STORE_NAME)
      const draftRequest = drafts.get(key)
      const pendingRequest = pending.get(key)
      const revisionRequest = drafts.get(revisionKey)
      let ready = 0
      const loaded = () => {
        if (failure) return
        try {
          if (++ready !== 3) return
          const draft = checkedDraft(draftRequest.result, key)
          const command = checkedPending(pendingRequest.result, key)
          let revision = 0
          if (revisionRequest.result !== undefined) {
            const parsed = revisionSchema.safeParse(revisionRequest.result)
            if (!parsed.success || parsed.data.scopeKey !== revisionKey) throw new RfiOfflineStorageError('Stored RFI revision is invalid. Saved data was preserved.')
            revision = parsed.data.revision
          }
          outcome = { value: work({ draft, pending: command, revision }, drafts, pending) }
        } catch (error) { fail(error) }
      }
      draftRequest.onsuccess = loaded
      pendingRequest.onsuccess = loaded
      revisionRequest.onsuccess = loaded
    } catch (error) {
      // If transaction creation succeeded, abort any partially queued writes.
      fail(error)
    }
  })
}

function advanceRevision(drafts: IDBObjectStore, key: string, revision: number): number {
  const next = integer.parse(revision + 1)
  drafts.put({ scopeKey: `revision|${key}`, revision: next })
  return next
}
export async function loadRfiSnapshot(scope: RfiScope): Promise<RfiSnapshot> {
  return withSnapshot(scope, 'readonly', snapshot => snapshot)
}
export async function saveRfiDraft(scope: RfiScope, input: RfiDraftInput, expectedRevision: number): Promise<number> {
  const fields = draftInputSchema.parse(input)
  integer.parse(expectedRevision)
  const key = rfiScopeKey(scope)
  const draft = draftSchema.parse({ scope, scopeKey: key, ...fields, updatedAt: Date.now() })
  return withSnapshot(scope, 'readwrite', (snapshot, drafts) => {
    if (snapshot.pending || snapshot.revision !== expectedRevision) throw new RfiPendingConflictError()
    drafts.put(draft)
    return advanceRevision(drafts, key, snapshot.revision)
  })
}
export async function putRfiPending(envelope: RfiPendingEnvelope, expectedRevision: number): Promise<number> {
  const exact = validateEnvelope(envelope)
  integer.parse(expectedRevision)
  return withSnapshot(exact.scope, 'readwrite', (snapshot, drafts, pending) => {
    if (snapshot.pending) {
      if (!samePending(snapshot.pending, exact)) throw new RfiPendingConflictError()
      return snapshot.revision
    }
    if (snapshot.revision !== expectedRevision) throw new RfiPendingConflictError()
    if (snapshot.draft && (snapshot.draft.description.trim() !== exact.description || snapshot.draft.priority !== exact.priority)) {
      throw new RfiPendingConflictError()
    }
    pending.put(exact)
    if (snapshot.draft) drafts.delete(exact.scopeKey)
    return advanceRevision(drafts, exact.scopeKey, snapshot.revision)
  })
}
export async function deleteRfiPending(envelope: RfiPendingEnvelope): Promise<number> {
  const exact = validateEnvelope(envelope)
  return withSnapshot(exact.scope, 'readwrite', (snapshot, drafts, pending) => {
    if (!snapshot.pending) return snapshot.revision
    if (!samePending(snapshot.pending, exact)) throw new RfiPendingConflictError()
    pending.delete(exact.scopeKey)
    return advanceRevision(drafts, exact.scopeKey, snapshot.revision)
  })
}
