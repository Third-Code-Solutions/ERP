import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  auditLog,
  db,
  procurementRequisitionEvents,
  procurementRequisitionLines,
  procurementRequisitions,
  projects,
  tenants,
  users,
} from '@third-code-erp/database'
import { and, asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import { RoadmapService } from '../src/roadmap/roadmap.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip
beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(connection).hostname)) {
    throw new Error('Requisition workflow proof requires a loopback disposable PostgreSQL DATABASE_URL')
  }
})

// UUID-isolated committed synthetic fixtures, so two commands can use independent connections.
// Their append-only audit records are retained until the disposable lane resets.
async function fixture() {
  const tenantId = randomUUID(), projectId = randomUUID(), requisitionId = randomUUID()
  const principal = (role: ErpPrincipal['role']): ErpPrincipal => {
    const userId = randomUUID()
    return { tenantId, userId, role, email: `requisition-${userId}@integration.test` }
  }
  const requester = principal('pm'), checker = principal('commercial'), otherApprover = principal('commercial')
  await db.transaction(async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name: 'Requisition integration', slug: `requisition-${tenantId}` })
    await tx.insert(users).values(
      [requester, checker, otherApprover].map((user) => ({
        id: user.userId,
        tenant_id: tenantId,
        email: user.email,
        full_name: 'Requisition integration',
        role: user.role,
      })),
    )
    await tx.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Requisition project', client: 'Synthetic', status: 'active', project_type: 'mep', created_by: requester.userId })
    await tx.insert(procurementRequisitions).values({
      id: requisitionId,
      tenant_id: tenantId,
      project_id: projectId,
      requester_id: requester.userId,
      requisition_number: 'REQ-00001',
      status: 'pending_approval',
      purpose: 'Level 3 ceiling board',
      estimated_total_cents: 1_800_000n,
    })
    await tx.insert(procurementRequisitionLines).values({
      tenant_id: tenantId,
      requisition_id: requisitionId,
      line_number: 1,
      description: 'Gypsum board 12mm',
      quantity_micros: 40_000_000n,
      estimated_unit_cost_cents: 45_000n,
      estimated_total_cents: 1_800_000n,
    })
  })
  const service = new RoadmapService(
    new ConfigService({ ERP_ROADMAP_PROCUREMENT_LIFECYCLE_ENABLED: true }),
    new DatabaseService(),
    new AuditService(),
  )
  return { tenantId, requisitionId, requester, checker, otherApprover, service, key: `requisition-${randomUUID()}` }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function snapshot(context: Fixture) {
  const [requisition] = await db
    .select()
    .from(procurementRequisitions)
    .where(and(eq(procurementRequisitions.tenant_id, context.tenantId), eq(procurementRequisitions.id, context.requisitionId)))
  const events = await db
    .select()
    .from(procurementRequisitionEvents)
    .where(eq(procurementRequisitionEvents.tenant_id, context.tenantId))
    .orderBy(asc(procurementRequisitionEvents.created_at))
  const audits = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.tenant_id, context.tenantId)).orderBy(asc(auditLog.id))
  return { requisition, events, audits }
}

suite('Requisition workflow PostgreSQL authority', () => {
  it('approves once when two retries of one key race, and records one event', async () => {
    const f = await fixture()
    const approve = () => f.service.transitionRequisition(f.requisitionId, { action: 'approve' }, f.checker, f.key)

    const results = await Promise.all([approve(), approve()])

    expect(results.map((result) => result.created).sort()).toEqual([false, true])
    expect(results.map((result) => result.status)).toEqual(['approved', 'approved'])
    const after = await snapshot(f)
    expect(after.requisition).toMatchObject({ status: 'approved', approved_by: f.checker.userId })
    expect(after.events).toHaveLength(1)
    expect(after.events[0]).toMatchObject({ action: 'approve', actor_id: f.checker.userId, idempotency_key: f.key })
    expect(after.events[0]?.request_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses a key reused with another reason or by another approver and writes nothing', async () => {
    const f = await fixture()
    await f.service.transitionRequisition(f.requisitionId, { action: 'reject', reason: 'Over budget' }, f.checker, f.key)
    const before = await snapshot(f)

    await expect(
      f.service.transitionRequisition(f.requisitionId, { action: 'reject', reason: 'Wrong supplier' }, f.checker, f.key),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      f.service.transitionRequisition(f.requisitionId, { action: 'reject', reason: 'Over budget' }, f.otherApprover, f.key),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(f)).toEqual(before)
    // The same command by the same approver still replays.
    await expect(
      f.service.transitionRequisition(f.requisitionId, { action: 'reject', reason: 'Over budget' }, f.checker, f.key),
    ).resolves.toMatchObject({ status: 'rejected', created: false })
  })

  it("treats another tenant's requisition as not found and leaves it unchanged", async () => {
    const f = await fixture(), foreign = await fixture()
    const before = await snapshot(foreign)

    await expect(
      f.service.transitionRequisition(foreign.requisitionId, { action: 'approve' }, f.checker, f.key),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(await snapshot(foreign)).toEqual(before)
    expect((await snapshot(f)).events).toHaveLength(0)
  })
})
