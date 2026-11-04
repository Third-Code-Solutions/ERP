import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const dbMock = vi.hoisted(() => {
  const selectResults: unknown[][] = []
  const inserted: unknown[][] = []
  const wheres: unknown[] = []
  const executed: unknown[] = []
  const calls: string[] = []
  const state = { failInsertAt: -1 }
  const select = (label: string) => () => ({
    from: () => ({
      where: (condition: unknown) => {
        wheres.push(condition)
        calls.push(`${label}.select`)
        return Promise.resolve(selectResults.shift() ?? [])
      },
    }),
  })
  const tx = {
    execute: (query: unknown) => {
      executed.push(query)
      calls.push('tx.lock')
      return Promise.resolve()
    },
    select: select('tx'),
    insert: () => ({
      values: (rows: unknown[]) => {
        calls.push('tx.insert')
        if (inserted.length === state.failInsertAt) return Promise.reject(new Error('chunk failed'))
        inserted.push(rows)
        return Promise.resolve()
      },
    }),
  }
  return {
    selectResults,
    inserted,
    wheres,
    executed,
    calls,
    state,
    // No db.insert: every write must go through the run's transaction.
    db: {
      select: select('db'),
      transaction: <T>(work: (t: typeof tx) => Promise<T>) => work(tx),
    },
  }
})
vi.mock('@third-code-erp/database', () => ({ db: dbMock.db }))
import {
  generateTasksForDate,
  manilaBoundaries,
  manilaCalendarDate,
  manilaDaysBetween,
  parseManilaDateTimeLocal,
  toManilaDateTimeLocal,
} from './cadence-engine'

function rendered(query: unknown) {
  return new PgDialect().sqlToQuery(query as SQL)
}

describe('Manila task calendar boundaries', () => {
  it.each([
    ['2026-09-06T15:59:59.999Z', '2026-09-06'],
    ['2026-09-06T16:00:00.000Z', '2026-09-07'],
    ['2026-09-06T23:00:00.000Z', '2026-09-07'],
    ['2026-09-07T00:00:00.000Z', '2026-09-07'],
    ['2026-12-31T16:00:00.000Z', '2027-01-01'],
  ])('resolves %s to local day %s', (instant, day) => {
    const date = new Date(instant)
    expect(manilaCalendarDate(date).toISOString()).toBe(`${day}T00:00:00.000Z`)
    expect(manilaBoundaries.startOfDay(date).toISOString()).toBe(
      new Date(`${day}T00:00:00.000+08:00`).toISOString()
    )
    expect(manilaBoundaries.endOfDay(date).toISOString()).toBe(
      new Date(`${day}T23:59:59.999+08:00`).toISOString()
    )
    expect(manilaBoundaries.atHour(date, 8).toISOString()).toBe(`${day}T00:00:00.000Z`)
  })
})

describe('Manila datetime-local helpers', () => {
  it.each([
    ['2026-11-05T09:00:00.000Z', '2026-11-05T17:00'],
    ['2026-11-04T16:30:00.000Z', '2026-11-05T00:30'],
    ['2026-12-31T15:59:00.000Z', '2026-12-31T23:59'],
    ['2028-02-29T00:00:00.000Z', '2028-02-29T08:00'],
  ])('formats %s as Manila wall time %s and parses it back', (instant, local) => {
    expect(toManilaDateTimeLocal(new Date(instant))).toBe(local)
    expect(parseManilaDateTimeLocal(local)?.toISOString()).toBe(instant)
  })

  it.each([
    ['February 30', '2026-02-30T10:00'],
    ['February 29 outside a leap year', '2027-02-29T10:00'],
    ['April 31', '2026-04-31T23:59'],
    ['month 13', '2026-13-01T00:00'],
    ['hour 24', '2026-11-05T24:00'],
    ['minute 60', '2026-11-05T12:60'],
    ['year 0000', '0000-01-01T00:00'],
    ['a two-digit year', '0099-06-01T00:00'],
    ['a date without time', '2026-11-05'],
    ['seconds', '2026-11-05T17:00:00'],
    ['an explicit offset', '2026-11-05T17:00+08:00'],
    ['surrounding whitespace', ' 2026-11-05T17:00'],
  ])('rejects %s', (_label, value) => {
    expect(parseManilaDateTimeLocal(value)).toBeNull()
  })

  it.each([
    ['later the same Manila day', '2026-09-07T02:00:00.000Z', '2026-09-06T16:00:00.000Z', 0],
    ['across Manila midnight', '2026-09-07T02:00:00.000Z', '2026-09-06T15:59:00.000Z', 1],
    ['several days apart', '2026-09-07T02:00:00.000Z', '2026-09-03T04:00:00.000Z', 4],
    ['in reverse', '2026-09-03T04:00:00.000Z', '2026-09-07T02:00:00.000Z', -4],
  ])('counts Manila calendar days %s', (_label, a, b, days) => {
    expect(manilaDaysBetween(new Date(a), new Date(b))).toBe(days)
  })
})

describe('generateTasksForDate', () => {
  const day = new Date('2026-11-04T00:00:00.000Z')
  const templates = [
    { role: 'safety' as const, tasks: [{ title: 'Toolbox meeting log', hour: 7 }, { title: 'PPE check' }] },
    { role: 'commercial' as const, tasks: [{ title: 'Variation log review', hour: 11 }] },
  ]

  beforeEach(() => {
    dbMock.selectResults.length = 0
    dbMock.inserted.length = 0
    dbMock.wheres.length = 0
    dbMock.executed.length = 0
    dbMock.calls.length = 0
    dbMock.state.failInsertAt = -1
  })

  it('inserts one batch for missing rows and skips rows already generated that day', async () => {
    dbMock.selectResults.push(
      [{ id: 'p1' }, { id: 'p2' }],
      [{ id: 'u-safety', role: 'safety' }],
      [{ project_id: 'p1', assignee_id: 'u-safety', title: 'Toolbox meeting log' }]
    )

    const result = await generateTasksForDate('t1', day, templates)

    expect(result).toEqual({ created: 3, skipped: 1, projectsConsidered: 2 })
    expect(dbMock.inserted).toHaveLength(1)
    const rows = dbMock.inserted[0] as Array<Record<string, unknown>>
    expect(rows.map((r) => `${r.project_id}:${r.title}`)).toEqual([
      'p1:PPE check',
      'p2:Toolbox meeting log',
      'p2:PPE check',
    ])
    expect((rows[1]!.due_date as Date).toISOString()).toBe('2026-11-03T23:00:00.000Z')
    expect((rows[0]!.due_date as Date).toISOString()).toBe('2026-11-04T15:59:59.999Z')
  })

  it('takes the tenant-day advisory lock inside the transaction before reading existing rows', async () => {
    dbMock.selectResults.push([{ id: 'p1' }], [{ id: 'u-safety', role: 'safety' }], [])

    await generateTasksForDate('t1', day, templates)

    expect(dbMock.calls).toEqual(['db.select', 'db.select', 'tx.lock', 'tx.select', 'tx.insert'])
    const lock = rendered(dbMock.executed[0])
    expect(lock.sql).toBe(
      "select pg_advisory_xact_lock(hashtextextended('cadence:' || $1::text || ':' || $2::text, 0))"
    )
    expect(lock.params).toEqual(['t1', '2026-11-04'])
  })

  it('scopes reads to the tenant, active projects, active accounts and cadence rows only', async () => {
    dbMock.selectResults.push([{ id: 'p1' }], [{ id: 'u-safety', role: 'safety' }], [])

    await generateTasksForDate('t1', day, templates)

    const [projectsWhere, usersWhere, existingWhere] = dbMock.wheres.map(rendered)
    expect(projectsWhere?.sql).toBe('("projects"."tenant_id" = $1 and "projects"."status" = $2)')
    expect(projectsWhere?.params).toEqual(['t1', 'active'])
    expect(usersWhere?.sql).toBe('("users"."tenant_id" = $1 and "users"."account_status" = $2)')
    expect(usersWhere?.params).toEqual(['t1', 'active'])
    expect(existingWhere?.sql).toBe(
      '("daily_tasks"."tenant_id" = $1 and "daily_tasks"."role" is not null and "daily_tasks"."due_date" >= $2 and "daily_tasks"."due_date" <= $3)'
    )
    expect(existingWhere?.params[0]).toBe('t1')
  })

  it('splits large generations into bounded insert statements', async () => {
    const safetyUsers = Array.from({ length: 130 }, (_, i) => ({ id: `u-${i}`, role: 'safety' }))
    dbMock.selectResults.push([{ id: 'p1' }], safetyUsers, [])

    const result = await generateTasksForDate('t1', day, templates)

    expect(result.created).toBe(260)
    expect(dbMock.inserted.map((chunk) => chunk.length)).toEqual([250, 10])
  })

  it('propagates a failed chunk out of the transaction so the whole run rolls back', async () => {
    const safetyUsers = Array.from({ length: 130 }, (_, i) => ({ id: `u-${i}`, role: 'safety' }))
    dbMock.selectResults.push([{ id: 'p1' }], safetyUsers, [])
    dbMock.state.failInsertAt = 1

    await expect(generateTasksForDate('t1', day, templates)).rejects.toThrow('chunk failed')
  })

  it('writes nothing when every task for the day already exists', async () => {
    dbMock.selectResults.push(
      [{ id: 'p1' }],
      [{ id: 'u-safety', role: 'safety' }],
      [
        { project_id: 'p1', assignee_id: 'u-safety', title: 'Toolbox meeting log' },
        { project_id: 'p1', assignee_id: 'u-safety', title: 'PPE check' },
      ]
    )

    const result = await generateTasksForDate('t1', day, templates)

    expect(result).toEqual({ created: 0, skipped: 2, projectsConsidered: 1 })
    expect(dbMock.inserted).toHaveLength(0)
  })

  it('skips the lock and transaction when the tenant has no active projects', async () => {
    dbMock.selectResults.push([])

    expect(await generateTasksForDate('t1', day, templates)).toEqual({
      created: 0,
      skipped: 0,
      projectsConsidered: 0,
    })
    expect(dbMock.calls).toEqual(['db.select'])
  })
})
