import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { auditLog, db, documents, progressClaims, projects, tenants, users } from '@third-code-erp/database'
import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import { ClaimTransitionService } from '../src/projects/claim-transition.service'

const suite = process.env.ERP_API_INTEGRATION_EXPECTED === '1' ? describe : describe.skip
const service = new ClaimTransitionService(new DatabaseService(), new AuditService())

beforeAll(() => {
  if (process.env.ERP_API_INTEGRATION_EXPECTED !== '1') return
  if (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) {
    throw new Error('Claim transition tests require explicit loopback synthetic database')
  }
})

async function fixture() {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `claim-transition-${userId}@integration.test` }
  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic claim transition tenant', slug: `claim-transition-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, role: 'admin', email: principal.email, full_name: 'Synthetic transition actor' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic transition project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: userId })
    await tx.insert(progressClaims).values({ id: randomUUID(), tenant_id: tenantId, project_id: projectId, claim_number: `PC-${randomUUID().replaceAll('-', '').slice(0, 8)}`, milestone_pct: 25, amount_cents: 10000, status: 'draft', created_by: userId })
  })
  const [claim] = await db.select().from(progressClaims).where(eq(progressClaims.tenant_id, tenantId))
  if (!claim) throw new Error('Synthetic claim fixture was not created')
  return { tenantId, userId, projectId, principal, claim }
}

function command(action: 'submit' | 'reject' | 'certify', extra: Record<string, unknown> = {}) {
  return { action, clientRequestId: randomUUID(), ...extra } as const
}

suite('Claim transition PostgreSQL command authority', () => {
  it('commits a submit receipt and replays it after a later status change', async () => {
    const f = await fixture()
    const input = command('submit')
    const first = await service.transition(f.claim.id, input, f.principal)
    expect(first).toMatchObject({ changed: true, receipt: { claimId: f.claim.id, fromStatus: 'draft', toStatus: 'submitted', action: 'submit' } })
    await db.update(progressClaims).set({ status: 'paid', paid_at: new Date() }).where(eq(progressClaims.id, f.claim.id))
    const before = await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id))
    expect(await service.transition(f.claim.id, input, f.principal)).toEqual({ ...first, changed: false })
    expect(await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id))).toEqual(before)
  })

  it('rejects a reused request identity with a different payload', async () => {
    const f = await fixture()
    const input = command('submit')
    await service.transition(f.claim.id, input, f.principal)
    await expect(service.transition(f.claim.id, { ...input, action: 'reject', reason: 'Changed intent' }, f.principal)).rejects.toBeInstanceOf(ConflictException)
  })

  it('fails closed for a stale actor, retired project and terminal status', async () => {
    const f = await fixture()
    await expect(service.transition(f.claim.id, command('submit'), { ...f.principal, userId: randomUUID() })).rejects.toBeInstanceOf(ForbiddenException)
    await db.update(projects).set({ deleted_at: new Date(), deleted_by: f.userId, deletion_reason: 'Synthetic retirement' }).where(eq(projects.id, f.projectId))
    await expect(service.transition(f.claim.id, command('submit'), f.principal)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('does not certify with a same-tenant document from another project', async () => {
    const f = await fixture()
    const otherProjectId = randomUUID()
    const documentId = randomUUID()
    await db.transaction(async (tx) => {
      await tx.update(progressClaims).set({ status: 'submitted' }).where(eq(progressClaims.id, f.claim.id))
      await tx.insert(projects).values({ id: otherProjectId, tenant_id: f.tenantId, name: 'Other project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: f.userId })
      await tx.insert(documents).values({ id: documentId, tenant_id: f.tenantId, project_id: otherProjectId, document_type: 'pdf', file_name: 'certificate.pdf', storage_path: `synthetic/${documentId}`, mime_type: 'application/pdf', size_bytes: 1 })
    })
    await expect(service.transition(f.claim.id, command('certify', { certificateDocumentId: documentId }), f.principal)).rejects.toBeInstanceOf(NotFoundException)
  })
})
