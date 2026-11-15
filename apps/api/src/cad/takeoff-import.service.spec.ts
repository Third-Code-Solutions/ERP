import 'reflect-metadata'

import { NotFoundException } from '@nestjs/common'
import type { TakeoffImportCommand } from '@third-code-erp/shared-types'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { TakeoffImportService } from './takeoff-import.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'owner',
  email: 'owner@example.test',
}

const BASE = {
  mode: 'commit',
  drawingRevisionKey: 'drawing-1',
  fileName: 'takeoff.csv',
  contentSha256: 'a'.repeat(64),
  mapping: { description: 'Description', quantity: 'Qty', unit: 'UOM' },
  missingColumns: [],
  rows: [],
} as const

// The second select is the project (ai_document) or BOM (existing_bom) read;
// it finds nothing because the project is retired.
function harness() {
  const wheres: unknown[] = []
  const select = vi.fn()
  for (const rows of [[{ tenantId: PRINCIPAL.tenantId, role: 'owner', email: PRINCIPAL.email }], []]) {
    const node: Record<string, unknown> = {}
    node.from = vi.fn(() => node)
    node.where = vi.fn((condition: unknown) => {
      wheres.push(condition)
      return node
    })
    node.limit = vi.fn(() => node)
    node.for = vi.fn(async () => rows)
    select.mockReturnValueOnce(node)
  }
  const insert = vi.fn()
  const transactionClient = { select, insert }
  const database = {
    client: {
      transaction: async (callback: (tx: unknown) => unknown) => callback(transactionClient),
    },
  } as unknown as DatabaseService
  const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
  const service = new TakeoffImportService(database, audit as unknown as AuditService)
  const targetWhere = () => new PgDialect().sqlToQuery(wheres[1] as SQL).sql
  return { service, insert, audit, targetWhere }
}

describe('takeoff import refuses a retired project', () => {
  it('commits into an existing BOM only while its project is live', async () => {
    const h = harness()
    const command = {
      ...BASE,
      target: 'existing_bom',
      bomId: '33333333-3333-4333-8333-333333333333',
      source: 'generic',
    } as unknown as TakeoffImportCommand

    await expect(h.service.execute(command, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)

    expect(h.targetWhere()).toContain(
      'exists (select "id" from "projects" where ("projects"."id" = "boms"."project_id" and "projects"."tenant_id" = $'
    )
    expect(h.targetWhere()).toContain('"projects"."deleted_at" is null')
    expect(h.insert).not.toHaveBeenCalled()
    expect(h.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('creates an AI-document BOM only for a live project', async () => {
    const h = harness()
    const command = {
      ...BASE,
      target: 'ai_document',
      projectId: '44444444-4444-4444-8444-444444444444',
      documentId: '55555555-5555-4555-8555-555555555555',
      sourceModel: 'model-1',
      source: 'ai-document',
    } as unknown as TakeoffImportCommand

    await expect(h.service.execute(command, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)

    expect(h.targetWhere()).toContain('"projects"."deleted_at" is null')
    expect(h.insert).not.toHaveBeenCalled()
  })
})
