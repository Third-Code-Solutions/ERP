import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { auditLog, db, documents, progressClaimDocuments, progressClaims, projects, tenants, users } from '@third-code-erp/database'
import { and, asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { ClaimDocumentService } from '../src/documents/claim-document.service'
import { DocumentDeleteService } from '../src/documents/document-delete.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
    throw new Error('Claim attachment proof requires a loopback disposable PostgreSQL DATABASE_URL')
  }
})

// UUID-isolated committed synthetic fixtures enable independent connections.
// Their append-only audit records are retained until the disposable lane resets.
async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID(), claimId = randomUUID(), documentId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `claim-${userId}@integration.test` }
  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Claim attachment integration', slug: `claim-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Claim integration', role: 'admin' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Claim project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: userId })
    await tx.insert(progressClaims).values({ id: claimId, tenant_id: tenantId, project_id: projectId, claim_number: 'PC-1', milestone_pct: 10, created_by: userId })
    await tx.insert(documents).values({ id: documentId, tenant_id: tenantId, project_id: projectId, uploaded_by: userId, document_type: 'pdf', file_name: 'Evidence.pdf', storage_path: `${tenantId}/${projectId}/${documentId}.pdf`, mime_type: 'application/pdf', size_bytes: 10 })
  })
  const audit = new AuditService(), database = new DatabaseService()
  const service = new ClaimDocumentService(database, audit)
  const deletion = new DocumentDeleteService(new ConfigService({ ERP_DOCUMENT_DELETE_WRITES_ENABLED: true, ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: [tenantId] }), database, audit)
  const command = { clientRequestId: randomUUID(), documentId, kind: 'photo' as const, caption: 'Evidence' }
  return { tenantId, userId, projectId, claimId, documentId, principal, audit, service, deletion, command }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function snapshot(context: Fixture) {
  const attachments = await db.select().from(progressClaimDocuments).where(eq(progressClaimDocuments.tenant_id, context.tenantId)).orderBy(asc(progressClaimDocuments.id))
  const audits = await db.select().from(auditLog).where(eq(auditLog.tenant_id, context.tenantId)).orderBy(asc(auditLog.id))
  return { attachments, audits }
}

function signal() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

async function waitForSignal(promise: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Concurrent claim writer did not reach its barrier')), 5000)
    })])
  } finally { clearTimeout(timer) }
}

async function blockedQuery(waiter: number, blocker: number): Promise<string> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const [row] = await db.execute<{ blocked: boolean; query: string }>(sql`
      select ${blocker}::int = any(pg_blocking_pids(pid)) as blocked, query
      from pg_stat_activity where pid = ${waiter}
    `)
    if (row?.blocked) return row.query
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Expected PostgreSQL row-lock blocking was not observed')
}

suite('Claim attachment PostgreSQL authority', () => {
  it('creates once, preserves terminal replay, and rejects changed replay without extra audit', async () => {
    const f = await fixture()
    expect(await f.service.attach(f.claimId, f.command, f.principal)).toMatchObject({ attachmentId: f.command.clientRequestId, changed: true })
    await db.update(progressClaims).set({ status: 'paid' }).where(eq(progressClaims.id, f.claimId))
    const before = await snapshot(f)
    expect(before.attachments).toHaveLength(1)
    expect(before.audits.filter((row) => row.entity_type === 'progress_claim_document' && row.entity_id === f.command.clientRequestId)).toHaveLength(1)
    expect(await f.service.attach(f.claimId, f.command, f.principal)).toMatchObject({ changed: false })
    await expect(f.service.attach(f.claimId, { ...f.command, caption: 'Changed' }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(f)).toEqual(before)
  })

  it('rejects foreign claim/document and same-tenant wrong-project evidence without writes', async () => {
    const f = await fixture(), foreign = await fixture()
    const otherProject = randomUUID(), otherDocument = randomUUID()
    await db.insert(projects).values({ id: otherProject, tenant_id: f.tenantId, name: 'Other project', client: 'Synthetic', project_type: 'mep' })
    await db.insert(documents).values({ id: otherDocument, tenant_id: f.tenantId, project_id: otherProject, document_type: 'pdf', file_name: 'Other.pdf', storage_path: `${f.tenantId}/${otherProject}/other.pdf`, mime_type: 'application/pdf', size_bytes: 10 })
    const before = await snapshot(f), foreignBefore = await snapshot(foreign)
    await expect(f.service.attach(foreign.claimId, f.command, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    for (const documentId of [foreign.documentId, otherDocument]) {
      await expect(f.service.attach(f.claimId, { ...f.command, documentId }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    }
    expect(await snapshot(f)).toEqual(before)
    expect(await snapshot(foreign)).toEqual(foreignBefore)
  })

  it.each(['paid', 'rejected', 'cancelled'] as const)('rejects new attachments after %s', async (status) => {
    const f = await fixture()
    await db.update(progressClaims).set({ status }).where(eq(progressClaims.id, f.claimId))
    const before = await snapshot(f)
    await expect(f.service.attach(f.claimId, f.command, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(f)).toEqual(before)
  })

  it('rejects a persisted role revocation and retired project', async () => {
    const f = await fixture()
    await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    await expect(f.service.attach(f.claimId, f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, f.userId))
    await db.update(projects).set({ deleted_at: new Date(), deleted_by: f.userId, deletion_reason: 'Synthetic retirement proof' }).where(eq(projects.id, f.projectId))
    const before = await snapshot(f)
    await expect(f.service.attach(f.claimId, f.command, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    expect(await snapshot(f)).toEqual(before)
  })

  it('rolls back attachment and automatic audit when semantic audit fails', async () => {
    const f = await fixture(), before = await snapshot(f)
    const fault = vi.spyOn(f.audit, 'writeSemantic').mockRejectedValueOnce(new Error('Synthetic audit failure'))
    await expect(f.service.attach(f.claimId, f.command, f.principal)).rejects.toThrow('Synthetic audit failure')
    fault.mockRestore()
    expect(await snapshot(f)).toEqual(before)
    expect(await f.service.attach(f.claimId, f.command, f.principal)).toMatchObject({ changed: true })
  })

  it('serializes identical retries on distinct PostgreSQL connections', async () => {
    const f = await fixture()
    const original = f.audit.stampActor.bind(f.audit)
    const pids = new Set<number>()
    let release = () => {}
    const ready = new Promise<void>((resolve) => { release = resolve })
    const barrier = vi.spyOn(f.audit, 'stampActor').mockImplementation(async (tx, actor) => {
      await original(tx, actor)
      const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      pids.add(row!.pid)
      if (pids.size === 2) release()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([ready, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Concurrent claim transactions did not start')), 5000) })])
      } finally { clearTimeout(timer) }
    })
    const results = await Promise.all([f.service.attach(f.claimId, f.command, f.principal), f.service.attach(f.claimId, f.command, f.principal)])
    barrier.mockRestore()
    expect(pids.size).toBe(2)
    expect(results.map((result) => result.changed).sort()).toEqual([false, true])
    const after = await snapshot(f)
    expect(after.attachments).toHaveLength(1)
    expect(after.audits.filter((row) => row.entity_type === 'progress_claim_document')).toHaveLength(1)
  })

  it('does not let document deletion erase committed claim evidence or retry identity', async () => {
    const f = await fixture()
    await f.service.attach(f.claimId, f.command, f.principal)
    const before = await snapshot(f)
    await expect(f.deletion.delete(f.documentId, f.principal, randomUUID())).rejects.toThrow('Document is attached to a claim and cannot be deleted')
    expect(await snapshot(f)).toEqual(before)
    expect(await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, f.documentId), eq(documents.tenant_id, f.tenantId)))).toHaveLength(1)
  })

  it.each(['delete', 'terminal'] as const)('serializes attachment against a concurrent %s writer on a distinct connection', async (writer) => {
    const f = await fixture()
    const otherUser = randomUUID()
    await db.insert(users).values({ id: otherUser, tenant_id: f.tenantId, email: `${otherUser}@integration.test`, full_name: 'Second claim operator', role: 'admin' })
    const otherPrincipal = { ...f.principal, userId: otherUser, email: `${otherUser}@integration.test` }
    const entered = signal(), release = signal(), writerStarted = signal()
    let attachmentPid = 0, writerPid = 0
    const originalAudit = f.audit.writeSemantic.bind(f.audit)
    const hold = vi.spyOn(f.audit, 'writeSemantic').mockImplementation(async (tx, params) => {
      if (params.entityType === 'progress_claim_document') {
        const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
        attachmentPid = backend!.pid
        entered.resolve()
        await release.promise
      }
      await originalAudit(tx, params)
    })
    const attachment = f.service.attach(f.claimId, f.command, f.principal)
    // Attach a rejection handler immediately so a failed fixture cannot produce
    // an unhandled promise while the synchronization assertions are running.
    const attached = attachment.then((value) => ({ value }), (error: unknown) => ({ error }))
    let timer: ReturnType<typeof setTimeout> | undefined
    let competing: Promise<unknown> | undefined
    try {
      await Promise.race([entered.promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Attachment did not reach audit barrier')), 5000) })])
      clearTimeout(timer)
      if (writer === 'delete') {
        const originalStamp = f.audit.stampActor.bind(f.audit)
        vi.spyOn(f.audit, 'stampActor').mockImplementation(async (tx, actor) => {
          await originalStamp(tx, actor)
          const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
          writerPid = backend!.pid
          writerStarted.resolve()
        })
        competing = f.deletion.delete(f.documentId, otherPrincipal, randomUUID()).then((value) => ({ value }), (error: unknown) => ({ error }))
      } else {
        competing = db.transaction(async (tx) => {
          const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
          writerPid = backend!.pid
          writerStarted.resolve()
          await tx.update(progressClaims).set({ status: 'paid' }).where(and(eq(progressClaims.id, f.claimId), eq(progressClaims.tenant_id, f.tenantId)))
        }).then(() => ({ value: true }), (error: unknown) => ({ error }))
      }
      await waitForSignal(writerStarted.promise)
      expect(writerPid).not.toBe(attachmentPid)
      const waitingSql = await blockedQuery(writerPid, attachmentPid)
      // The deletion request's automatic audit may wait on the attachment's
      // tenant audit lock before deletion reaches the document row lock. Both
      // serialize correctly; prove the blocker and committed outcome instead
      // of requiring a particular internal query to be the first waiter.
      if (writer === 'terminal') expect(waitingSql).toContain('"progress_claims"')
      release.resolve()
      expect(await attached).toMatchObject({ value: { changed: true } })
      if (writer === 'delete') {
        expect(await competing).toMatchObject({ error: expect.any(ConflictException) })
        expect(await db.select({ id: documents.id }).from(documents).where(eq(documents.id, f.documentId))).toHaveLength(1)
      } else {
        expect(await competing).toEqual({ value: true })
        await expect(f.service.attach(f.claimId, { ...f.command, clientRequestId: randomUUID() }, f.principal)).rejects.toBeInstanceOf(ConflictException)
        expect(await f.service.attach(f.claimId, f.command, f.principal)).toMatchObject({ changed: false })
      }
      expect((await snapshot(f)).attachments).toHaveLength(1)
    } finally {
      clearTimeout(timer)
      release.resolve()
      await attached
      await competing
      hold.mockRestore()
      vi.mocked(f.audit.stampActor).mockRestore?.()
    }
  }, 15000)

  it('preserves deletion of an unreferenced document', async () => {
    const f = await fixture()
    expect(await f.deletion.delete(f.documentId, f.principal, randomUUID())).toMatchObject({ documentId: f.documentId, status: 'deleted' })
    await expect(f.service.attach(f.claimId, f.command, f.principal)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('returns a deliberate retry conflict instead of deadlocking against reverse deletion lock ordering', async () => {
    const f = await fixture()
    const otherUser = randomUUID()
    await db.insert(users).values({ id: otherUser, tenant_id: f.tenantId, email: `${otherUser}@integration.test`, full_name: 'Reverse race operator', role: 'admin' })
    const otherPrincipal = { ...f.principal, userId: otherUser, email: `${otherUser}@integration.test` }
    const documentLocked = signal(), releaseAttachment = signal(), deletionStarted = signal()
    let attachmentPid = 0, deletionPid = 0
    const originalStamp = f.audit.stampActor.bind(f.audit)
    const stamp = vi.spyOn(f.audit, 'stampActor').mockImplementation(async (tx, actor) => {
      await originalStamp(tx, actor)
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      if (actor.userId === f.userId) attachmentPid = backend!.pid
      else { deletionPid = backend!.pid; deletionStarted.resolve() }
    })
    // Pause after the real document SELECT FOR SHARE resolves, before INSERT.
    // All queries, locks, triggers and transactions remain the production ones.
    function pauseDocumentQuery<T extends object>(query: T, readsDocument = false): T {
      return new Proxy(query, {
        get(target, property) {
          const value: unknown = Reflect.get(target, property, target)
          if (typeof value !== 'function') return value
          return (...args: unknown[]) => {
            const result: unknown = Reflect.apply(value, target, args)
            if (property === 'for' && readsDocument) {
              return Promise.resolve(result).then(async (rows) => {
                documentLocked.resolve()
                await releaseAttachment.promise
                return rows
              })
            }
            if (result && typeof result === 'object' && ['from', 'where', 'limit'].includes(String(property))) {
              return pauseDocumentQuery(result, readsDocument || (property === 'from' && args[0] === documents))
            }
            return result
          }
        },
      })
    }
    const database = new Proxy(new DatabaseService(), {
      get(target, property) {
        if (property !== 'client') return Reflect.get(target, property, target)
        return new Proxy(target.client, {
          get(client, method) {
            if (method !== 'transaction') return Reflect.get(client, method, client)
            return (callback: (tx: DatabaseTransaction) => Promise<unknown>) => client.transaction(async (tx) => callback(new Proxy(tx, {
              get(transaction, operation) {
                if (operation !== 'select') return Reflect.get(transaction, operation, transaction)
                return (...args: unknown[]) => pauseDocumentQuery(Reflect.apply(transaction.select, transaction, args))
              },
            })))
          },
        })
      },
    })
    const service = new ClaimDocumentService(database, f.audit)
    const attached = service.attach(f.claimId, f.command, f.principal).then((value) => ({ value }), (error: unknown) => ({ error }))
    let deleted: Promise<{ value: unknown } | { error: unknown }> | undefined
    try {
      await waitForSignal(documentLocked.promise)
      deleted = f.deletion.delete(f.documentId, otherPrincipal, randomUUID()).then((value) => ({ value }), (error: unknown) => ({ error }))
      await waitForSignal(deletionStarted.promise)
      expect(deletionPid).not.toBe(attachmentPid)
      expect(await blockedQuery(deletionPid, attachmentPid)).toContain('"documents"')
      releaseAttachment.resolve()
      const outcomes = await Promise.all([attached, deleted])
      expect(outcomes[0]).toMatchObject({ error: expect.any(ConflictException) })
      expect(outcomes[0]).toMatchObject({ error: { message: 'Another update is in progress. Retry with the same request ID.' } })
      expect(outcomes[1]).toMatchObject({ value: { documentId: f.documentId, status: 'deleted' } })
      const after = await snapshot(f)
      expect(after.attachments).toHaveLength(0)
      expect(await db.select({ id: documents.id }).from(documents).where(eq(documents.id, f.documentId))).toHaveLength(0)
      expect(after.audits.filter((row) => row.entity_type === 'progress_claim_document')).toHaveLength(0)
      expect(after.audits.filter((row) => row.entity_type === 'progress_claim_documents')).toHaveLength(0)
      for (let index = 1; index < after.audits.length; index++) {
        expect(after.audits[index]!.prev_hash).toBe(after.audits[index - 1]!.hash)
      }
      await expect(f.service.attach(f.claimId, f.command, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    } finally {
      releaseAttachment.resolve()
      await attached
      await deleted
      stamp.mockRestore()
    }
  }, 15000)

  it('leaves no partial effects when the tenant audit chain is busy and succeeds on the same request after release', async () => {
    const f = await fixture(), locked = signal(), release = signal()
    const before = await snapshot(f)
    const blocker = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'audit_log:' + f.tenantId}, 0))`)
      locked.resolve()
      await release.promise
    })
    try {
      await waitForSignal(locked.promise)
      await expect(f.service.attach(f.claimId, f.command, f.principal)).rejects.toThrow('Another update is in progress. Retry with the same request ID.')
      expect(await snapshot(f)).toEqual(before)
    } finally { release.resolve(); await blocker }
    expect(await f.service.attach(f.claimId, f.command, f.principal)).toMatchObject({ changed: true })
    expect(await f.service.attach(f.claimId, f.command, f.principal)).toMatchObject({ changed: false })
    const after = await snapshot(f)
    expect(after.attachments).toHaveLength(1)
    expect(after.audits.filter((row) => row.entity_type === 'progress_claim_document')).toHaveLength(1)
  })
})
