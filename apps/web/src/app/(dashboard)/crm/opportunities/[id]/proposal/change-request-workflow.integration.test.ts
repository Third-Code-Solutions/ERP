import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  changeLogs,
  opportunities,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import {
  createChangeRequestRecord,
  resolveChangeRequestRecord,
} from './change-request-workflow'

const enabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.DATABASE_HARDENING_EXPECTED === '1'
const suite = enabled ? describe : describe.skip

if (!enabled) {
  console.warn(
    '[change-request-workflow] disposable DATABASE_URL and DATABASE_HARDENING_EXPECTED=1 required; skipping',
  )
}

const ROLLBACK = Symbol('rollback')

suite('proposal change-request workflow against disposable PostgreSQL', () => {
  beforeAll(() => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  })

  it('proves create, exact replay, conflicting-key denial, resolve, and tenant isolation', async () => {
    let observed: {
      createdId: string
      changeLogCount: number
      foreignCreateError: string | undefined
      foreignResolveError: string | undefined
    } | undefined

    try {
      await db.transaction(async (tx) => {
        const suffix = randomUUID().slice(0, 12)
        const [tenantA] = await tx
          .insert(tenants)
          .values({ name: 'Workflow Tenant A ' + suffix, slug: 'workflow-a-' + suffix })
          .returning({ id: tenants.id })
        const [tenantB] = await tx
          .insert(tenants)
          .values({ name: 'Workflow Tenant B ' + suffix, slug: 'workflow-b-' + suffix })
          .returning({ id: tenants.id })
        if (!tenantA || !tenantB) throw new Error('workflow tenants were not created')

        const userAId = randomUUID()
        const userBId = randomUUID()
        await tx.insert(users).values([
          {
            id: userAId,
            tenant_id: tenantA.id,
            email: 'workflow-a-' + suffix + '@test.invalid',
            full_name: 'Workflow Tenant A',
            role: 'admin',
          },
          {
            id: userBId,
            tenant_id: tenantB.id,
            email: 'workflow-b-' + suffix + '@test.invalid',
            full_name: 'Workflow Tenant B',
            role: 'admin',
          },
        ])

        const [projectA] = await tx
          .insert(projects)
          .values({
            tenant_id: tenantA.id,
            name: 'Workflow Project ' + suffix,
            client: 'Workflow Client',
            created_by: userAId,
          })
          .returning({ id: projects.id })
        if (!projectA) throw new Error('workflow project was not created')

        const [opportunityA] = await tx
          .insert(opportunities)
          .values({
            tenant_id: tenantA.id,
            project_id: projectA.id,
            rep_id: userAId,
            remarks: 'workflow integration fixture',
          })
          .returning({ id: opportunities.id })
        if (!opportunityA) throw new Error('workflow opportunity was not created')

        const input = {
          tenantId: tenantA.id,
          actorId: userAId,
          opportunityId: opportunityA.id,
          requestedByName: 'Client contact',
          description: 'Move reception counter 300 mm east.',
          priority: 'major' as const,
          affectedDesignFileId: null,
          idempotencyKey: 'workflow-' + suffix,
        }

        const created = await createChangeRequestRecord(tx, input)
        expect(created.replayed).toBe(false)
        expect(created.changeRequestId).toBeDefined()

        const replay = await createChangeRequestRecord(tx, input)
        expect(replay).toEqual({
          changeRequestId: created.changeRequestId,
          replayed: true,
        })

        const conflict = await createChangeRequestRecord(tx, {
          ...input,
          description: 'Change request payload conflict.',
        })
        expect(conflict.error).toContain('different request data')

        const foreignCreate = await createChangeRequestRecord(tx, {
          ...input,
          tenantId: tenantB.id,
          actorId: userBId,
          idempotencyKey: 'foreign-' + suffix,
        })
        expect(foreignCreate.error).toBe('Opportunity not found')

        const resolved = await resolveChangeRequestRecord(tx, {
          tenantId: tenantA.id,
          actorId: userAId,
          changeRequestId: created.changeRequestId as string,
          resolutionNote: 'Updated reflected ceiling plan.',
        })
        expect(resolved).toEqual({
          opportunityId: opportunityA.id,
          alreadyResolved: false,
        })

        const resolvedReplay = await resolveChangeRequestRecord(tx, {
          tenantId: tenantA.id,
          actorId: userAId,
          changeRequestId: created.changeRequestId as string,
          resolutionNote: 'Duplicate retry.',
        })
        expect(resolvedReplay).toEqual({
          opportunityId: opportunityA.id,
          alreadyResolved: true,
        })

        const foreignResolve = await resolveChangeRequestRecord(tx, {
          tenantId: tenantB.id,
          actorId: userBId,
          changeRequestId: created.changeRequestId as string,
          resolutionNote: 'Must not resolve foreign tenant request.',
        })
        expect(foreignResolve.error).toBe('Change request not found.')

        const [logCount] = await tx
          .select({ count: sql.raw('count(*)::int') })
          .from(changeLogs)
          .where(eq(changeLogs.change_request_id, created.changeRequestId as string))
        observed = {
          createdId: created.changeRequestId as string,
          changeLogCount: Number(logCount?.count ?? 0),
          foreignCreateError: foreignCreate.error,
          foreignResolveError: foreignResolve.error,
        }

        throw ROLLBACK
      })
    } catch (error) {
      if (error !== ROLLBACK) throw error
    }

    expect(observed).toEqual({
      createdId: expect.any(String),
      changeLogCount: 2,
      foreignCreateError: 'Opportunity not found',
      foreignResolveError: 'Change request not found.',
    })
  })
})
