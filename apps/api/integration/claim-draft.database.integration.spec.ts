import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { auditLog, db, progressClaims, projects, tenants, users } from '@third-code-erp/database'
import { asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService, type SemanticAuditParams } from '../src/audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { ClaimDraftService } from '../src/projects/claim-draft.service'

const suite = process.env.ERP_API_INTEGRATION_EXPECTED === '1' ? describe : describe.skip
const service = new ClaimDraftService(new DatabaseService(), new AuditService())
beforeAll(() => {
  if (process.env.ERP_API_INTEGRATION_EXPECTED !== '1') return
  if (!process.env.DATABASE_URL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Claim tests require explicit loopback synthetic database')
})
async function fixture() {
  const tenantId = randomUUID(), userId = randomUUID(), projectId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'admin', email: `claim-draft-${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic claim draft tenant', slug: `claim-draft-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, role: 'admin', email: principal.email, full_name: 'Synthetic claim creator' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic claim project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: userId })
  })
  return { tenantId, userId, projectId, principal }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
function command(f: Fixture) { return { clientRequestId: randomUUID(), projectId: f.projectId, milestonePct: 50, amountCents: 12345, description: 'Scoped draft work' } }
async function state(f: Fixture) {
  return {
    claims: await db.select().from(progressClaims).where(eq(progressClaims.tenant_id, f.tenantId)).orderBy(asc(progressClaims.id)),
    audits: await db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id)),
  }
}
suite('Claim draft PostgreSQL command authority', () => {
  it('creates exact cents and original receipt, then replays after later transition', async () => {
    const f = await fixture(), input = command(f)
    const first = await service.create(input, f.principal)
    expect(first).toMatchObject({ created: true, changed: true, receipt: { actorId: f.userId, claim: { amountCents: 12345, claimNumber: 'PC-00001', status: 'draft' } } })
    await db.update(progressClaims).set({ status: 'submitted', submitted_at: new Date(), submitted_by: f.userId }).where(eq(progressClaims.id, first.receipt.claim.id))
    const before = await state(f)
    expect(await service.create(input, f.principal)).toEqual({ ...first, created: false, changed: false })
    expect(await state(f)).toEqual(before)
  })
  it('allocates numeric suffixes through PC-99999, PC-100000 and PC-100001', async () => {
    const f = await fixture()
    await db.insert(progressClaims).values({ tenant_id: f.tenantId, project_id: f.projectId, claim_number: 'PC-99999', milestone_pct: 1, amount_cents: 1, created_by: f.userId })
    expect((await service.create(command(f), f.principal)).receipt.claim.claimNumber).toBe('PC-100000')
    expect((await service.create(command(f), f.principal)).receipt.claim.claimNumber).toBe('PC-100001')
  })
  it('rolls back the draft and all audit effects when the semantic receipt fails after insertion', async () => {
    class FailingAudit extends AuditService {
      override async writeSemantic(tx: DatabaseTransaction, input: SemanticAuditParams): Promise<void> {
        await super.writeSemantic(tx, input)
        throw new Error('Synthetic claim receipt failure')
      }
    }
    const f = await fixture(), before = await state(f)
    const failing = new ClaimDraftService(new DatabaseService(), new FailingAudit())
    await expect(failing.create(command(f), f.principal)).rejects.toThrow('Synthetic claim receipt failure')
    expect(await state(f)).toEqual(before)
  })

  it('fails closed for stale actor, cross-tenant project and retired project', async () => {
    const f = await fixture()
    await expect(service.create(command(f), { ...f.principal, tenantId: randomUUID() })).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.create({ ...command(f), projectId: randomUUID() }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    await db.update(projects).set({ deleted_at: new Date(), deleted_by: f.userId, deletion_reason: 'Synthetic retirement' }).where(eq(projects.id, f.projectId))
    await expect(service.create(command(f), f.principal)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects a reused request key with different payload without creating another claim', async () => {
    const f = await fixture(), input = command(f)
    await service.create(input, f.principal)
    await expect(service.create({ ...input, amountCents: input.amountCents + 1 }, f.principal)).rejects.toBeInstanceOf(ConflictException)
    expect((await db.select().from(progressClaims).where(eq(progressClaims.tenant_id, f.tenantId))).length).toBe(1)
  })
})
