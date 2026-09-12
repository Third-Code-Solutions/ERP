import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { auditLog, db, progressClaims, projects, tenants, users } from '@third-code-erp/database'
import { and, asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { DatabaseService } from '../src/database/database.service'
import { ProjectBillingMilestonesService } from '../src/projects/project-billing-milestones.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
const service = new ProjectBillingMilestonesService(new DatabaseService())
beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) throw new Error('Billing proof requires explicit loopback disposable DATABASE_URL')
})

// Synthetic committed fixtures and all immutable audit history are retained.
async function fixture() {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const principal: ErpPrincipal = { tenantId, userId, role: 'viewer', email: `billing-${userId}@integration.test` }
  await db.transaction(async tx => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Synthetic billing tenant', slug: `billing-${tenantId}` })
    await tx.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Synthetic billing viewer', role: 'viewer' })
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Synthetic billing project', client: 'Synthetic', project_type: 'mep', created_by: userId })
  })
  return { tenantId, userId, projectId, principal }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function audits(f: Fixture) {
  return db.select().from(auditLog).where(eq(auditLog.tenant_id, f.tenantId)).orderBy(asc(auditLog.id))
}

suite('Billing milestone PostgreSQL read authority', () => {
  it('paginates 27 committed claims without duplicates or tenant/project leakage and performs no writes', async () => {
    const f = await fixture()
    const foreign = await fixture()
    const otherProjectId = randomUUID()
    await db.insert(projects).values({ id: otherProjectId, tenant_id: f.tenantId, name: 'Other synthetic billing project', client: 'Synthetic', project_type: 'mep', created_by: f.userId })
    const claims = Array.from({ length: 27 }, (_, index) => ({ id: randomUUID(), tenant_id: f.tenantId, project_id: f.projectId, claim_number: `PC-${String(index).padStart(3, '0')}`, milestone_pct: 50, amount_cents: 10000 + index, created_by: f.userId }))
    await db.insert(progressClaims).values([...claims, { ...claims[0]!, id: randomUUID(), claim_number: 'OTHER', project_id: otherProjectId }, { ...claims[0]!, id: randomUUID(), tenant_id: foreign.tenantId, project_id: foreign.projectId, created_by: foreign.userId }])
    const before = await audits(f)
    const first = await service.list(f.projectId, { page: 1, limit: 25 }, f.principal)
    const second = await service.list(f.projectId, { page: 2, limit: 25 }, f.principal)
    expect(first).toMatchObject({ projectId: f.projectId, total: 27, page: 1, limit: 25, totalPages: 2 })
    expect(second).toMatchObject({ total: 27, page: 2, limit: 25, totalPages: 2 })
    expect(first.rows).toHaveLength(25)
    expect(second.rows).toHaveLength(2)
    expect([...first.rows, ...second.rows].map(row => row.claimId)).toEqual(claims.map(claim => claim.id))
    expect(second.rows.map(row => row.amountCents)).toEqual([10025, 10026])
    expect(await service.list(f.projectId, { page: 3, limit: 25 }, f.principal)).toMatchObject({ rows: [], total: 27, page: 3, totalPages: 2 })
    await expect(service.list(foreign.projectId, { page: 1, limit: 25 }, f.principal)).rejects.toBeInstanceOf(NotFoundException)
    expect(await audits(f)).toEqual(before)
  })

  it('checks current finance permission rather than stale principal role', async () => {
    const f = await fixture()
    await db.update(users).set({ role: 'commercial' }).where(and(eq(users.id, f.userId), eq(users.tenant_id, f.tenantId)))
    const before = await audits(f)
    await expect(service.list(f.projectId, { page: 1, limit: 25 }, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await audits(f)).toEqual(before)
  })

  it.each(['invited', 'suspended', 'disabled'] as const)('denies a freshly %s user', async account_status => {
    const f = await fixture()
    await db.update(users).set({ account_status, status_reason: 'Synthetic lifecycle test', status_changed_at: new Date(), status_changed_by: f.userId }).where(and(eq(users.id, f.userId), eq(users.tenant_id, f.tenantId)))
    const before = await audits(f)
    await expect(service.list(f.projectId, { page: 1, limit: 25 }, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await audits(f)).toEqual(before)
  })

  it.each(['suspended', 'disabled'] as const)('denies a freshly %s tenant', async status => {
    const f = await fixture()
    await db.update(tenants).set({ status, status_reason: 'Synthetic lifecycle test', status_changed_at: new Date(), status_changed_by: f.userId }).where(eq(tenants.id, f.tenantId))
    const before = await audits(f)
    await expect(service.list(f.projectId, { page: 1, limit: 25 }, f.principal)).rejects.toBeInstanceOf(ForbiddenException)
    expect(await audits(f)).toEqual(before)
  })
})
