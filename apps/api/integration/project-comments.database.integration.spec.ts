import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  auditLog,
  db,
  projectCommentCreateRequests,
  projectCommentDeleteRequests,
  projectComments,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { ProjectCommentCreationService } from '../src/projects/project-comment-creation.service'
import { ProjectCommentDeletionService } from '../src/projects/project-comment-deletion.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
        ) => callback(transaction)
      }

      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function'
        ? value.bind(transaction)
        : value
    },
  })

  return { client } as DatabaseService
}

async function alwaysRollback(
  callback: (transaction: DatabaseTransaction) => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await callback(transaction)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

suite('Project comment database integration', () => {
  it('commits scoped mentions, replays idempotently, and audits once', async () => {
    let probeTenantId = ''

    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const authorA = randomUUID()
      const mentionA = randomUUID()
      const authorB = randomUUID()
      const projectA = randomUUID()
      const projectB = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Project Comment Integration A',
          slug: `project-comment-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Project Comment Integration B',
          slug: `project-comment-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: authorA,
          tenant_id: tenantA,
          email: `author-a-${suffix}@integration.test`,
          full_name: 'Author A',
          role: 'pm',
        },
        {
          id: mentionA,
          tenant_id: tenantA,
          email: `mention-a-${suffix}@integration.test`,
          full_name: 'Mention A',
          role: 'viewer',
        },
        {
          id: authorB,
          tenant_id: tenantB,
          email: `author-b-${suffix}@integration.test`,
          full_name: 'Author B',
          role: 'pm',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Project A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          created_by: authorA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Project B',
          client: 'Client B',
          status: 'active',
          project_type: 'mep',
          created_by: authorB,
        },
      ])

      const principalA: ErpPrincipal = {
        userId: authorA,
        tenantId: tenantA,
        role: 'pm',
        email: `author-a-${suffix}@integration.test`,
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED') return true
          if (key === 'ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS') {
            return [tenantA]
          }
          return fallback
        }),
      }
      const service = new ProjectCommentCreationService(
        config as never,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const command = {
        projectId: projectA,
        body: `Delivery is ready for @mention-a-${suffix}@integration.test.`,
      }

      const first = await service.create(command, principalA, 'comment-integration')
      const replay = await service.create(command, principalA, 'comment-integration')

      expect(first).toMatchObject({
        tenantId: tenantA,
        projectId: projectA,
        authorId: authorA,
        mentions: [mentionA],
        created: true,
      })
      expect(replay).toEqual(first)

      await expect(
        service.create(
          { ...command, body: 'Different command.' },
          principalA,
          'comment-integration'
        )
      ).rejects.toMatchObject({ status: 409 })

      await expect(
        service.create(
          { ...command, projectId: projectB },
          principalA,
          'comment-foreign-project'
        )
      ).rejects.toMatchObject({ status: 404 })

      const commentRows = await transaction
        .select()
        .from(projectComments)
        .where(
          and(
            eq(projectComments.tenant_id, tenantA),
            eq(projectComments.project_id, projectA)
          )
        )
      const requestRows = await transaction
        .select()
        .from(projectCommentCreateRequests)
        .where(eq(projectCommentCreateRequests.tenant_id, tenantA))
      const auditRows = await transaction
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_type, 'project_comment'),
            eq(auditLog.entity_id, first.commentId),
            eq(auditLog.action, 'create')
          )
        )

      expect(commentRows).toHaveLength(1)
      expect(requestRows).toHaveLength(1)
      expect(requestRows[0]).toMatchObject({
        tenant_id: tenantA,
        state: 'succeeded',
        comment_id: first.commentId,
      })
      expect(auditRows).toHaveLength(1)
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)

  it('deletes scoped comments with durable replay and retained evidence', async () => {
    let probeTenantId = ''

    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const authorA = randomUUID()
      const authorB = randomUUID()
      const projectA = randomUUID()
      const projectB = randomUUID()
      const commentId = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Project Comment Delete Integration A',
          slug: `project-comment-delete-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Project Comment Delete Integration B',
          slug: `project-comment-delete-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: authorA,
          tenant_id: tenantA,
          email: `delete-author-a-${suffix}@integration.test`,
          full_name: 'Delete Author A',
          role: 'pm',
        },
        {
          id: authorB,
          tenant_id: tenantB,
          email: `delete-author-b-${suffix}@integration.test`,
          full_name: 'Delete Author B',
          role: 'pm',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Delete Project A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          created_by: authorA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Delete Project B',
          client: 'Client B',
          status: 'active',
          project_type: 'mep',
          created_by: authorB,
        },
      ])
      await transaction.insert(projectComments).values({
        id: commentId,
        tenant_id: tenantA,
        project_id: projectA,
        author_id: authorA,
        body: 'Remove after correction.',
        mentions: [],
      })
      await transaction.insert(projectCommentCreateRequests).values({
        tenant_id: tenantA,
        idempotency_key: `create-evidence-${suffix}`,
        request_hash: 'a'.repeat(64),
        state: 'succeeded',
        comment_id: commentId,
        result: {
          commentId,
          tenantId: tenantA,
          projectId: projectA,
          authorId: authorA,
          body: 'Remove after correction.',
          mentions: [],
          created: true,
        },
        created_by: authorA,
        completed_at: new Date(),
      })

      const principalA: ErpPrincipal = {
        userId: authorA,
        tenantId: tenantA,
        role: 'pm',
        email: `delete-author-a-${suffix}@integration.test`,
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED') return true
          if (key === 'ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS') {
            return [tenantA]
          }
          return fallback
        }),
      }
      const service = new ProjectCommentDeletionService(
        config as never,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const command = { projectId: projectA, commentId }

      const first = await service.delete(command, principalA, 'delete-integration')
      const replay = await service.delete(command, principalA, 'delete-integration')

      expect(first).toEqual({
        commentId,
        tenantId: tenantA,
        projectId: projectA,
        deleted: true,
      })
      expect(replay).toEqual(first)

      await expect(
        service.delete(
          { ...command, commentId: randomUUID() },
          principalA,
          'delete-integration'
        )
      ).rejects.toMatchObject({ status: 409 })
      await expect(
        service.delete(
          { projectId: projectB, commentId },
          principalA,
          'delete-foreign-project'
        )
      ).rejects.toMatchObject({ status: 404 })

      const commentRows = await transaction
        .select()
        .from(projectComments)
        .where(eq(projectComments.id, commentId))
      const createRows = await transaction
        .select()
        .from(projectCommentCreateRequests)
        .where(eq(projectCommentCreateRequests.tenant_id, tenantA))
      const deleteRows = await transaction
        .select()
        .from(projectCommentDeleteRequests)
        .where(eq(projectCommentDeleteRequests.tenant_id, tenantA))
      const auditRows = await transaction
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_type, 'project_comment'),
            eq(auditLog.entity_id, commentId),
            eq(auditLog.action, 'delete')
          )
        )

      expect(commentRows).toHaveLength(0)
      expect(createRows).toHaveLength(1)
      expect(createRows[0]?.comment_id).toBeNull()
      expect(deleteRows).toHaveLength(1)
      expect(deleteRows[0]).toMatchObject({
        tenant_id: tenantA,
        project_id: projectA,
        comment_id: null,
        state: 'succeeded',
      })
      expect(auditRows).toHaveLength(1)
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
