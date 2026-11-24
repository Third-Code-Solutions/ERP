import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ select: vi.fn() }))

vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))

import {
  DEADLINE_DISPLAY_LIMIT,
  OPEN_CLOCK_ROW_LIMIT,
  loadOpenDeadlines,
} from './open-deadlines'

const TENANT_ID = '99999999-9999-4999-8999-999999999999'
const NOW = new Date('2026-09-14T10:00:00+08:00')
const CLOCK = { clock_type: 'business_days', breach_business_days: 5, warning_at_pct: 0.8 }

function clockRow(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `log-${index}`,
    entity_type: 'opportunity',
    entity_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    sla_label: 'opp.stage_response',
    started_at: new Date('2026-09-07T09:00:00+08:00'),
    sla_seconds: CLOCK,
    ...overrides,
  }
}

/** Each db.select() call resolves to the next queued row set, in call order. */
function queueSelects(...results: unknown[][]) {
  return results.map((rows) => {
    const query = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(resolve(rows)),
    }
    for (const method of [query.from, query.innerJoin, query.leftJoin, query.where, query.orderBy, query.limit]) {
      method.mockReturnValue(query)
    }
    mocks.select.mockReturnValueOnce(query)
    return query
  })
}

describe('loadOpenDeadlines', () => {
  beforeEach(() => {
    mocks.select.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('reads only this tenant\'s open clocks, earliest due first, within a row limit', async () => {
    const [query] = queueSelects([clockRow(1)])

    const result = await loadOpenDeadlines(TENANT_ID, 'admin', NOW)

    expect(result).toMatchObject({ ok: true, total: 1, truncated: false })
    expect(mocks.select).toHaveBeenCalledTimes(1)
    expect(query?.where).toHaveBeenCalledTimes(1)
    expect(query?.orderBy).toHaveBeenCalledTimes(1)
    expect(query?.limit).toHaveBeenCalledWith(OPEN_CLOCK_ROW_LIMIT)
  })

  it('returns an empty list without further queries when nothing is open', async () => {
    queueSelects([])

    expect(await loadOpenDeadlines(TENANT_ID, 'admin', NOW)).toEqual({
      ok: true,
      deadlines: [],
      total: 0,
      truncated: false,
    })
    expect(mocks.select).toHaveBeenCalledTimes(1)
  })

  it('links permits and checklist items through their project and names them', async () => {
    const queries = queueSelects(
      [
        clockRow(1, { entity_type: 'permit', entity_id: 'permit-1', sla_label: 'permit.status_update' }),
        clockRow(2, { entity_type: 'pre_con_checklist_item', entity_id: 'item-1', sla_label: 'precon.checklist_item' }),
      ],
      [{ id: 'permit-1', projectId: 'project-1', permitType: 'lgu_building_permit', lguName: 'Makati' }],
      [{ id: 'item-1', title: 'Submit structural plans', projectId: 'project-2' }]
    )

    const result = await loadOpenDeadlines(TENANT_ID, 'admin', NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const byLabel = Object.fromEntries(result.deadlines.map((deadline) => [deadline.subject, deadline]))
    expect(byLabel.Permit).toMatchObject({
      href: '/projects/project-1/permits',
      subjectName: 'Lgu building permit (Makati)',
    })
    expect(byLabel['Checklist item']).toMatchObject({
      href: '/projects/project-2/checklist',
      subjectName: 'Submit structural plans',
    })
    expect(mocks.select).toHaveBeenCalledTimes(3)
    // Every table read or joined carries this tenant explicitly (server Drizzle bypasses RLS).
    const params = (condition: unknown) => new PgDialect().sqlToQuery(condition as SQL).params
    for (const query of queries) {
      expect(params(query.where.mock.calls[0]?.[0])).toContain(TENANT_ID)
    }
    // Checklist join, and the live-project joins that unlink retired projects.
    expect(params(queries[2]?.innerJoin.mock.calls[0]?.[1])).toContain(TENANT_ID)
    expect(params(queries[1]?.leftJoin.mock.calls[0]?.[1])).toContain(TENANT_ID)
    expect(params(queries[2]?.leftJoin.mock.calls[0]?.[1])).toContain(TENANT_ID)
  })

  it('lists the most urgent rows up to the display limit and reports the full count', async () => {
    const rows = Array.from({ length: DEADLINE_DISPLAY_LIMIT + 10 }, (_, index) => clockRow(index + 1))
    queueSelects(rows)

    const result = await loadOpenDeadlines(TENANT_ID, 'admin', NOW)

    expect(result).toMatchObject({ ok: true, total: DEADLINE_DISPLAY_LIMIT + 10, truncated: false })
    expect(result.ok && result.deadlines).toHaveLength(DEADLINE_DISPLAY_LIMIT)
  })

  it('flags that more clocks exist than were read when the row limit is hit', async () => {
    queueSelects(Array.from({ length: OPEN_CLOCK_ROW_LIMIT }, (_, index) => clockRow(index + 1)))

    expect(await loadOpenDeadlines(TENANT_ID, 'admin', NOW)).toMatchObject({ ok: true, truncated: true })
  })

  it('hides rows whose page the role cannot open', async () => {
    const [query] = queueSelects([
      clockRow(1),
      clockRow(2, { entity_type: 'punchlist_item', sla_label: 'punchlist.due_date' }),
    ])

    const result = await loadOpenDeadlines(TENANT_ID, 'sales', NOW)

    expect(result.ok && result.deadlines.map((deadline) => deadline.subject)).toEqual(['Opportunity'])
    // The type filter is in SQL too, so the row cap counts only clocks the role may see.
    const where = new PgDialect().sqlToQuery(query?.where.mock.calls[0]?.[0] as SQL).params
    expect(where).toContain('opportunity')
    expect(where).not.toContain('punchlist_item')
  })

  it('returns a bare failure and logs the cause and SQLSTATE on the server only', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.select.mockImplementation(() => {
      throw new Error('Failed query: select ...', {
        cause: Object.assign(new Error('relation "sla_logs" does not exist'), { code: '42P01' }),
      })
    })

    expect(await loadOpenDeadlines(TENANT_ID, 'admin', NOW)).toEqual({ ok: false })
    expect(error).toHaveBeenCalledTimes(1)
    const logged = JSON.parse(String(error.mock.calls[0]?.[0]))
    expect(logged).toMatchObject({ action: 'process.open-deadlines', outcome: 'failure', code: '42P01' })
    expect(logged.error).toContain('relation "sla_logs" does not exist')
  })
})
