/**
 * Forward-only Cortex/cost hardening contract.
 *
 * Static assertions always run because the configured demo database may not
 * have the new migration yet. Runtime assertions are opt-in and read/write only
 * inside transactions that always roll back:
 *
 *   DATABASE_HARDENING_EXPECTED=1 pnpm --filter @third-code-erp/database test
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DATABASE_URL,
  becomeAuthenticated,
  inRollback,
  makeSql,
} from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  __dirname,
  '../../../../supabase/migrations/20260726192929_cortex_cost_security_hardening.sql'
)
const migrationSql = readFileSync(migrationPath, 'utf8').toLowerCase()

describe('Cortex/cost hardening migration contract', () => {
  it('serializes each tenant provenance chain and keeps RPC helpers trusted-only', () => {
    expect(migrationSql).toContain('pg_advisory_xact_lock')
    expect(migrationSql).toContain(
      "hashtextextended('cortex_provenance:' || p_tenant::text, 0)"
    )
    expect(migrationSql).toContain(
      "'revoke execute on function %s from public, anon, authenticated'"
    )
    expect(migrationSql).toContain("'grant execute on function %s to service_role'")
    expect(migrationSql).toContain("procedure.proname = 'handle_new_user'")
  })

  it('serializes audit writes and removes client-side audit forgery', () => {
    expect(migrationSql).toContain(
      "hashtextextended('audit_log:' || v_tenant_id::text, 0)"
    )
    expect(migrationSql).toMatch(
      /revoke all privileges on table[\s\S]*?public\.audit_log,[\s\S]*?public\.cost_entries[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
      /grant select[\s\S]*?public\.cortex_provenance,[\s\S]*?public\.audit_log[\s\S]*?to authenticated/
    )
    expect(migrationSql).toContain(
      'revoke execute on function public.audit_log_trigger()'
    )
  })

  it('scopes conversations to tenant plus auth.uid ownership', () => {
    expect(migrationSql).toMatch(
      /create policy cortex_conversations_owner_read[\s\S]*?to authenticated[\s\S]*?tenant_id = auth_tenant_id\(\)[\s\S]*?user_id = \(select auth\.uid\(\)\)/
    )
    expect(migrationSql).toMatch(
      /create policy cortex_conversations_owner_insert[\s\S]*?with check \([\s\S]*?user_id = \(select auth\.uid\(\)\)/
    )
    expect(migrationSql).toMatch(
      /create policy cortex_conversations_owner_update[\s\S]*?using \([\s\S]*?user_id = \(select auth\.uid\(\)\)[\s\S]*?with check \([\s\S]*?user_id = \(select auth\.uid\(\)\)/
    )
  })

  it('derives message access from parent ownership and leaves messages append-only', () => {
    expect(migrationSql).toMatch(
      /create policy cortex_messages_parent_owner_read[\s\S]*?exists \([\s\S]*?conversation\.id = cortex_messages\.conversation_id[\s\S]*?conversation\.tenant_id = cortex_messages\.tenant_id[\s\S]*?conversation\.user_id = \(select auth\.uid\(\)\)/
    )
    expect(migrationSql).toMatch(
      /create policy cortex_messages_parent_owner_insert[\s\S]*?with check \([\s\S]*?conversation\.user_id = \(select auth\.uid\(\)\)/
    )
    expect(migrationSql).toMatch(
      /grant insert \(tenant_id, conversation_id, role, content, citations\)[\s\S]*?public\.cortex_messages[\s\S]*?to authenticated/
    )
    expect(migrationSql).not.toMatch(
      /grant\s+(?:[^;]*,\s*)?(?:update|delete)(?:\s*,[^;]*)?\s+on table public\.cortex_messages\s+to authenticated/
    )
  })

  it('closes authenticated graph/provenance writes with explicit client grants', () => {
    expect(migrationSql).toMatch(
      /revoke all privileges on table[\s\S]*?public\.cortex_nodes,[\s\S]*?public\.cortex_edges,[\s\S]*?public\.cortex_provenance[\s\S]*?from public, anon, authenticated/
    )
    expect(migrationSql).toMatch(
      /grant select[\s\S]*?public\.cortex_nodes,[\s\S]*?public\.cortex_edges,[\s\S]*?public\.cortex_provenance[\s\S]*?to authenticated/
    )
    expect(migrationSql).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*public\.cortex_(?:nodes|edges|provenance)[^;]*to authenticated/
    )
  })

  it('enforces cost domain checks through NOT VALID then VALIDATE', () => {
    const amountAdd = migrationSql.indexOf(
      'constraint cost_entries_amount_nonnegative'
    )
    const amountValidate = migrationSql.indexOf(
      'validate constraint cost_entries_amount_nonnegative'
    )
    const quantityAdd = migrationSql.indexOf(
      'constraint cost_entries_quantity_positive'
    )
    const quantityValidate = migrationSql.indexOf(
      'validate constraint cost_entries_quantity_positive'
    )

    expect(migrationSql).toContain('check (amount_cents >= 0) not valid')
    expect(migrationSql).toContain('check (quantity > 0) not valid')
    expect(amountAdd).toBeGreaterThanOrEqual(0)
    expect(quantityAdd).toBeGreaterThanOrEqual(0)
    expect(amountValidate).toBeGreaterThan(amountAdd)
    expect(quantityValidate).toBeGreaterThan(quantityAdd)
  })

  it('enforces tenant-consistent BOM and PO cost references', () => {
    expect(migrationSql).toContain(
      'foreign key (tenant_id, bom_line_item_id)'
    )
    expect(migrationSql).toContain(
      'references public.bom_line_items(tenant_id, id)'
    )
    expect(migrationSql).toContain(
      'foreign key (tenant_id, po_line_item_id)'
    )
    expect(migrationSql).toContain(
      'references public.po_line_items(tenant_id, id)'
    )
    expect(migrationSql).toContain(
      'validate constraint cost_entries_bom_line_tenant_fk'
    )
    expect(migrationSql).toContain(
      'validate constraint cost_entries_po_line_tenant_fk'
    )
    expect(migrationSql).toContain('idx_cost_entries_bom_line_item_id')
    expect(migrationSql).toContain('idx_cost_entries_po_line_item_id')
  })

  it('matches cost writes to ERP roles and immutable ownership columns', () => {
    const updateGrant = migrationSql.match(
      /grant update \(([^)]*)\)\s+on table public\.cost_entries/
    )

    expect(migrationSql).toContain(
      "array['admin', 'owner', 'sd_pm_pe', 'pm', 'commercial', 'finance']"
    )
    expect(migrationSql).toContain('and created_by = (select auth.uid())')
    expect(migrationSql).toContain("and cost_source = 'manual'")
    expect(migrationSql).toMatch(
      /grant insert \([\s\S]*?tenant_id,[\s\S]*?project_id,[\s\S]*?created_by,[\s\S]*?notes[\s\S]*?\)[\s\S]*?public\.cost_entries[\s\S]*?to authenticated/
    )
    expect(migrationSql).toMatch(
      /grant update \([\s\S]*?cost_category,[\s\S]*?updated_at[\s\S]*?\)[\s\S]*?public\.cost_entries[\s\S]*?to authenticated/
    )
    expect(updateGrant?.[1]).toBeDefined()
    expect(updateGrant?.[1]).not.toMatch(
      /\b(?:tenant_id|project_id|created_by|cost_source)\b/
    )
  })

  it('preserves explicit service_role table and sequence privileges', () => {
    expect(migrationSql).toMatch(
      /grant all privileges[\s\S]*?public\.cortex_conversations,[\s\S]*?public\.cortex_messages,[\s\S]*?public\.cortex_nodes,[\s\S]*?public\.cortex_edges,[\s\S]*?public\.cortex_provenance,[\s\S]*?public\.audit_log,[\s\S]*?public\.cost_entries[\s\S]*?to service_role/
    )
    expect(migrationSql).toMatch(
      /grant usage, select, update[\s\S]*?public\.cortex_provenance_id_seq,[\s\S]*?public\.audit_log_id_seq[\s\S]*?to service_role/
    )
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1'
    ? describe
    : describe.skip

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = any

async function seedSameTenantUsers(
  tx: postgres.TransactionSql
): Promise<{ tenantId: string; userA: string; userB: string }> {
  const suffix = (
    (await tx.unsafe(
      `select substr(md5(random()::text),1,10) as suffix`
    )) as Rows
  )[0].suffix as string
  const tenantId = (
    (await tx.unsafe(
      `insert into tenants(name, slug)
       values('Same tenant probe','same-tenant-${suffix}')
       returning id`
    )) as Rows
  )[0].id as string
  const userA = (
    (await tx.unsafe(
      `insert into users(id, tenant_id, email, full_name, role)
       values(
         gen_random_uuid(),
         '${tenantId}',
         'same-a-${suffix}@probe.test',
         'Same Tenant A',
         'admin'
       )
       returning id`
    )) as Rows
  )[0].id as string
  const userB = (
    (await tx.unsafe(
      `insert into users(id, tenant_id, email, full_name, role)
       values(
         gen_random_uuid(),
         '${tenantId}',
         'same-b-${suffix}@probe.test',
         'Same Tenant B',
         'admin'
       )
       returning id`
    )) as Rows
  )[0].id as string

  return { tenantId, userA, userB }
}

runtimeSuite('Cortex/cost hardening runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('isolates conversations and messages between users in the same tenant', async () => {
    const visible = await inRollback(sql, async (tx) => {
      const { tenantId, userA, userB } = await seedSameTenantUsers(tx)
      const conversationA = (
        (await tx.unsafe(
          `insert into cortex_conversations(tenant_id, user_id, title)
           values('${tenantId}','${userA}','Owned by A')
           returning id`
        )) as Rows
      )[0].id as string
      const conversationB = (
        (await tx.unsafe(
          `insert into cortex_conversations(tenant_id, user_id, title)
           values('${tenantId}','${userB}','Owned by B')
           returning id`
        )) as Rows
      )[0].id as string
      await tx.unsafe(
        `insert into cortex_messages(tenant_id, conversation_id, role, content)
         values
           ('${tenantId}','${conversationA}','user','A private message'),
           ('${tenantId}','${conversationB}','user','B private message')`
      )

      await becomeAuthenticated(tx, userA)
      const conversations = (
        (await tx.unsafe(
          `select count(*)::int as count
           from cortex_conversations
           where title in ('Owned by A','Owned by B')`
        )) as Rows
      )[0].count as number
      const messages = (
        (await tx.unsafe(
          `select count(*)::int as count
           from cortex_messages
           where content in ('A private message','B private message')`
        )) as Rows
      )[0].count as number
      await tx.unsafe(`reset role`)

      return { conversations, messages }
    })

    expect(visible).toEqual({ conversations: 1, messages: 1 })
  })

  it('rejects a conversation owned by another user in the same tenant', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const { tenantId, userA, userB } = await seedSameTenantUsers(tx)
      await becomeAuthenticated(tx, userA)

      try {
        await tx.unsafe(
          `insert into cortex_conversations(tenant_id, user_id, title)
           values('${tenantId}','${userB}','Impersonated owner')`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects a message appended to another user conversation', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const { tenantId, userA, userB } = await seedSameTenantUsers(tx)
      const conversationB = (
        (await tx.unsafe(
          `insert into cortex_conversations(tenant_id, user_id, title)
           values('${tenantId}','${userB}','B only')
           returning id`
        )) as Rows
      )[0].id as string
      await becomeAuthenticated(tx, userA)

      try {
        await tx.unsafe(
          `insert into cortex_messages(tenant_id, conversation_id, role, content)
           values('${tenantId}','${conversationB}','user','Unauthorized append')`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it.each(['update', 'delete'] as const)(
    'rejects authenticated message %s to preserve append-only history',
    async (operation) => {
      const rejected = await inRollback(sql, async (tx) => {
        const { tenantId, userA } = await seedSameTenantUsers(tx)
        const conversationId = (
          (await tx.unsafe(
            `insert into cortex_conversations(tenant_id, user_id, title)
             values('${tenantId}','${userA}','Append-only probe')
             returning id`
          )) as Rows
        )[0].id as string
        const messageId = (
          (await tx.unsafe(
            `insert into cortex_messages(tenant_id, conversation_id, role, content)
             values('${tenantId}','${conversationId}','user','Original message')
             returning id`
          )) as Rows
        )[0].id as string
        await becomeAuthenticated(tx, userA)

        try {
          if (operation === 'update') {
            await tx.unsafe(
              `update cortex_messages
               set content = 'Tampered message'
               where id = '${messageId}'`
            )
          } else {
            await tx.unsafe(
              `delete from cortex_messages
               where id = '${messageId}'`
            )
          }
          return false
        } catch {
          return true
        }
      })

      expect(rejected).toBe(true)
    }
  )

  it.each(['node insert', 'edge update', 'provenance insert'] as const)(
    'rejects direct authenticated %s',
    async (operation) => {
      const rejected = await inRollback(sql, async (tx) => {
        const { tenantId, userA } = await seedSameTenantUsers(tx)
        await becomeAuthenticated(tx, userA)

        try {
          if (operation === 'node insert') {
            await tx.unsafe(
              `insert into cortex_nodes(
                 tenant_id,
                 node_type,
                 ref_table,
                 ref_id,
                 title
               )
               values(
                 '${tenantId}',
                 'project',
                 'security_probe',
                 gen_random_uuid(),
                 'Unauthorized graph write'
               )`
            )
          } else if (operation === 'edge update') {
            await tx.unsafe(
              `update cortex_edges
               set confidence = confidence
               where tenant_id = '${tenantId}'`
            )
          } else {
            await tx.unsafe(
              `insert into cortex_provenance(
                 tenant_id,
                 subject_kind,
                 origin,
                 prev_hash,
                 hash
               )
               values(
                 '${tenantId}',
                 'node',
                 'mutation',
                 'genesis',
                 repeat('0', 64)
               )`
            )
          }
          return false
        } catch {
          return true
        }
      })

      expect(rejected).toBe(true)
    }
  )

  it('exposes read-only graph/provenance and append-only message grants', async () => {
    const grants = (await sql.unsafe(
      `select
         has_table_privilege('authenticated','cortex_nodes','SELECT') as nodes_read,
         has_table_privilege('authenticated','cortex_nodes','INSERT') as nodes_insert,
         has_table_privilege('authenticated','cortex_edges','UPDATE') as edges_update,
         has_table_privilege('authenticated','cortex_provenance','INSERT') as provenance_insert,
         has_table_privilege('authenticated','cortex_messages','UPDATE') as messages_update,
         has_table_privilege('authenticated','cortex_messages','DELETE') as messages_delete,
         has_column_privilege('authenticated','cortex_messages','content','INSERT') as messages_append,
         has_table_privilege('authenticated','audit_log','INSERT') as audit_insert,
         has_table_privilege('anon','cortex_nodes','SELECT') as anon_nodes_read,
         has_table_privilege('service_role','cortex_nodes','INSERT') as service_nodes_insert,
         has_table_privilege('service_role','cortex_messages','DELETE') as service_messages_delete`
    )) as Rows

    expect(grants[0]).toEqual({
      nodes_read: true,
      nodes_insert: false,
      edges_update: false,
      provenance_insert: false,
      messages_update: false,
      messages_delete: false,
      messages_append: true,
      audit_insert: false,
      anon_nodes_read: false,
      service_nodes_insert: true,
      service_messages_delete: true,
    })
  })

  it.each([
    ['negative amount', -1, 1],
    ['zero quantity', 0, 0],
  ])('rejects %s cost entries', async (_label, amountCents, quantity) => {
    const rejected = await inRollback(sql, async (tx) => {
      const { tenantId, userA } = await seedSameTenantUsers(tx)
      const projectId = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client)
           values('${tenantId}','Cost guard project','Probe')
           returning id`
        )) as Rows
      )[0].id as string
      const costCodeId = (
        (await tx.unsafe(
          `insert into cost_codes(tenant_id, code, name, category, created_by)
           values('${tenantId}','OTH-INVALID','Other invalid','other','${userA}')
           returning id`
        )) as Rows
      )[0].id as string

      try {
        await tx.unsafe(
          `insert into cost_entries(
             tenant_id,
             project_id,
             cost_code_id,
             created_by,
             cost_category,
             description,
             amount_cents,
             quantity
           )
           values(
             '${tenantId}',
             '${projectId}',
             '${costCodeId}',
             '${userA}',
             'other',
             'Invalid cost probe',
             ${amountCents},
             ${quantity}
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('rejects cost writes from a viewer role', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const { tenantId, userA } = await seedSameTenantUsers(tx)
      await tx.unsafe(`update users set role = 'viewer' where id = '${userA}'`)
      const projectId = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client)
           values('${tenantId}','Viewer cost guard','Probe')
           returning id`
        )) as Rows
      )[0].id as string
      const costCodeId = (
        (await tx.unsafe(
          `insert into cost_codes(tenant_id, code, name, category, created_by)
           values('${tenantId}','OTH-VIEWER','Other viewer','other','${userA}')
           returning id`
        )) as Rows
      )[0].id as string
      await becomeAuthenticated(tx, userA)

      try {
        await tx.unsafe(
          `insert into cost_entries(
             tenant_id,
             project_id,
             cost_code_id,
             created_by,
             cost_category,
             description,
             amount_cents,
             quantity
           )
           values(
             '${tenantId}',
             '${projectId}',
             '${costCodeId}',
             '${userA}',
             'other',
             'Viewer must not write',
             100,
             1
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })

  it('allows a permitted role to append a valid manual cost', async () => {
    const inserted = await inRollback(sql, async (tx) => {
      const { tenantId, userA } = await seedSameTenantUsers(tx)
      const projectId = (
        (await tx.unsafe(
          `insert into projects(tenant_id, name, client)
           values('${tenantId}','Admin cost guard','Probe')
           returning id`
        )) as Rows
      )[0].id as string
      const costCodeId = (
        (await tx.unsafe(
          `insert into cost_codes(tenant_id, code, name, category, created_by)
           values('${tenantId}','OTH-VALID','Other valid','other','${userA}')
           returning id`
        )) as Rows
      )[0].id as string
      await becomeAuthenticated(tx, userA)

      const rows = (await tx.unsafe(
        `insert into cost_entries(
           tenant_id,
           project_id,
           cost_code_id,
           created_by,
           cost_category,
           description,
           amount_cents,
           quantity
         )
         values(
           '${tenantId}',
           '${projectId}',
           '${costCodeId}',
           '${userA}',
           'other',
           'Authorized manual cost',
           100,
           1
         )
         returning id`
      )) as Rows
      return rows.length === 1
    })

    expect(inserted).toBe(true)
  })

  it('rejects a directly forged audit row', async () => {
    const rejected = await inRollback(sql, async (tx) => {
      const { tenantId, userA } = await seedSameTenantUsers(tx)
      await becomeAuthenticated(tx, userA)

      try {
        await tx.unsafe(
          `insert into audit_log(
             tenant_id,
             actor_id,
             entity_type,
             entity_id,
             action,
             prev_hash,
             hash
           )
           values(
             '${tenantId}',
             '${userA}',
             'forged',
             gen_random_uuid(),
             'create',
             'genesis',
             repeat('0', 64)
           )`
        )
        return false
      } catch {
        return true
      }
    })

    expect(rejected).toBe(true)
  })
})
