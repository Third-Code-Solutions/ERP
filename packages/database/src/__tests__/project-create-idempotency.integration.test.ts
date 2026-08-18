import { describe, expect, it, afterAll } from 'vitest'
import {
  DATABASE_URL,
  inRollback,
  makeSql,
  seedTwoTenants,
} from './_db-harness'

const suite = DATABASE_URL ? describe : describe.skip

if (!DATABASE_URL) {

  console.warn(
    '[project-create-idempotency] DATABASE_URL not set - skipping integration suite'
  )
}

suite('Project creation idempotency database replay', () => {
  const sql = makeSql()

  afterAll(async () => {
    await sql.end({ timeout: 5 })
  })

  it('replays same tenant request and permits same key in another tenant', async () => {
    const outcome = await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA, userB } = await seedTwoTenants(tx)
      const key = 'project-create-replay-probe'
      const hash = 'a'.repeat(64)
      const [request] = await tx.unsafe(
        `insert into project_create_requests(tenant_id, idempotency_key, request_hash, created_by)
         values($1, $2, $3, $4) returning id`,
        [tenantA, key, hash, userA]
      )
      const [project] = await tx.unsafe(
        `insert into projects(tenant_id, created_by, name, client)
         values($1, $2, 'Replay Project', 'Replay Client') returning id`,
        [tenantA, userA]
      )
      await tx.unsafe(
        `update project_create_requests
            set state = 'succeeded', project_id = $1::uuid,
                result = jsonb_build_object('id', $1::uuid, 'tenantId', $2::uuid),
                completed_at = now()
          where id = $3::uuid`,
        [project!.id, tenantA, request!.id]
      )
      const [replay] = await tx.unsafe(
        `select state, project_id, result->>'tenantId' as tenant_id
           from project_create_requests
          where tenant_id = $1 and idempotency_key = $2`,
        [tenantA, key]
      )
      const [otherTenantRequest] = await tx.unsafe(
        `insert into project_create_requests(tenant_id, idempotency_key, request_hash, created_by)
         values($1, $2, $3, $4) returning tenant_id`,
        [tenantB, key, hash, userB]
      )
      return {
        tenantA,
        replay,
        otherTenant: otherTenantRequest?.tenant_id,
      }
    })

    expect(outcome.replay).toMatchObject({
      state: 'succeeded',
      tenant_id: outcome.tenantA,
    })
    expect(outcome.replay?.project_id).toBeDefined()
    expect(outcome.otherTenant).toBeDefined()
  })

  it('rejects a project reference crossing tenant boundary', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const { tenantA, tenantB, userA, userB } = await seedTwoTenants(tx)
      const [project] = await tx.unsafe(
        `insert into projects(tenant_id, created_by, name, client)
         values($1, $2, 'Tenant A Project', 'Client A') returning id`,
        [tenantA, userA]
      )
      try {
        await tx.unsafe(
          `insert into project_create_requests(tenant_id, idempotency_key, request_hash, project_id, created_by)
           values($1, 'cross-tenant-project', $2, $3, $4)`,
          [tenantB, 'b'.repeat(64), project!.id, userB]
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rolls back a failed project and replay-record transaction', async () => {
    const marker = `project-create-rollback-${Date.now()}`
    await inRollback(sql, async (tx) => {
      const { tenantA, userA } = await seedTwoTenants(tx)
      await tx.unsafe(
        `insert into project_create_requests(tenant_id, idempotency_key, request_hash, created_by)
         values($1, $2, $3, $4)`,
        [tenantA, marker, 'c'.repeat(64), userA]
      )
    })

    const [remaining] = await sql.unsafe(
      `select count(*)::int as count
         from project_create_requests
        where idempotency_key = $1`,
      [marker]
    )
    expect(remaining?.count).toBe(0)
  })
})
