import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMock = vi.hoisted(() => {
  const selectResults: unknown[][] = []
  const inserted: unknown[][] = []
  return {
    selectResults,
    inserted,
    db: {
      select: () => ({
        from: () => ({ where: () => Promise.resolve(selectResults.shift() ?? []) }),
      }),
      insert: () => ({
        values: (rows: unknown[]) => {
          inserted.push(rows)
          return Promise.resolve()
        },
      }),
    },
  }
})
vi.mock('@third-code-erp/database', () => ({ db: dbMock.db }))
import { generateTasksForDate, manilaBoundaries, manilaCalendarDate } from './cadence-engine'

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

describe('generateTasksForDate', () => {
  const day = new Date('2026-11-04T00:00:00.000Z')
  const templates = [
    { role: 'safety' as const, tasks: [{ title: 'Toolbox meeting log', hour: 7 }, { title: 'PPE check' }] },
    { role: 'commercial' as const, tasks: [{ title: 'Variation log review', hour: 11 }] },
  ]

  beforeEach(() => {
    dbMock.selectResults.length = 0
    dbMock.inserted.length = 0
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

  it('splits large generations into bounded insert statements', async () => {
    const safetyUsers = Array.from({ length: 130 }, (_, i) => ({ id: `u-${i}`, role: 'safety' }))
    dbMock.selectResults.push([{ id: 'p1' }], safetyUsers, [])

    const result = await generateTasksForDate('t1', day, templates)

    expect(result.created).toBe(260)
    expect(dbMock.inserted.map((chunk) => chunk.length)).toEqual([250, 10])
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
})
