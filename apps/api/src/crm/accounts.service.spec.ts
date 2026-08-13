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

  it('returns a bounded pending KYC queue with tenant-scoped artifact counts', async () => {
    const queueRow = {
      id: '88888888-8888-4888-8888-888888888888',
      tenantId: PRINCIPAL.tenantId,
      name: 'Pending Office',
      industry: 'office' as const,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      artifactCount: 3,
    }
    const rowLimit = vi.fn().mockResolvedValue([queueRow])
    const rowOrderBy = vi.fn().mockReturnValue({ limit: rowLimit })
    const rowGroupBy = vi.fn().mockReturnValue({ orderBy: rowOrderBy })
    const rowWhere = vi.fn().mockReturnValue({ groupBy: rowGroupBy })
    const rowJoin = vi.fn().mockReturnValue({ where: rowWhere })
    const rowFrom = vi.fn().mockReturnValue({ leftJoin: rowJoin })
    const countWhere = vi.fn().mockResolvedValue([{ count: 201 }])
    const countFrom = vi.fn().mockReturnValue({ where: countWhere })
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: rowFrom })
      .mockReturnValueOnce({ from: countFrom })
    const database = { client: { select } } as unknown as DatabaseService

    const result = await new AccountsService(database).kycQueue(PRINCIPAL)

    expect(result).toEqual({
      rows: [
        expect.objectContaining({
          id: queueRow.id,
          tenantId: PRINCIPAL.tenantId,
          artifactCount: 3,
        }),
      ],
      total: 201,
      limit: 200,
      truncated: true,
    })
    expect(rowLimit).toHaveBeenCalledWith(200)
    for (const predicate of [rowWhere, countWhere]) {
      const querySql = new PgDialect().sqlToQuery(predicate.mock.calls[0]?.[0])
      expect(querySql.sql).toContain('tenant_id')
      expect(querySql.params).toContain(PRINCIPAL.tenantId)
    }
    const joinSql = new PgDialect().sqlToQuery(rowJoin.mock.calls[0]?.[1])
    expect(joinSql.sql).toContain('tenant_id')
    expect(joinSql.params).toContain(PRINCIPAL.tenantId)
  })

  it('reads the account detail graph with repeated tenant predicates', async () => {
    const contact = {
      id: '44444444-4444-4444-8444-444444444444',
      tenant_id: PRINCIPAL.tenantId,
      account_id: ACCOUNT.id,
      full_name: 'Ada Example',
      email: 'ada@example.test',
      phone: null,
      role_title: 'Owner',
      is_primary: true,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-02T00:00:00.000Z'),
    }
    const artifact = {
      id: '55555555-5555-4555-8555-555555555555',
      tenantId: PRINCIPAL.tenantId,
      accountId: ACCOUNT.id,
      artifactType: 'vat_certificate' as const,
      documentId: null,
      notes: null,
      uploadedAt: new Date('2026-01-03T00:00:00.000Z'),
      fileName: null,
    }
    const opportunity = {
      id: '66666666-6666-4666-8666-666666666666',
      tenant_id: PRINCIPAL.tenantId,
      account_id: ACCOUNT.id,
      project_id: null,
      rep_id: null,
      stage: 'lead' as const,
      tcv_cents: 100,
      gp_cents: 20,
      probability: 10,
      weighted_tcv_cents: 10,
      closing_date: null,
      area_sqm: null,
      opportunity_type: null,
      remarks: null,
      lost_reason: null,
      created_at: new Date('2026-01-04T00:00:00.000Z'),
      updated_at: new Date('2026-01-05T00:00:00.000Z'),
    }
    const project = {
      id: '77777777-7777-4777-8777-777777777777',
      tenant_id: PRINCIPAL.tenantId,
      account_id: ACCOUNT.id,
      name: 'Office Fit-out',
      client: 'Acme Office',
      location: null,
      project_type: null,
      status: 'lead' as const,
      total_sqm: null,
      notes: null,
      created_by: null,
      created_at: new Date('2026-01-06T00:00:00.000Z'),
      updated_at: new Date('2026-01-07T00:00:00.000Z'),
    }

    const accountLimit = vi.fn().mockResolvedValue([ACCOUNT])
    const accountWhere = vi.fn().mockReturnValue({ limit: accountLimit })
    const accountFrom = vi.fn().mockReturnValue({ where: accountWhere })
    const contactLimit = vi.fn().mockResolvedValue([contact])
    const contactOrder = vi.fn().mockReturnValue({ limit: contactLimit })
    const contactWhere = vi.fn().mockReturnValue({ orderBy: contactOrder })
    const contactFrom = vi.fn().mockReturnValue({ where: contactWhere })
    const kycLimit = vi.fn().mockResolvedValue([artifact])
    const kycOrder = vi.fn().mockReturnValue({ limit: kycLimit })
    const kycWhere = vi.fn().mockReturnValue({ orderBy: kycOrder })
    const kycJoin = vi.fn().mockReturnValue({ where: kycWhere })
    const kycFrom = vi.fn().mockReturnValue({ leftJoin: kycJoin })
    const opportunityLimit = vi.fn().mockResolvedValue([opportunity])
    const opportunityOrder = vi.fn().mockReturnValue({ limit: opportunityLimit })
    const opportunityWhere = vi.fn().mockReturnValue({ orderBy: opportunityOrder })
    const opportunityFrom = vi.fn().mockReturnValue({ where: opportunityWhere })
    const projectLimit = vi.fn().mockResolvedValue([project])
    const projectOrder = vi.fn().mockReturnValue({ limit: projectLimit })
    const projectWhere = vi.fn().mockReturnValue({ orderBy: projectOrder })
    const projectFrom = vi.fn().mockReturnValue({ where: projectWhere })
    const countWhere = vi.fn().mockResolvedValue([{ count: 1 }])
    const countFrom = vi.fn().mockReturnValue({ where: countWhere })
    const select = vi
      .fn()
      .mockReturnValueOnce({ from: accountFrom })
      .mockReturnValueOnce({ from: contactFrom })
      .mockReturnValueOnce({ from: kycFrom })
      .mockReturnValueOnce({ from: opportunityFrom })
      .mockReturnValueOnce({ from: projectFrom })
      .mockReturnValueOnce({ from: countFrom })
    const database = { client: { select } } as unknown as DatabaseService

    const service = new AccountsService(database)
    await expect(service.read(ACCOUNT.id, PRINCIPAL)).resolves.toMatchObject({
      account: {
        id: ACCOUNT.id,
        tenantId: PRINCIPAL.tenantId,
        opportunityCount: 1,
      },
      contacts: [expect.objectContaining({ tenantId: PRINCIPAL.tenantId })],
      kycArtifacts: [expect.objectContaining({ tenantId: PRINCIPAL.tenantId })],
      opportunities: [expect.objectContaining({ tenantId: PRINCIPAL.tenantId })],
      projects: [expect.objectContaining({ tenantId: PRINCIPAL.tenantId })],
    })

    for (const predicate of [
      accountWhere,
      contactWhere,
      kycWhere,
      opportunityWhere,
      projectWhere,
      countWhere,
    ]) {
      const querySql = new PgDialect().sqlToQuery(predicate.mock.calls[0]?.[0])
      expect(querySql.sql).toContain('tenant_id')
      expect(querySql.params).toContain(PRINCIPAL.tenantId)
    }
  })

  it('does not disclose a detail graph for another tenant', async () => {
    const accountLimit = vi.fn().mockResolvedValue([])
    const accountWhere = vi.fn().mockReturnValue({ limit: accountLimit })
    const database = {
      client: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({ where: accountWhere }),
        }),
      },
    } as unknown as DatabaseService

    await expect(
      new AccountsService(database).read(ACCOUNT.id, PRINCIPAL)
    ).rejects.toThrow('Account not found')
  })
})
