import { z } from 'zod'

const uuid = z.string().uuid().transform((value) => value.toLowerCase())
const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const scopeSchema = z.object({ actorId: uuid, tenantId: uuid, opportunityId: uuid }).strict()
const fieldsSchema = z.object({
  site_address: z.string().max(20000), floor_area_sqm: z.string().max(20000),
  landlord_contact: z.string().max(20000), as_built_available: z.string().max(20000),
  expected_start_date: z.string().max(20000), weather: z.string().max(20000),
  accessibility_notes: z.string().max(20000), observations: z.string().max(20000),
}).strict()
const MAX_PHOTO_BYTES = 15 * 1024 * 1024
const photoSchema = z.object({
  id: uuid, name: z.string().min(1).max(512),
  type: z.string().regex(/^image\/[a-zA-Z0-9.+-]+$/),
  size: z.number().int().positive().max(MAX_PHOTO_BYTES),
  lastModified: revisionSchema,
  dataUrl: z.string().max(4 * Math.ceil(MAX_PHOTO_BYTES / 3) + 256),
  documentId: uuid.optional(),
}).strict().refine((photo) => {
  const prefix = 'data:' + photo.type + ';base64,'
  if (!photo.dataUrl.startsWith(prefix)) return false
  const body = photo.dataUrl.slice(prefix.length)
  if (!body.length || body.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(body)) return false
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  if (body.slice(0, body.length - padding).includes('=')) return false
  return body.length / 4 * 3 - padding === photo.size
}, 'Photo data does not match its declared image bytes')
const draftInputSchema = z.object({
  fields: fieldsSchema, photos: z.array(photoSchema).max(10),
  uploadedPhotoIds: z.array(uuid).max(10), clientSubmissionId: uuid,
  submissionPending: z.boolean().optional(),
}).strict()
const draftSchema = draftInputSchema.extend({ updatedAt: z.string().datetime() })
const recordSchema = z.object({ scope: scopeSchema, revision: revisionSchema, draft: draftSchema.nullable() }).strict()

export type SiteInspectionDraftScope = z.infer<typeof scopeSchema>
export type SiteInspectionDraftFields = z.infer<typeof fieldsSchema>
export type SiteInspectionDraftPhoto = z.infer<typeof photoSchema>
export type SiteInspectionDraft = z.infer<typeof draftSchema>
type DraftSnapshot = { draft: SiteInspectionDraft | null; revision: number }

export class SiteInspectionDraftStorageError extends Error {
  constructor(message = 'Inspection browser storage failed. Keep this page open; the change was not saved.', readonly code: 'UNAVAILABLE' | 'BLOCKED' | 'INVALID_RECORD' | 'FAILED' = 'FAILED') {
    super(message)
    this.name = 'SiteInspectionDraftStorageError'
  }
}
export class SiteInspectionDraftConflictError extends SiteInspectionDraftStorageError {
  constructor() {
    super('The inspection draft changed in another tab. Reload its saved state before continuing.')
    this.name = 'SiteInspectionDraftConflictError'
  }
}
export class SiteInspectionDraftValidationError extends Error {
  constructor() { super('Inspection draft data is invalid. Existing saved evidence was not changed.'); this.name = 'SiteInspectionDraftValidationError' }
}

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new SiteInspectionDraftValidationError()
  return result.data
}

export function siteInspectionDraftScopeKey(scope: SiteInspectionDraftScope): string {
  const valid = validate(scopeSchema, scope)
  return [valid.actorId, valid.tenantId, valid.opportunityId].join('|')
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let failed = false
    const fail = (error: SiteInspectionDraftStorageError) => { failed = true; reject(error) }
    try {
      if (typeof window === 'undefined' || !window.indexedDB) {
        fail(new SiteInspectionDraftStorageError('This browser does not provide inspection draft storage.', 'UNAVAILABLE'))
        return
      }
      const request = window.indexedDB.open('abi-ops-site-inspection', 1)
      request.onupgradeneeded = () => {
        try {
          if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts')
        } catch {
          fail(new SiteInspectionDraftStorageError())
          try { request.transaction?.abort() } catch { /* Late successful handles are closed below. */ }
        }
      }
      request.onblocked = () => fail(new SiteInspectionDraftStorageError('Inspection draft storage is blocked by another tab. Close that tab and retry.', 'BLOCKED'))
      request.onerror = () => fail(new SiteInspectionDraftStorageError())
      request.onsuccess = () => {
        const db = request.result
        if (failed) { db.close(); return }
        db.onversionchange = () => db.close()
        resolve(db)
      }
    } catch { fail(new SiteInspectionDraftStorageError()) }
  })
}

async function withDraft<T>(scope: SiteInspectionDraftScope, mode: IDBTransactionMode, work: (snapshot: DraftSnapshot, store: IDBObjectStore, key: string) => T): Promise<T> {
  const key = siteInspectionDraftScopeKey(scope)
  const db = await openDraftDb()
  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction | undefined
    let failure: Error | undefined
    let result: { value: T } | undefined
    const fail = (error: unknown) => {
      failure ??= error instanceof SiteInspectionDraftStorageError || error instanceof SiteInspectionDraftValidationError ? error : new SiteInspectionDraftStorageError()
      if (transaction) {
        try { transaction.abort() } catch { db.close(); reject(failure) }
      } else { db.close(); reject(failure) }
    }
    try {
      transaction = db.transaction('drafts', mode)
      transaction.oncomplete = () => {
        db.close()
        if (failure) reject(failure)
        else if (result) resolve(result.value)
        else reject(new SiteInspectionDraftStorageError())
      }
      transaction.onabort = () => { db.close(); reject(failure ?? new SiteInspectionDraftStorageError()) }
      transaction.onerror = () => fail(transaction?.error)
      const store = transaction.objectStore('drafts')
      // Deliberately never read/adopt an opportunity-only legacy key.
      const request = store.get(key)
      request.onsuccess = () => {
        try {
          let snapshot: DraftSnapshot = { draft: null, revision: 0 }
          if (request.result !== undefined) {
            const record = recordSchema.safeParse(request.result)
            if (!record.success || siteInspectionDraftScopeKey(record.data.scope) !== key) {
              throw new SiteInspectionDraftStorageError('Stored inspection evidence is invalid. It was preserved and was not submitted.', 'INVALID_RECORD')
            }
            snapshot = { draft: record.data.draft, revision: record.data.revision }
          }
          result = { value: work(snapshot, store, key) }
        } catch (error) { fail(error) }
      }
      request.onerror = () => fail(request.error)
    } catch (error) { fail(error) }
  })
}

export async function loadSiteInspectionDraft(scope: SiteInspectionDraftScope): Promise<DraftSnapshot> {
  return withDraft(scope, 'readonly', (snapshot) => snapshot)
}

export async function saveSiteInspectionDraft(scope: SiteInspectionDraftScope, draft: Omit<SiteInspectionDraft, 'updatedAt'>, expectedRevision: number): Promise<number> {
  const owner = validate(scopeSchema, scope)
  const input = validate(draftInputSchema, draft)
  validate(revisionSchema, expectedRevision)
  return withDraft(owner, 'readwrite', (snapshot, store, key) => {
    if (snapshot.revision !== expectedRevision) throw new SiteInspectionDraftConflictError()
    if (snapshot.draft?.submissionPending) {
      const { updatedAt: _updatedAt, submissionPending: _pending, ...savedCommand } = snapshot.draft
      const { submissionPending: _nextPending, ...nextCommand } = input
      if (JSON.stringify(savedCommand) !== JSON.stringify(nextCommand)) throw new SiteInspectionDraftConflictError()
    }
    const revision = validate(revisionSchema, snapshot.revision + 1)
    store.put({ scope: owner, revision, draft: { ...input, updatedAt: new Date().toISOString() } }, key)
    return revision
  })
}

export async function clearSiteInspectionDraft(scope: SiteInspectionDraftScope, expectedRevision: number): Promise<number> {
  const owner = validate(scopeSchema, scope)
  validate(revisionSchema, expectedRevision)
  return withDraft(owner, 'readwrite', (snapshot, store, key) => {
    if (snapshot.revision !== expectedRevision) throw new SiteInspectionDraftConflictError()
    if (!snapshot.draft) return snapshot.revision
    const revision = validate(revisionSchema, snapshot.revision + 1)
    // A tombstone prevents an old tab from recreating a submitted report.
    store.put({ scope: owner, revision, draft: null }, key)
    return revision
  })
}

export async function fileToSiteInspectionDraftPhoto(file: File): Promise<SiteInspectionDraftPhoto> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new SiteInspectionDraftValidationError())
    reader.onerror = () => reject(new SiteInspectionDraftStorageError('The selected photo could not be read.'))
    reader.readAsDataURL(file)
  })
  return validate(photoSchema, { id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, dataUrl })
}

export async function siteInspectionDraftPhotoToFile(photo: SiteInspectionDraftPhoto): Promise<File> {
  const value = validate(photoSchema, photo)
  const bytes = Uint8Array.from(atob(value.dataUrl.slice(value.dataUrl.indexOf(',') + 1)), (character) => character.charCodeAt(0))
  return new File([bytes], value.name, { type: value.type, lastModified: value.lastModified })
}
