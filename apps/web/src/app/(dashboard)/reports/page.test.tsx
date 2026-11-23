import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getTableName, type Table } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface QueryMock {
  from(table: Table): QueryMock
  where(): QueryMock
  then(resolve: (rows: unknown[]) => unknown): Promise<unknown>
}

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  executed: [] as string[],
  rowsByTable: {} as Record<string, unknown[]>,
}))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))
vi.mock('@third-code-erp/database', () => ({
  db: {
    select: () => {
      let table = ''
      const query: QueryMock = {
        from: (source) => {
          table = getTableName(source)
          return query
        },
        where: () => query,
        // Drizzle builders only reach the database when awaited.
        then: (resolve) => {
          mocks.executed.push(table)
          return Promise.resolve(resolve(mocks.rowsByTable[table] ?? []))
        },
      }
      return query
    },
  },
}))

import ReportsPage from './page'

async function renderAs(role: string): Promise<string> {
  vi.stubGlobal('React', React)
  mocks.profile.mockResolvedValue({
    user: { id: '22222222-2222-4222-8222-222222222222' },
    tenantId: '11111111-1111-4111-8111-111111111111',
    role,
    email: `${role}@example.test`,
    fullName: role,
  })
  return renderToStaticMarkup(await ReportsPage())
}

describe('ReportsPage billing tiles', () => {
  beforeEach(() => {
    mocks.executed.length = 0
    mocks.rowsByTable = {
      invoices: [
        { status: 'issued', net_amount_cents: '12345' },
        { status: 'paid', net_amount_cents: '5000' },
        { status: 'draft', net_amount_cents: '999' },
      ],
    }
  })

  it('shows sales the pipeline figures but neither reads nor renders invoice totals', async () => {
    const markup = await renderAs('sales')

    expect(markup).toContain('Pipeline TCV')
    expect(markup).not.toContain('Total Billed')
    expect(markup).not.toContain('Paid invoice total')
    expect(mocks.executed).not.toContain('invoices')
  })

  it.each(['finance', 'admin', 'viewer'])('shows %s the billing totals', async (role) => {
    const markup = await renderAs(role)

    expect(markup).toContain('Total Billed')
    expect(markup).toContain('₱173.45')
    expect(markup).toContain('Paid invoice total')
    expect(mocks.executed).toContain('invoices')
  })
})
