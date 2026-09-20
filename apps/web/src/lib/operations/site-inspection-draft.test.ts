import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  SiteInspectionDraftConflictError,
  SiteInspectionDraftStorageError,
  SiteInspectionDraftValidationError,
  clearSiteInspectionDraft,
  loadSiteInspectionDraft,
  saveSiteInspectionDraft,
  siteInspectionDraftScopeKey,
  siteInspectionDraftPhotoToFile,
  type SiteInspectionDraft,
  type SiteInspectionDraftScope,
} from './site-inspection-draft'

type RequestHandler = (() => void) | null

// These partial IndexedDB doubles expose only the methods the store uses.
// Real browser transaction behavior is covered separately by Playwright.

class FakeRequest<T = unknown> {
  result!: T
  error: Error | null = null
  onsuccess: RequestHandler = null
  onerror: RequestHandler = null
}

class FakeDatabaseState {
  records = new Map<string, unknown>()
  hasStore = false
}

class FakeTransaction {
  readonly mode: IDBTransactionMode
  readonly records: Map<string, unknown>
  readonly failCommit: boolean
  error: Error | null = null
  onabort: RequestHandler = null
  oncomplete: RequestHandler = null
  onerror: RequestHandler = null

  private pending = 0
  private completionQueued = false
  private aborted = false

  constructor(
    private readonly database: FakeDatabaseState,
    mode: IDBTransactionMode,
    failCommit: boolean,
  ) {
    this.mode = mode
    this.failCommit = failCommit
    this.records = mode === 'readwrite'
      ? new Map(database.records)
      : database.records
  }

  objectStore(): IDBObjectStore {
    return new FakeObjectStore(this).asObjectStore()
  }

  enqueue<T>(work: (request: FakeRequest<T>) => void): IDBRequest<T> {
    const request = new FakeRequest<T>()
    this.pending += 1
    queueMicrotask(() => {
      if (this.aborted) {
        this.pending -= 1
        return
      }
      try {
        work(request)
        request.onsuccess?.()
      } catch (error) {
        request.error = error instanceof Error ? error : new Error('IndexedDB request failed')
        request.onerror?.()
        this.fail(request.error)
      } finally {
        this.pending -= 1
        this.maybeComplete()
      }
    })
    return request as unknown as IDBRequest<T>
  }

  abort(): void {
    if (this.aborted) return
    this.aborted = true
    this.pending = 0
    queueMicrotask(() => this.onabort?.())
  }

  private fail(error: Error): void {
    this.error = error
    this.onerror?.()
    this.abort()
  }

  private maybeComplete(): void {
    if (this.pending !== 0 || this.completionQueued || this.aborted) return
    this.completionQueued = true
    queueMicrotask(() => {
      if (this.aborted) return
      if (this.failCommit) {
        this.error = new Error('IndexedDB commit failed')
        this.abort()
        return
      }
      if (this.mode === 'readwrite') {
        this.database.records = new Map(this.records)
      }
      this.oncomplete?.()
    })
  }
}

class FakeObjectStore {
  constructor(private readonly transaction: FakeTransaction) {}

  get(key: IDBValidKey): IDBRequest<unknown> {
    return this.transaction.enqueue((request) => {
      request.result = this.transaction.records.get(String(key))
    })
  }

  put(value: unknown, key: IDBValidKey): IDBRequest<unknown> {
    return this.transaction.enqueue((request) => {
      this.transaction.records.set(String(key), structuredClone(value))
      request.result = key
    })
  }

  delete(key: IDBValidKey): IDBRequest<undefined> {
    return this.transaction.enqueue((request) => {
      this.transaction.records.delete(String(key))
      request.result = undefined
    })
  }

  asObjectStore(): IDBObjectStore {
    return {
      get: this.get.bind(this),
      put: this.put.bind(this),
      delete: this.delete.bind(this),
    } as unknown as IDBObjectStore
  }
}

class FakeDatabase {
  onversionchange: (() => void) | null = null
  readonly objectStoreNames: DOMStringList = {
    0: 'drafts',
    contains: (name: string) => name === 'drafts' && this.state.hasStore,
    item: (index: number) => index === 0 ? 'drafts' : null,
    length: 1,
    [Symbol.iterator]: () => ['drafts'][Symbol.iterator](),
  }

  constructor(
    private readonly state: FakeDatabaseState,
    private readonly owner: FakeIndexedDb,
  ) {}

  createObjectStore(): IDBObjectStore {
    this.state.hasStore = true
    return new FakeObjectStore(
      new FakeTransaction(this.state, 'versionchange', false),
    ).asObjectStore()
  }

  transaction(
    _storeNames: string | string[],
    mode: IDBTransactionMode,
  ): IDBTransaction {
    const failCommit = mode === 'readwrite' && this.owner.failNextCommit
    if (failCommit) this.owner.failNextCommit = false
    return new FakeTransaction(this.state, mode, failCommit) as unknown as IDBTransaction
  }

  close(): void {}
}

class FakeOpenRequest {
  result!: IDBDatabase
  error: Error | null = null
  onupgradeneeded: RequestHandler = null
  onblocked: RequestHandler = null
  onsuccess: RequestHandler = null
  onerror: RequestHandler = null
}

class FakeIndexedDb {
  private state = new FakeDatabaseState()
  failNextCommit = false
  blockNextOpen = false

  open(): IDBOpenDBRequest {
    const request = new FakeOpenRequest()
    queueMicrotask(() => {
      if (this.blockNextOpen) {
        this.blockNextOpen = false
        request.onblocked?.()
        return
      }
      const database = new FakeDatabase(this.state, this)
      request.result = database as unknown as IDBDatabase
      if (!this.state.hasStore) {
        request.onupgradeneeded?.()
      }
      request.onsuccess?.()
    })
    return request as unknown as IDBOpenDBRequest
  }

  seed(key: string, value: unknown): void {
    this.state.hasStore = true
    this.state.records.set(key, structuredClone(value))
  }

  has(key: string): boolean {
    return this.state.records.has(key)
  }
}

let fakeIndexedDb = new FakeIndexedDb()

const scope: SiteInspectionDraftScope = {
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  opportunityId: '33333333-3333-4333-8333-333333333333',
}

const photo = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'front.jpg',
  type: 'image/jpeg',
  size: 3,
  lastModified: 1_700_000_000_000,
  dataUrl: 'data:image/jpeg;base64,YWJj',
  documentId: '55555555-5555-4555-8555-555555555555',
}

const draft: Omit<SiteInspectionDraft, 'updatedAt'> = {
  fields: {
    site_address: 'Makati City',
    floor_area_sqm: '120.50',
    landlord_contact: 'Jane Doe',
    as_built_available: 'no',
    expected_start_date: '2026-09-13',
    weather: 'Clear',
    accessibility_notes: 'Service elevator available',
    observations: 'Existing ceiling to verify',
  },
  photos: [photo],
  uploadedPhotoIds: [photo.documentId],
  clientSubmissionId: '66666666-6666-4666-8666-666666666666',
}

function installIndexedDb(): void {
  vi.stubGlobal('indexedDB', fakeIndexedDb)
  vi.stubGlobal('window', { indexedDB: fakeIndexedDb })
}

describe('site inspection draft storage', () => {
  beforeEach(() => {
    fakeIndexedDb = new FakeIndexedDb()
    installIndexedDb()
  })

  afterEach(() => {
    fakeIndexedDb.failNextCommit = false
    fakeIndexedDb.blockNextOpen = false
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('normalizes a validated actor/tenant/opportunity scope key', () => {
    expect(
      siteInspectionDraftScopeKey({
        actorId: scope.actorId.toUpperCase(),
        tenantId: scope.tenantId.toUpperCase(),
        opportunityId: scope.opportunityId.toUpperCase(),
      }),
    ).toBe(`${scope.actorId}|${scope.tenantId}|${scope.opportunityId}`)
    expect(() => siteInspectionDraftScopeKey({ ...scope, actorId: 'not-a-uuid' })).toThrow(
      SiteInspectionDraftValidationError,
    )
  })

  it('round-trips a scoped draft and retains a revision after clear', async () => {
    const firstRevision = await saveSiteInspectionDraft(scope, draft, 0)
    expect(firstRevision).toBe(1)

    const saved = await loadSiteInspectionDraft(scope)
    expect(saved.draft).toMatchObject(draft)
    expect(saved.draft?.updatedAt).toEqual(expect.any(String))
    expect(saved.revision).toBe(1)

    expect(await clearSiteInspectionDraft(scope, 1)).toBe(2)
    await expect(loadSiteInspectionDraft(scope)).resolves.toEqual({
      draft: null,
      revision: 2,
    })
    expect(await clearSiteInspectionDraft(scope, 2)).toBe(2)
  })

  it('rejects stale saves and stale draft recreation after clear', async () => {
    await expect(saveSiteInspectionDraft(scope, draft, 0)).resolves.toBe(1)
    await expect(saveSiteInspectionDraft(scope, draft, 0)).rejects.toBeInstanceOf(
      SiteInspectionDraftConflictError,
    )
    await expect(clearSiteInspectionDraft(scope, 1)).resolves.toBe(2)
    await expect(saveSiteInspectionDraft(scope, draft, 1)).rejects.toBeInstanceOf(
      SiteInspectionDraftConflictError,
    )
    await expect(loadSiteInspectionDraft(scope)).resolves.toEqual({ draft: null, revision: 2 })
  })

  it('does not read or remove an opportunity-only legacy record', async () => {
    const legacyKey = scope.opportunityId
    fakeIndexedDb.seed(legacyKey, {
      fields: draft.fields,
      photos: draft.photos,
      uploadedPhotoIds: draft.uploadedPhotoIds,
      clientSubmissionId: draft.clientSubmissionId,
      updatedAt: '2026-09-13T00:00:00.000Z',
    })

    await expect(loadSiteInspectionDraft(scope)).resolves.toEqual({ draft: null, revision: 0 })
    await expect(clearSiteInspectionDraft(scope, 0)).resolves.toBe(0)
    expect(fakeIndexedDb.has(legacyKey)).toBe(true)
  })

  it('preserves an unknown pending command against edits and allows exact retry', async () => {
    const pending = { ...draft, submissionPending: true }
    const first = await saveSiteInspectionDraft(scope, pending, 0)
    await expect(saveSiteInspectionDraft(scope, {
      ...pending, fields: { ...draft.fields, observations: 'Changed after unknown dispatch' },
    }, first)).rejects.toBeInstanceOf(SiteInspectionDraftConflictError)
    const second = await saveSiteInspectionDraft(scope, pending, first)
    expect((await loadSiteInspectionDraft(scope)).draft).toMatchObject(pending)
    // The caller may unlock an unchanged command only after a known rejection.
    await expect(saveSiteInspectionDraft(scope, { ...pending, submissionPending: false }, second)).resolves.toBe(second + 1)
  })

  it('does not load a valid payload whose embedded owner differs from its key', async () => {
    fakeIndexedDb.seed(siteInspectionDraftScopeKey(scope), {
      scope: { ...scope, actorId: '77777777-7777-4777-8777-777777777777' },
      revision: 1, draft: { ...draft, updatedAt: '2026-09-13T00:00:00.000Z' },
    })
    await expect(loadSiteInspectionDraft(scope)).rejects.toMatchObject({ code: 'INVALID_RECORD' })
  })

  it('rejects corrupt scoped records instead of treating them as empty', async () => {
    fakeIndexedDb.seed(siteInspectionDraftScopeKey(scope), {
      scope,
      scopeKey: siteInspectionDraftScopeKey(scope),
      fields: draft.fields,
      photos: [{ ...photo, size: Number.NaN }],
      uploadedPhotoIds: draft.uploadedPhotoIds,
      clientSubmissionId: draft.clientSubmissionId,
      updatedAt: '2026-09-13T00:00:00.000Z',
    })

    await expect(loadSiteInspectionDraft(scope)).rejects.toBeInstanceOf(
      SiteInspectionDraftStorageError,
    )
  })

  it('validates scope, fields, identifiers, image data and bounded photo payloads', async () => {
    await expect(
      saveSiteInspectionDraft({ ...scope, tenantId: 'invalid' }, draft, 0),
    ).rejects.toBeInstanceOf(SiteInspectionDraftValidationError)
    await expect(
      saveSiteInspectionDraft(scope, { ...draft, photos: Array(11).fill(photo) }, 0),
    ).rejects.toBeInstanceOf(SiteInspectionDraftValidationError)
    await expect(
      saveSiteInspectionDraft(
        scope,
        { ...draft, photos: [{ ...photo, size: 15 * 1024 * 1024 + 1 }] },
        0,
      ),
    ).rejects.toBeInstanceOf(SiteInspectionDraftValidationError)
    await expect(
      saveSiteInspectionDraft(
        scope,
        { ...draft, photos: [{ ...photo, dataUrl: 'https://example.test/photo.jpg' }] },
        0,
      ),
    ).rejects.toBeInstanceOf(SiteInspectionDraftValidationError)
    await expect(
      saveSiteInspectionDraft(
        scope,
        { ...draft, photos: [{ ...photo, size: Number.NaN }] },
        0,
      ),
    ).rejects.toBeInstanceOf(SiteInspectionDraftValidationError)
  })

  it('waits for transaction completion and rejects a commit failure', async () => {
    fakeIndexedDb.failNextCommit = true
    await expect(saveSiteInspectionDraft(scope, draft, 0)).rejects.toBeInstanceOf(
      SiteInspectionDraftStorageError,
    )
    await expect(loadSiteInspectionDraft(scope)).resolves.toEqual({ draft: null, revision: 0 })
  })

  it('rejects blocked database opens with an actionable typed error', async () => {
    fakeIndexedDb.blockNextOpen = true
    await expect(loadSiteInspectionDraft(scope)).rejects.toMatchObject({
      name: 'SiteInspectionDraftStorageError',
      message: expect.stringContaining('blocked'),
    })
  })

  it('rejects unavailable storage rather than returning an empty draft', async () => {
    vi.stubGlobal('window', {})
    await expect(loadSiteInspectionDraft(scope)).rejects.toBeInstanceOf(
      SiteInspectionDraftStorageError,
    )
  })

  it('converts only validated image data URLs without fetching arbitrary URLs', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network must not be used'))
    vi.stubGlobal('fetch', fetchMock)

    const file = await siteInspectionDraftPhotoToFile(photo)
    expect(file.name).toBe(photo.name)
    expect(file.type).toBe(photo.type)
    expect(await file.arrayBuffer()).toEqual(new TextEncoder().encode('abc').buffer)
    expect(fetchMock).not.toHaveBeenCalled()

    await expect(
      siteInspectionDraftPhotoToFile({ ...photo, dataUrl: 'https://example.test/photo.jpg' }),
    ).rejects.toBeInstanceOf(SiteInspectionDraftValidationError)
  })
})
