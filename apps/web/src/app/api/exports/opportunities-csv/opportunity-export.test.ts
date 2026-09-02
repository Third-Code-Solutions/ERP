import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface QueryCapture {
  from?: unknown
  joins: Array<{ table: unknown; condition: SQL }>
  where?: SQL
  orderBy: SQL[]
  limit?: number
}

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  rows: Array<unknown>(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: (selection: unknown) => mocks.select(selection) },
}))

import {
  accounts,
  opportunities,
  projects,
  users,
} from '@third-code-erp/database/schema'

import {
  csvCell,
  getOpportunityExportRows,
  OPPORTUNITY_EXPORT_QUERY_LIMIT,
  opportunityExportCsvLine,
  parseOpportunityExportFilters,
  type OpportunityExportRow,
} from './opportunity-export'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const OPPORTUNITY_ID = '22222222-2222-4222-8222-222222222222'
const LEGACY_OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'

let capture: QueryCapture

interface MockQuery extends PromiseLike<unknown[]> {
  from(table: unknown): MockQuery
  leftJoin(table: unknown, condition: SQL): MockQuery
  where(condition: SQL): MockQuery
  orderBy(...expressions: SQL[]): MockQuery
  limit(value: number): MockQuery
}

function mockQuery(): MockQuery {
  const query: MockQuery = {
    from(table) {
      capture.from = table
      return query
    },
    leftJoin(table, condition) {
      capture.joins.push({ table, condition })
      return query
    },
    where(condition) {
      capture.where = condition
      return query
    },
    orderBy(...expressions) {
      capture.orderBy.push(...expressions)
      return query
    },
    limit(value) {
      capture.limit = value
      return query
    },
    then(onfulfilled, onrejected) {
      return Promise.resolve(mocks.rows).then(onfulfilled, onrejected)
    },
  }
  return query
}

function compile(expression: SQL): ReturnType<PgDialect['sqlToQuery']> {
  return new PgDialect().sqlToQuery(expression)
}

const BASE_ROW: OpportunityExportRow = {
  id: OPPORTUNITY_ID,
  account_name: 'Account',
  project_name: 'Project',
  stage: 'lead',
  tcv_php: '100.00',
  gp_php: '25.00',
  probability: 50,
  weighted_tcv_php: '50.00',
  closing_date: '2026-08-06',
  rep_email: 'rep@example.test',
}

describe('opportunity export filter boundary', () => {
  it('uses Asia/Manila inclusive and half-open calendar-day bounds', () => {
    const parsed = parseOpportunityExportFilters(
      new URLSearchParams(
        'since=2026-08-06&until=2026-08-06&stage=bom_submission',
      ),
    )

    expect(parsed).toEqual({
      success: true,
      data: {
        sinceInclusive: new Date('2026-08-05T16:00:00.000Z'),
        untilExclusive: new Date('2026-08-06T16:00:00.000Z'),
        stage: 'bom_submission',
      },
    })
  })

  it.each([
    'since=2026-02-30',
    'until=2025-13-01',
    'since=2026-8-06',
    'stage=future_stage',
    'since=2026-08-06&since=2026-08-07',
    'stage=lead&stage=won',
    'unknown=value',
    'since=2026-08-07&until=2026-08-06',
  ])('rejects malformed, duplicate, unknown, or reversed input: %s', (query) => {
    expect(parseOpportunityExportFilters(new URLSearchParams(query))).toEqual({
      success: false,
    })
  })
})

describe('opportunity export query', () => {
  beforeEach(() => {
    capture = { joins: [], orderBy: [] }
    mocks.rows.length = 0
    mocks.select.mockReset()
    mocks.select.mockImplementation(() => mockQuery())
  })

  it('binds every join to the opportunity tenant and applies deterministic bounded filters', async () => {
    const sinceInclusive = new Date('2026-08-05T16:00:00.000Z')
    const untilExclusive = new Date('2026-08-06T16:00:00.000Z')

    await getOpportunityExportRows(TENANT_ID, {
      sinceInclusive,
      untilExclusive,
      stage: 'lead',
    })

    expect(capture.from).toBe(opportunities)
    expect(capture.joins.map(({ table }) => table)).toEqual([
      accounts,
      projects,
      users,
    ])

    for (const { table, condition } of capture.joins) {
      const { sql, params } = compile(condition)
      const joinedName =
        table === accounts ? 'accounts' : table === projects ? 'projects' : 'users'
      const foreignKey =
        table === accounts
          ? 'account_id'
          : table === projects
            ? 'project_id'
            : 'rep_id'
      expect(sql).toContain(
        `"opportunities"."${foreignKey}" = "${joinedName}"."id"`,
      )
      expect(sql).toContain(
        `"opportunities"."tenant_id" = "${joinedName}"."tenant_id"`,
      )
      expect(params).toEqual([])
    }

    if (!capture.where || !capture.orderBy[0]) {
      throw new Error('Expected export filters and ordering to be captured.')
    }
    const compiledWhere = compile(capture.where)
    expect(compiledWhere.sql).toContain('"opportunities"."tenant_id" = $1')
    expect(compiledWhere.sql).toContain('"opportunities"."closing_date" >= $2')
    expect(compiledWhere.sql).toContain('"opportunities"."closing_date" < $3')
    expect(compiledWhere.sql).toContain('"opportunities"."stage" = $4')
    expect(compiledWhere.params).toEqual([
      TENANT_ID,
      sinceInclusive.toISOString(),
      untilExclusive.toISOString(),
      'lead',
    ])
    expect(compile(capture.orderBy[0]).sql).toBe('"opportunities"."id" asc')
    expect(capture.limit).toBe(OPPORTUNITY_EXPORT_QUERY_LIMIT)
  })

  it('prefers the canonical Account and falls back to the legacy project client', async () => {
    mocks.rows.push(
      {
        id: OPPORTUNITY_ID,
        accountName: 'Canonical Account',
        projectName: 'Current Project',
        projectClient: 'Legacy Client',
        stage: 'lead',
        tcv: -12_345,
        gp: -2_500,
        probability: 50,
        weighted: -6_173,
        closingDate: new Date('2026-08-06T04:00:00.000Z'),
        repEmail: 'rep@example.test',
      },
      {
        id: LEGACY_OPPORTUNITY_ID,
        accountName: null,
        projectName: 'Legacy Project',
        projectClient: 'Legacy Client',
        stage: 'scoping',
        tcv: 10_000,
        gp: 2_000,
        probability: 25,
        weighted: 2_500,
        closingDate: null,
        repEmail: null,
      },
    )

    await expect(getOpportunityExportRows(TENANT_ID, {})).resolves.toEqual([
      {
        ...BASE_ROW,
        account_name: 'Canonical Account',
        project_name: 'Current Project',
        tcv_php: '-123.45',
        gp_php: '-25.00',
        weighted_tcv_php: '-61.73',
      },
      {
        id: LEGACY_OPPORTUNITY_ID,
        account_name: 'Legacy Client',
        project_name: 'Legacy Project',
        stage: 'scoping',
        tcv_php: '100.00',
        gp_php: '20.00',
        probability: 25,
        weighted_tcv_php: '25.00',
        closing_date: '',
        rep_email: '',
      },
    ])
  })
})

describe('opportunity export CSV safety', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tformula', "'\tformula"],
    ['\rformula', "\"'\rformula\""],
  ])('neutralizes the untrusted formula prefix in %j', (value, expected) => {
    expect(csvCell(value, true)).toBe(expected)
  })

  it('retains RFC-4180 escaping for untrusted text', () => {
    expect(csvCell('ACME, "Metro"\r\nBranch', true)).toBe(
      '"ACME, ""Metro""\r\nBranch"',
    )
  })

  it('preserves legitimate negative numeric cells', () => {
    const line = opportunityExportCsvLine({
      ...BASE_ROW,
      account_name: '=Untrusted Account',
      tcv_php: '-123.45',
      gp_php: '-25.00',
      weighted_tcv_php: '-61.73',
    })

    expect(line).not.toContain(",'-123.45,")
    expect(line).toContain(',-123.45,-25.00,')
    expect(line).toContain(',-61.73,')
  })
})
