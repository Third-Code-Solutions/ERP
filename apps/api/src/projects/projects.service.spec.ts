import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import type {
  CreateProjectCommand,
  ProjectListQuery,
  UpdateProjectCommand,
} from '@third-code-erp/shared-types'
import { projectCreateRequests, users } from '@third-code-erp/database/schema'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectsService } from './projects.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}

const UPDATED_AT = new Date('2026-07-27T08:00:00.000Z')
const IDEMPOTENCY_KEY = 'project-create-1'

const EXISTING = {
  id: '33333333-3333-4333-8333-333333333333',
  tenant_id: PRINCIPAL.tenantId,
  account_id: null,
  name: 'Old Project',
  client: 'Old Client',
  location: null,
  project_type: 'mep' as const,
  status: 'active' as const,
  total_sqm: 100,
  notes: null,
  created_by: PRINCIPAL.userId,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: UPDATED_AT,
}

const READ_PROJECT = {
  ...EXISTING,
  account_id: '55555555-5555-4555-8555-555555555555',
  created_by: PRINCIPAL.userId,
}

const COMMAND: UpdateProjectCommand = {
  name: 'Updated Project',
  client: 'Updated Client',
  status: 'active',
  projectType: 'fit_out',
  totalSqm: 125,
  location: 'Makati',
  notes: 'Controlled update',
  expectedUpdatedAt: UPDATED_AT.toISOString(),
}

function harness(
  existingRows = [EXISTING],
  createEnabled = true,
  membershipRows = [
    {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    },
  ]
) {
  const requestRecord = {
    id: '44444444-4444-4444-8444-444444444444',
    requestHash: '',
    state: 'processing' as 'processing' | 'succeeded',
    result: null as unknown,
  }
  const forUpdate = vi.fn().mockResolvedValue(existingRows)
  const limit = vi.fn().mockReturnValue({ for: forUpdate })
  const whereSelect = vi.fn().mockReturnValue({ limit })
  const requestForUpdate = vi.fn().mockResolvedValue([requestRecord])
  const requestLimit = vi.fn().mockReturnValue({ for: requestForUpdate })
  const requestWhere = vi.fn().mockReturnValue({ limit: requestLimit })
  const membershipForUpdate = vi.fn().mockResolvedValue(membershipRows)
  const membershipLimit = vi.fn().mockReturnValue({ for: membershipForUpdate })
  const membershipWhere = vi.fn().mockReturnValue({ limit: membershipLimit })
  const from = vi.fn((table: unknown) => ({
    where:
      table === projectCreateRequests
        ? requestWhere
        : table === users
          ? membershipWhere
          : whereSelect,
  }))
  const select = vi.fn().mockReturnValue({ from })

  const returning = vi.fn().mockResolvedValue([
    {
      ...EXISTING,
      name: COMMAND.name,
      client: COMMAND.client,
      project_type: COMMAND.projectType,
      total_sqm: COMMAND.totalSqm,
      location: COMMAND.location,
      notes: COMMAND.notes,
      updated_at: new Date('2026-07-27T09:00:00.000Z'),
    },
  ])
  const whereUpdate = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where: whereUpdate })
  const completeReturning = vi.fn().mockResolvedValue([
    { id: requestRecord.id },
  ])
  const completeWhere = vi.fn().mockReturnValue({ returning: completeReturning })
  const completeSet = vi.fn().mockReturnValue({ where: completeWhere })
  const update = vi.fn((table: unknown) => ({
    set: table === projectCreateRequests ? completeSet : set,
  }))

  const insertReturning = vi.fn().mockResolvedValue([EXISTING])
  const requestConflict = vi.fn().mockResolvedValue(undefined)
  const values = vi.fn((payload: Record<string, unknown>) => {
    if (
      !requestRecord.requestHash &&
      typeof payload.request_hash === 'string'
    ) {
      requestRecord.requestHash = payload.request_hash
    }
    return {
      returning: insertReturning,
      onConflictDoNothing: requestConflict,
    }
  })
  const insert = vi.fn().mockReturnValue({ values })

  const transactionClient = { select, update, insert }
  const transaction = vi
    .fn()
    .mockImplementation(
      async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient)
    )
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditService
  const config = {
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'ERP_PROJECT_CREATE_WRITES_ENABLED'
        ? createEnabled
        : key === 'ERP_PROJECT_CREATE_WRITES_TENANT_IDS'
          ? [PRINCIPAL.tenantId]
          : fallback
    ),
  } as unknown as import('@nestjs/config').ConfigService
  const service = new ProjectsService(config, database, audit)

  return {
    service,
    transaction,
    transactionClient,
    audit,
    set,
    values,
    insert,
    requestRecord,
    membershipForUpdate,
  }
}

function readHarness(rows = [READ_PROJECT]) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  const database = {
    client: { select },
  } as unknown as DatabaseService
  const service = new ProjectsService(
    {} as import('@nestjs/config').ConfigService,
    database,
    {} as AuditService
  )
  return { service, select, where, limit }
}

function listHarness(rows = [READ_PROJECT], total = rows.length) {
  const rowOffset = vi.fn().mockResolvedValue(rows)
  const rowLimit = vi.fn().mockReturnValue({ offset: rowOffset })
  const rowOrderBy = vi.fn().mockReturnValue({ limit: rowLimit })
  const rowWhere = vi.fn().mockReturnValue({ orderBy: rowOrderBy })
  const rowFrom = vi.fn().mockReturnValue({ where: rowWhere })
  const countWhere = vi.fn().mockResolvedValue([{ count: total }])
  const countFrom = vi.fn().mockReturnValue({ where: countWhere })
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: rowFrom })
    .mockReturnValueOnce({ from: countFrom })
  const database = {
    client: { select },
  } as unknown as DatabaseService
  const service = new ProjectsService(
    {} as import('@nestjs/config').ConfigService,
    database,
    {} as AuditService
  )
  return { service, select, rowWhere, rowLimit, rowOffset, countWhere }
}

describe('ProjectsService', () => {
  it('reads a project only inside the authenticated tenant scope', async () => {
    const probe = readHarness()

    await expect(
      probe.service.read(EXISTING.id, PRINCIPAL)
    ).resolves.toEqual({
      id: READ_PROJECT.id,
      tenantId: PRINCIPAL.tenantId,
      name: READ_PROJECT.name,
      client: READ_PROJECT.client,
      status: READ_PROJECT.status,
      projectType: READ_PROJECT.project_type,
      totalSqm: READ_PROJECT.total_sqm,
      location: READ_PROJECT.location,
      notes: READ_PROJECT.notes,
      createdAt: READ_PROJECT.created_at.toISOString(),
      updatedAt: READ_PROJECT.updated_at.toISOString(),
      accountId: READ_PROJECT.account_id,
      createdBy: READ_PROJECT.created_by,
    })
    expect(probe.limit).toHaveBeenCalledWith(1)
  })

  it('does not disclose a project outside the authenticated tenant', async () => {
    const probe = readHarness([])

    await expect(
      probe.service.read(EXISTING.id, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('lists only tenant-scoped projects with bounded filters and pagination', async () => {
    const probe = listHarness([READ_PROJECT], 21)
    const query: ProjectListQuery = {
      q: 'Old',
      status: 'active',
      projectType: 'mep',
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
          id: READ_PROJECT.id,
          tenantId: PRINCIPAL.tenantId,
          createdBy: PRINCIPAL.userId,
        }),
      ],
    })
    expect(probe.rowLimit).toHaveBeenCalledWith(20)
    expect(probe.rowOffset).toHaveBeenCalledWith(20)
    const querySql = new (await import('drizzle-orm/pg-core')).PgDialect().sqlToQuery(
      probe.rowWhere.mock.calls[0]?.[0]
    )
    expect(querySql.sql).toContain('"projects"."tenant_id" = $1')
    expect(querySql.params).toEqual([
      PRINCIPAL.tenantId,
      '%Old%',
      '%Old%',
      'active',
      'mep',
    ])
  })

  it('keeps empty project collections on one page', async () => {
    const probe = listHarness([], 0)
    await expect(
      probe.service.list(
        {
          q: undefined,
          status: undefined,
          projectType: undefined,
          sort: 'created_at',
          order: 'desc',
          page: 1,
          limit: 20,
        },
        PRINCIPAL
      )
    ).resolves.toMatchObject({ total: 0, totalPages: 1, rows: [] })
  })

  it('requires a bounded Idempotency-Key before opening a transaction', async () => {
    const probe = harness()
    const command: CreateProjectCommand = {
      name: 'New Project',
      client: 'New Client',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
    }

    await expect(
      probe.service.create(command, PRINCIPAL, undefined)
    ).rejects.toMatchObject({ status: 400 })
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('keeps project creation fail-closed until the tenant canary is enabled', async () => {
    const probe = harness([EXISTING], false)
    const command: CreateProjectCommand = {
      name: 'New Project',
      client: 'New Client',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
    }

    await expect(
      probe.service.create(command, PRINCIPAL, IDEMPOTENCY_KEY)
    ).rejects.toMatchObject({ status: 503 })
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('rechecks the locked membership before project creation', async () => {
    const probe = harness([EXISTING], true, [
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'viewer',
        email: PRINCIPAL.email,
      },
    ])
    const command: CreateProjectCommand = {
      name: 'New Project',
      client: 'New Client',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
    }

    await expect(
      probe.service.create(command, PRINCIPAL, IDEMPOTENCY_KEY)
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.membershipForUpdate).toHaveBeenCalledOnce()
    expect(probe.insert).not.toHaveBeenCalled()
    expect(probe.audit.stampActor).not.toHaveBeenCalled()
  })

  it('creates tenant-scoped Project evidence inside one transaction', async () => {
    const probe = harness()
    const command: CreateProjectCommand = {
      name: 'New Project',
      client: 'New Client',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
    }

    const result = await probe.service.create(
      command,
      PRINCIPAL,
      IDEMPOTENCY_KEY
    )

    expect(probe.transaction).toHaveBeenCalledOnce()
    expect(probe.audit.stampActor).toHaveBeenCalledWith(
      probe.transactionClient,
      PRINCIPAL
    )
    expect(probe.values).toHaveBeenCalledWith({
      tenant_id: PRINCIPAL.tenantId,
      created_by: PRINCIPAL.userId,
      name: command.name,
      client: command.client,
      status: command.status,
      project_type: null,
      total_sqm: null,
      location: null,
      notes: null,
    })
    expect(result).toMatchObject({
      id: EXISTING.id,
      tenantId: PRINCIPAL.tenantId,
      name: EXISTING.name,
    })
    expect(probe.insert).toHaveBeenCalledWith(projectCreateRequests)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      probe.transactionClient,
      expect.objectContaining({
        entityType: 'project',
        entityId: EXISTING.id,
        action: 'create',
      })
    )
  })

  it('replays a succeeded request without inserting a second Project', async () => {
    const probe = harness()
    const command: CreateProjectCommand = {
      name: 'New Project',
      client: 'New Client',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
    }

    const first = await probe.service.create(
      command,
      PRINCIPAL,
      IDEMPOTENCY_KEY
    )
    probe.requestRecord.state = 'succeeded'
    probe.requestRecord.result = first
    const projectInsertCalls = probe.insert.mock.calls.filter(
      ([table]) => table !== projectCreateRequests
    ).length

    await expect(
      probe.service.create(command, PRINCIPAL, IDEMPOTENCY_KEY)
    ).resolves.toEqual(first)

    expect(
      probe.insert.mock.calls.filter(
        ([table]) => table !== projectCreateRequests
      )
    ).toHaveLength(projectInsertCalls)
  })

  it('rejects same-key requests with a different payload', async () => {
    const probe = harness()
    const command: CreateProjectCommand = {
      name: 'New Project',
      client: 'New Client',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
    }
    await probe.service.create(command, PRINCIPAL, IDEMPOTENCY_KEY)

    await expect(
      probe.service.create(
        { ...command, name: 'Different Project' },
        PRINCIPAL,
        IDEMPOTENCY_KEY
      )
    ).rejects.toMatchObject({ status: 409 })
  })

  it('updates tenant-scoped Project evidence inside one transaction', async () => {
    const probe = harness()

    const result = await probe.service.update(
      EXISTING.id,
      COMMAND,
      PRINCIPAL
    )

    expect(probe.transaction).toHaveBeenCalledOnce()
    expect(probe.audit.stampActor).toHaveBeenCalledWith(
      probe.transactionClient,
      PRINCIPAL
    )
    expect(probe.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: COMMAND.name,
        client: COMMAND.client,
        project_type: COMMAND.projectType,
      })
    )
    expect(result).toMatchObject({
      id: EXISTING.id,
      tenantId: PRINCIPAL.tenantId,
      name: COMMAND.name,
    })
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      probe.transactionClient,
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        actorId: PRINCIPAL.userId,
        entityType: 'project',
        entityId: EXISTING.id,
        action: 'update',
        diff: {
          before: expect.objectContaining({
            name: EXISTING.name,
            status: EXISTING.status,
          }),
          after: expect.objectContaining({
            name: COMMAND.name,
            project_type: COMMAND.projectType,
          }),
        },
      })
    )
  })

  it('rejects a Project outside the caller tenant scope', async () => {
    const probe = harness([])

    await expect(
      probe.service.update(EXISTING.id, COMMAND, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
  })

  it('rejects stale optimistic-concurrency evidence', async () => {
    const probe = harness()

    await expect(
      probe.service.update(
        EXISTING.id,
        {
          ...COMMAND,
          expectedUpdatedAt: '2026-07-27T07:00:00.000Z',
        },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
  })
})
