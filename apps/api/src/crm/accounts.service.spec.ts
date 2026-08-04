import 'reflect-metadata'

import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { accounts } from '@third-code-erp/database/schema'
import type { AccountListQuery } from '@third-code-erp/shared-types'
import { AccountsService } from './accounts.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}

const ACCOUNT = {
  id: '33333333-3333-4333-8333-333333333333',
  tenant_id: PRINCIPAL.tenantId,
  name: 'Acme Office',
  industry: 'office' as const,
  billing_address: null,
  primary_email: 'hello@example.test',
  primary_phone: null,
  kyc_status: 'approved' as const,
  kyc_notes: null,
  kyc_decided_at: null,
  kyc_decided_by: null,
  cnps_score_x10: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  created_by: null,
}

function listHarness(rows = [{ account: ACCOUNT, opportunityCount: 2 }], total = rows.length) {
  const rowOffset = vi.fn().mockResolvedValue(rows)
  const rowLimit = vi.fn().mockReturnValue({ offset: rowOffset })
  const rowOrderBy = vi.fn().mockReturnValue({ limit: rowLimit })
  const rowGroupBy = vi.fn().mockReturnValue({ orderBy: rowOrderBy })
  const rowWhere = vi.fn().mockReturnValue({ groupBy: rowGroupBy })
  const rowJoin = vi.fn().mockReturnValue({ where: rowWhere })
  const rowFrom = vi.fn().mockReturnValue({ leftJoin: rowJoin })
  const countWhere = vi.fn().mockResolvedValue([{ count: total }])
  const countFrom = vi.fn().mockReturnValue({ where: countWhere })
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: rowFrom })
    .mockReturnValueOnce({ from: countFrom })
  const database = { client: { select } } as unknown as DatabaseService
  const service = new AccountsService(database)
  return { service, rowWhere, rowLimit, rowOffset, countWhere }
}

describe('AccountsService', () => {
  it('lists accounts within the principal tenant with bounded filters', async () => {
    const probe = listHarness([{ account: ACCOUNT, opportunityCount: 2 }], 21)
    const query: AccountListQuery = {
      q: 'Acme',
      industry: 'office',
      kycStatus: 'approved',
      sort: 'name',
      order: 'asc',
      page: 2,
      limit: 20,
    }

    await expect(probe.service.list(query, PRINCIPAL)).resolves.toMatchObject({
      total: 21,
      page: 2,
      limit: 20,
      totalPages: 2,
      rows: [
        expect.objectContaining({
          id: ACCOUNT.id,
          tenantId: PRINCIPAL.tenantId,
          opportunityCount: 2,
        }),
      ],
    })
    expect(probe.rowLimit).toHaveBeenCalledWith(20)
    expect(probe.rowOffset).toHaveBeenCalledWith(20)
    const querySql = new PgDialect().sqlToQuery(
      probe.rowWhere.mock.calls[0]?.[0]
    )
    expect(querySql.sql).toContain('"accounts"."tenant_id" = $1')
    expect(querySql.params).toEqual([
      PRINCIPAL.tenantId,
      '%Acme%',
      '%Acme%',
      '%Acme%',
      'office',
      'approved',
    ])
  })

  it('keeps an empty tenant collection on one page', async () => {
    const probe = listHarness([], 0)
    await expect(
      probe.service.list(
        {
          q: undefined,
          industry: undefined,
          kycStatus: undefined,
          sort: 'created_at',
          order: 'desc',
          page: 1,
          limit: 20,
        },
        PRINCIPAL
      )
    ).resolves.toMatchObject({ total: 0, totalPages: 1, rows: [] })
  })
})
