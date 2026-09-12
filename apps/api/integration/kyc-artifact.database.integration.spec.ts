import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { accounts, accountKycArtifacts, auditLog, db, documents, opportunities, projects, tenants, users } from '@third-code-erp/database'
import { and, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService } from '../src/database/database.service'
import { KycArtifactService } from '../src/crm/kyc-artifact.service'
import { DocumentDeleteService } from '../src/documents/document-delete.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
beforeAll(() => {
  if (!expected) return
  if (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('KYC proof requires a loopback disposable PostgreSQL database')
})

async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), accountId = randomUUID(), otherAccountId = randomUUID(), projectId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `${userId}@kyc.test` }
  // Committed synthetic UUID fixtures allow separate connections; audit is retained.
  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name: 'KYC proof', slug: `kyc-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Synthetic', role: 'admin' })
    await tx.insert(accounts).values([{ id: accountId, tenant_id: tenantId, name: 'Account A' }, { id: otherAccountId, tenant_id: tenantId, name: 'Account B' }])
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, account_id: accountId, name: 'Account project', client: 'Synthetic', project_type: 'mep' })
  })
  const audit = new AuditService(), service = new KycArtifactService(new DatabaseService(), audit)
  const command = { clientRequestId: randomUUID(), artifactType: 'other' as const, documentId: null, notes: null }
  return { tenantId, userId, accountId, otherAccountId, projectId, principal, audit, service, command }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function document(f: Fixture, projectId: string | null = f.projectId, opportunityId: string | null = null, name = 'Evidence.pdf'): Promise<string> {
  const id = randomUUID()
  await db.insert(documents).values({ id, tenant_id: f.tenantId, project_id: projectId, opportunity_id: opportunityId, file_name: name, document_type: 'pdf', mime_type: 'application/pdf', size_bytes: 1, storage_path: `${f.tenantId}/${id}` })
  return id
}
async function opportunity(f: Fixture, accountId: string | null, projectId: string | null): Promise<string> {
  const id = randomUUID()
  await db.insert(opportunities).values({ id, tenant_id: f.tenantId, account_id: accountId, project_id: projectId })
  return id
}
async function artifacts(f: Fixture) {
  return db.select().from(accountKycArtifacts).where(eq(accountKycArtifacts.tenant_id, f.tenantId))
}
const query = { q: '', page: 1, limit: 20 }

function signal() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function waitSignal(promise: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('KYC race barrier timeout')), 5000) })]) }
  finally { clearTimeout(timer) }
}
async function waitForBlocker(blocker: number): Promise<number> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const [row] = await db.execute<{ pid: number }>(sql`select pid from pg_stat_activity where datname = current_database() and ${blocker}::int = any(pg_blocking_pids(pid))`)
    if (row) return row.pid
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Expected distinct PostgreSQL waiter was not observed')
}

suite('KYC artifact PostgreSQL authority', () => {
  it('lists and accepts direct project, direct opportunity, and consistent legacy inheritance only', async () => {
    const f = await fixture()
    const direct = await document(f)
    const opportunityOnly = await document(f, null, await opportunity(f, f.accountId, null))
    const inherited = await document(f, null, await opportunity(f, null, f.projectId))
    const conflict = await document(f, f.projectId, await opportunity(f, f.otherAccountId, f.projectId))
    const other = await document(f, null, await opportunity(f, f.otherAccountId, null))
    const [unresolvedProject] = await db.insert(projects).values({ tenant_id: f.tenantId, name: 'No account', client: 'Synthetic', project_type: 'mep' }).returning({ id: projects.id })
    const unresolved = await document(f, unresolvedProject!.id)
    const listed = await f.service.list(f.accountId, query, f.principal)
    expect(listed.rows.map((row) => row.documentId).sort()).toEqual([direct, opportunityOnly, inherited].sort())
    for (const documentId of [direct, opportunityOnly, inherited]) expect(await f.service.create(f.accountId, { ...f.command, clientRequestId: randomUUID(), documentId }, f.principal)).toMatchObject({ changed: true })
    for (const documentId of [conflict, other, unresolved]) await expect(f.service.create(f.accountId, { ...f.command, documentId }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    expect(await artifacts(f)).toHaveLength(3)
  })
  it('uses escaped literal search, exact pagination and independent selected resolution', async () => {
    const f = await fixture(), selected = await document(f, f.projectId, null, '100%_proof.pdf')
    await document(f, f.projectId, null, '100XXproof.pdf')
    expect(await f.service.list(f.accountId, { ...query, q: '%_' }, f.principal)).toMatchObject({ total: 1, rows: [{ documentId: selected }] })
    const result = await f.service.list(f.accountId, { ...query, q: 'missing', selectedDocumentId: selected, page: 2, limit: 1 }, f.principal)
    expect(result).toMatchObject({ rows: [], total: 0, totalPages: 1, selectedDocument: { documentId: selected } })
    const first = await f.service.list(f.accountId, { ...query, limit: 1 }, f.principal)
    const second = await f.service.list(f.accountId, { ...query, limit: 1, page: 2 }, f.principal)
    expect(first.total).toBe(2)
    expect(first.rows[0]!.documentId).not.toBe(second.rows[0]!.documentId)
  })
  it('does not expose another tenant through list, selected or mutation', async () => {
    const f = await fixture(), foreign = await fixture(), foreignDoc = await document(foreign)
    expect(await f.service.list(f.accountId, { ...query, selectedDocumentId: foreignDoc }, f.principal)).toMatchObject({ total: 0, selectedDocument: null })
    await expect(f.service.list(foreign.accountId, query, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(f.service.create(f.accountId, { ...f.command, documentId: foreignDoc }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    expect(await artifacts(f)).toHaveLength(0)
  })
  it.each(['pending', 'approved', 'flagged', 'rejected', 'not_required'] as const)('preserves metadata-only submission in %s', async (kyc_status) => {
    const f = await fixture()
    await db.update(accounts).set({ kyc_status }).where(eq(accounts.id, f.accountId))
    expect(await f.service.create(f.accountId, f.command, f.principal)).toMatchObject({ documentId: null, changed: true })
  })
  it('normalizes exact replay, rejects changed data and retains committed replay after relationship changes', async () => {
    const f = await fixture(), documentId = await document(f)
    const command = { ...f.command, documentId, notes: '  Evidence  ' }
    expect(await f.service.create(f.accountId, command, f.principal)).toMatchObject({ changed: true })
    await db.update(projects).set({ account_id: f.otherAccountId }).where(eq(projects.id, f.projectId))
    expect(await f.service.create(f.accountId, { ...command, notes: 'Evidence' }, f.principal)).toMatchObject({ changed: false })
    await expect(f.service.create(f.accountId, { ...command, notes: 'Changed' }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await artifacts(f)).toHaveLength(1)
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.entity_type, 'account_kyc_artifact'), eq(auditLog.entity_id, command.clientRequestId)))
    expect(audit).toHaveLength(1)
  })
  it('rechecks current capability and active membership for reads and writes', async () => {
    const f = await fixture()
    await db.update(users).set({ role: 'viewer' }).where(eq(users.id, f.userId))
    await expect(f.service.list(f.accountId, query, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(f.service.create(f.accountId, f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    await db.update(users).set({ role: 'admin', account_status: 'suspended', status_reason: 'Synthetic suspension', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(users.id, f.userId))
    await expect(f.service.create(f.accountId, f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await artifacts(f)).toHaveLength(0)
  })
  it('rolls back artifact and automatic audit when semantic audit fails', async () => {
    const f = await fixture()
    const before = await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId))
    vi.spyOn(f.audit, 'writeSemantic').mockRejectedValueOnce(new Error('Synthetic audit failure'))
    await expect(f.service.create(f.accountId, f.command, f.principal)).rejects.toThrow('Synthetic audit failure')
    expect(await artifacts(f)).toHaveLength(0)
    expect(await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId))).toEqual(before)
  })
  it('serializes identical concurrent requests as one artifact and one semantic audit', async () => {
    const f = await fixture()
    const results = await Promise.all([f.service.create(f.accountId, f.command, f.principal), f.service.create(f.accountId, f.command, f.principal)])
    expect(results.map((result) => result.changed).sort()).toEqual([false, true])
    expect(await artifacts(f)).toHaveLength(1)
  })
  it('rejects request reuse across accounts, actors and tenants without revealing the occupying artifact', async () => {
    const f = await fixture(), foreign = await fixture()
    await f.service.create(f.accountId, f.command, f.principal)
    await expect(f.service.create(f.otherAccountId, f.command, f.principal)).rejects.toBeInstanceOf(ConflictException)
    const otherUserId = randomUUID()
    await db.insert(users).values({ id: otherUserId, tenant_id: f.tenantId, role: 'sales', email: `${otherUserId}@kyc.test`, full_name: 'Other author' })
    await expect(f.service.create(f.accountId, f.command, { ...f.principal, userId: otherUserId })).rejects.toBeInstanceOf(ConflictException)
    await expect(foreign.service.create(foreign.accountId, f.command, foreign.principal)).rejects.toThrow('Artifact request identity is unavailable')
    expect(await artifacts(f)).toHaveLength(1)
    expect(await artifacts(foreign)).toHaveLength(0)
  })
  it('denies suspended tenants and unresolved opportunity project inheritance', async () => {
    const f = await fixture()
    const [unresolved] = await db.insert(projects).values({ tenant_id: f.tenantId, name: 'Unresolved', client: 'Synthetic', project_type: 'mep' }).returning({ id: projects.id })
    const documentId = await document(f, null, await opportunity(f, f.accountId, unresolved!.id))
    expect(await f.service.list(f.accountId, query, f.principal)).toMatchObject({ total: 0 })
    await expect(f.service.create(f.accountId, { ...f.command, documentId }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    await db.update(tenants).set({ status: 'suspended', status_reason: 'Synthetic suspension', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(tenants.id, f.tenantId))
    await expect(f.service.list(f.accountId, query, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(f.service.create(f.accountId, f.command, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('rechecks project ownership after waiting for an in-flight reassignment', async () => {
    const f = await fixture(), documentId = await document(f)
    const entered = signal(), release = signal()
    let ownerPid = 0
    const reassigned = db.transaction(async (tx) => {
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      ownerPid = backend!.pid
      await tx.update(projects).set({ account_id: f.otherAccountId }).where(eq(projects.id, f.projectId))
      entered.resolve(); await release.promise
    })
    let result: Promise<unknown> | undefined
    try {
      await waitSignal(entered.promise)
      result = f.service.create(f.accountId, { ...f.command, documentId }, f.principal).then((value) => ({ value }), (error: unknown) => ({ error }))
      expect(await waitForBlocker(ownerPid)).not.toBe(ownerPid)
      release.resolve(); await reassigned
      expect(await result).toMatchObject({ error: expect.any(NotFoundException) })
      expect(await artifacts(f)).toHaveLength(0)
    } finally { release.resolve(); await reassigned; await result }
  }, 15000)
  it('returns deliberate audit contention conflict with no effects and retries the same identity safely', async () => {
    const f = await fixture(), documentId = await document(f)
    const entered = signal(), release = signal()
    const held = db.transaction(async (tx) => {
      expect(await f.audit.tryLockTenantChain(tx, f.tenantId)).toBe(true)
      entered.resolve(); await release.promise
    })
    try {
      await waitSignal(entered.promise)
      await expect(f.service.create(f.accountId, { ...f.command, documentId }, f.principal)).rejects.toThrow('Another update is in progress. Retry with the same request ID.')
      expect(await artifacts(f)).toHaveLength(0)
    } finally { release.resolve(); await held }
    expect(await f.service.create(f.accountId, { ...f.command, documentId }, f.principal)).toMatchObject({ artifactId: f.command.clientRequestId, changed: true })
  })
  it('rejects a document pointer changed between initial read and its final lock', async () => {
    const f = await fixture(), documentId = await document(f)
    const [newProject] = await db.insert(projects).values({ tenant_id: f.tenantId, account_id: f.accountId, name: 'New project', client: 'Synthetic', project_type: 'mep' }).returning({ id: projects.id })
    const entered = signal(), release = signal()
    let projectPid = 0
    const held = db.transaction(async (tx) => {
      await tx.select().from(projects).where(eq(projects.id, f.projectId)).for('update')
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      projectPid = backend!.pid; entered.resolve(); await release.promise
    })
    let result: Promise<unknown> | undefined
    try {
      await waitSignal(entered.promise)
      result = f.service.create(f.accountId, { ...f.command, documentId }, f.principal).then((value) => ({ value }), (error: unknown) => ({ error }))
      expect(await waitForBlocker(projectPid)).not.toBe(projectPid)
      // The observed project waiter proves initial document pointers were read.
      await db.update(documents).set({ project_id: newProject!.id }).where(eq(documents.id, documentId))
      release.resolve(); await held
      expect(await result).toMatchObject({ error: expect.objectContaining({ message: 'Document ownership changed. Retry with the same request ID.' }) })
      expect(await artifacts(f)).toHaveLength(0)
    } finally { release.resolve(); await held; await result }
    expect(await f.service.create(f.accountId, { ...f.command, documentId }, f.principal)).toMatchObject({ changed: true })
  }, 15000)
  it('rejects document deletion after an artifact is committed without losing evidence', async () => {
    const f = await fixture(), documentId = await document(f)
    await f.service.create(f.accountId, { ...f.command, documentId }, f.principal)
    const deletion = new DocumentDeleteService(new ConfigService({ ERP_DOCUMENT_DELETE_WRITES_ENABLED: true, ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: [f.tenantId] }), new DatabaseService(), f.audit)
    const before = await artifacts(f)
    await expect(deletion.delete(documentId, f.principal, randomUUID())).rejects.toThrow('Document is attached to a KYC artifact and cannot be deleted')
    expect(await artifacts(f)).toEqual(before)
    expect(await db.select().from(documents).where(eq(documents.id, documentId))).toHaveLength(1)
  })
  it('serializes concurrent document deletion behind attachment and retains its original pointer', async () => {
    const f = await fixture(), documentId = await document(f)
    const entered = signal(), release = signal()
    let attachPid = 0
    const write = f.audit.writeSemantic.bind(f.audit)
    const hold = vi.spyOn(f.audit, 'writeSemantic').mockImplementation(async (tx, params) => {
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      attachPid = backend!.pid; entered.resolve(); await release.promise; await write(tx, params)
    })
    const created = f.service.create(f.accountId, { ...f.command, documentId }, f.principal).then((value) => ({ value }), (error: unknown) => ({ error }))
    let deleted: Promise<unknown> | undefined
    const deletion = new DocumentDeleteService(new ConfigService({ ERP_DOCUMENT_DELETE_WRITES_ENABLED: true, ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: [f.tenantId] }), new DatabaseService(), new AuditService())
    try {
      await waitSignal(entered.promise)
      deleted = deletion.delete(documentId, f.principal, randomUUID()).then((value) => ({ value }), (error: unknown) => ({ error }))
      expect(await waitForBlocker(attachPid)).not.toBe(attachPid)
      release.resolve()
      expect(await created).toMatchObject({ value: { changed: true } })
      expect(await deleted).toMatchObject({ error: expect.objectContaining({ message: 'Document is attached to a KYC artifact and cannot be deleted' }) })
      expect(await artifacts(f)).toMatchObject([{ id: f.command.clientRequestId, document_id: documentId }])
      expect(await db.select().from(documents).where(eq(documents.id, documentId))).toHaveLength(1)
    } finally { release.resolve(); await created; await deleted; hold.mockRestore() }
  }, 15000)
  it('rejects attachment after a concurrent deletion commits first without artifact or audit residue', async () => {
    const f = await fixture(), documentId = await document(f)
    const entered = signal(), release = signal()
    let deletePid = 0
    const deletionAudit = new AuditService(), write = deletionAudit.writeSemantic.bind(deletionAudit)
    const hold = vi.spyOn(deletionAudit, 'writeSemantic').mockImplementation(async (tx, params) => {
      const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      deletePid = backend!.pid; entered.resolve(); await release.promise; await write(tx, params)
    })
    const deletion = new DocumentDeleteService(new ConfigService({ ERP_DOCUMENT_DELETE_WRITES_ENABLED: true, ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: [f.tenantId] }), new DatabaseService(), deletionAudit)
    const deleted = deletion.delete(documentId, f.principal, randomUUID()).then((value) => ({ value }), (error: unknown) => ({ error }))
    let created: Promise<unknown> | undefined
    try {
      await waitSignal(entered.promise)
      created = f.service.create(f.accountId, { ...f.command, documentId }, f.principal).then((value) => ({ value }), (error: unknown) => ({ error }))
      expect(await waitForBlocker(deletePid)).not.toBe(deletePid)
      release.resolve()
      expect(await deleted).toMatchObject({ value: { status: 'deleted' } })
      expect(await created).toMatchObject({ error: expect.any(NotFoundException) })
      expect(await artifacts(f)).toHaveLength(0)
      expect(await db.select().from(auditLog).where(and(eq(auditLog.tenant_id, f.tenantId), eq(auditLog.entity_id, f.command.clientRequestId)))).toHaveLength(0)
    } finally { release.resolve(); await deleted; await created; hold.mockRestore() }
  }, 15000)
})
