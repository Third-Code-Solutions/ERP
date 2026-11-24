import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cnpsSurveys } from '../schema'
import { DATABASE_URL, inRollback, makeSql, seedTwoTenants } from './_db-harness'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20261124170000_cnps_surveys_one_per_ticket.sql'),
  'utf8'
).replace(/\r\n/g, '\n')

describe('CNPS one survey per ticket migration contract', () => {
  it('checks for duplicates, then builds the unique index under bounded timeouts', () => {
    expect(migrationSql.startsWith('-- NEEDS PRODUCTION MIGRATION APPROVAL')).toBe(true)
    expect(migrationSql).toContain(
      "begin;\n\nset local lock_timeout = '5s';\nset local statement_timeout = '60s';"
    )
    const squashed = migrationSql.replace(/\s+/g, ' ')
    expect(squashed).toContain('group by tenant_id, ticket_id having count(*) > 1')
    expect(squashed.indexOf('having count(*) > 1')).toBeLessThan(
      squashed.indexOf('create unique index')
    )
    expect(squashed).toContain(
      'create unique index if not exists ux_cnps_surveys_tenant_ticket on public.cnps_surveys (tenant_id, ticket_id);'
    )
    expect(migrationSql).toContain(
      "delete from supabase_migrations.schema_migrations where version = '20261124170000';"
    )
    expect(migrationSql.trimEnd().endsWith('commit;')).toBe(true)
  })

  it('keeps Drizzle aligned with the unique index the senders conflict on', () => {
    const index = getTableConfig(cnpsSurveys).indexes.find(
      (candidate) => candidate.config.name === 'ux_cnps_surveys_tenant_ticket'
    )
    expect(index?.config.unique).toBe(true)
    expect(index?.config.columns.map((column) => (column as { name: string }).name)).toEqual([
      'tenant_id',
      'ticket_id',
    ])
  })
})

const runtimeSuite =
  DATABASE_URL && process.env.DATABASE_HARDENING_EXPECTED === '1' ? describe : describe.skip

type Rows = Array<Record<string, unknown>>

async function seedTicket(tx: postgres.TransactionSql, tenantId: string, number: string) {
  const projectId = (
    (await tx.unsafe(
      `insert into projects(tenant_id, name, client)
       values ('${tenantId}', 'CNPS project ${number}', 'CNPS client') returning id`
    )) as Rows
  )[0]!.id as string
  return (
    (await tx.unsafe(
      `insert into warranty_tickets(tenant_id, project_id, ticket_number, description, status)
       values ('${tenantId}', '${projectId}', '${number}', 'Leak', 'closed') returning id`
    )) as Rows
  )[0]!.id as string
}

/** The senders' insert: on conflict (tenant_id, ticket_id) do nothing, returning the new id. */
async function insertSurvey(tx: postgres.TransactionSql, tenantId: string, ticketId: string) {
  return (await tx.unsafe(
    `insert into cnps_surveys(tenant_id, ticket_id, response_token_hash)
     values ('${tenantId}', '${ticketId}', md5(random()::text))
     on conflict (tenant_id, ticket_id) do nothing
     returning id`
  )) as Rows
}

runtimeSuite('CNPS one survey per ticket runtime proof', () => {
  let sql: postgres.Sql

  beforeAll(() => {
    sql = makeSql()
  })

  afterAll(async () => {
    await sql?.end({ timeout: 5 })
  })

  it('lets only the first sender create a ticket survey', async () => {
    const outcome = await inRollback(sql, async (tx) => {
      const { tenantA, tenantB } = await seedTwoTenants(tx)
      const ticketA = await seedTicket(tx, tenantA, 'WT-CNPS-1')
      const otherTicket = await seedTicket(tx, tenantA, 'WT-CNPS-2')
      const ticketB = await seedTicket(tx, tenantB, 'WT-CNPS-1')
      return {
        first: (await insertSurvey(tx, tenantA, ticketA)).length,
        second: (await insertSurvey(tx, tenantA, ticketA)).length,
        otherTicket: (await insertSurvey(tx, tenantA, otherTicket)).length,
        otherTenant: (await insertSurvey(tx, tenantB, ticketB)).length,
        surveys: (
          (await tx.unsafe(
            `select count(*)::int as n from cnps_surveys
              where tenant_id = '${tenantA}' and ticket_id = '${ticketA}'`
          )) as Rows
        )[0]!.n,
      }
    })

    expect(outcome).toEqual({ first: 1, second: 0, otherTicket: 1, otherTenant: 1, surveys: 1 })
  })

  it('refuses a plain second insert on the named index', async () => {
    const failure = await inRollback(sql, async (tx) => {
      const { tenantA } = await seedTwoTenants(tx)
      const ticket = await seedTicket(tx, tenantA, 'WT-CNPS-3')
      await insertSurvey(tx, tenantA, ticket)
      try {
        await tx.unsafe(`savepoint second_survey`)
        await tx.unsafe(
          `insert into cnps_surveys(tenant_id, ticket_id) values ('${tenantA}', '${ticket}')`
        )
        return null
      } catch (error) {
        await tx.unsafe(`rollback to savepoint second_survey`)
        const pgError = error as { code?: string; constraint_name?: string }
        return `${pgError.code}:${pgError.constraint_name}`
      }
    })

    expect(failure).toBe('23505:ux_cnps_surveys_tenant_ticket')
  })
})
