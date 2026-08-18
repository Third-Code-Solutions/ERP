import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import {
  auditLog,
  bomLineItems,
  boms,
  boqDivisions,
  db,
  documents,
  drawingRevisions,
  projects,
  projectLocations,
  takeoffImports,
  takeoffMappingProfiles,
  takeoffUnresolvedItems,
  tenants,
  users,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { CapabilityGuard } from '../src/auth/capability.guard'
import type { SupabaseIdentityService } from '../src/auth/supabase-identity.service'
import { SupabaseJwtGuard } from '../src/auth/supabase-jwt.guard'
import { AuditService } from '../src/audit/audit.service'
import { TakeoffImportController } from '../src/cad/takeoff-import.controller'
import { TakeoffImportService } from '../src/cad/takeoff-import.service'
import { DatabaseService } from '../src/database/database.service'
import { POST } from '../../web/src/app/api/bom/takeoff-import/route'

const authMocks = vi.hoisted(() => ({
  can: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  requireUserProfile: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  can: authMocks.can,
  createSupabaseServerClient: authMocks.createSupabaseServerClient,
  requireUserProfile: authMocks.requireUserProfile,
}))

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip

suite('generic takeoff import Web-to-Core disposable integration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('uses Core for tenant-safe preview and atomic re-import without losing DUPA state', async () => {
    const tenantId = randomUUID()
    const foreignTenantId = randomUUID()
    const userId = randomUUID()
    const projectId = randomUUID()
    const bomId = randomUUID()
    const documentId = randomUUID()
    const foreignProjectId = randomUUID()
    const foreignBomId = randomUUID()
    const foreignDocumentId = randomUUID()
    const suffix = randomUUID().slice(0, 12)
    const accessToken = 'takeoff-import-verified-token'
    const database = new DatabaseService()
    let app: INestApplication | undefined

    authMocks.requireUserProfile.mockResolvedValue({
      user: { id: userId },
      tenantId,
      role: 'commercial',
      email: `takeoff-${suffix}@integration.test`,
      fullName: 'Takeoff Import User',
    })
    authMocks.can.mockReturnValue(true)
    authMocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: accessToken } },
        }),
      },
    })

    try {
      await db.insert(tenants).values([
        {
          id: tenantId,
          name: 'Takeoff Import Tenant',
          slug: `takeoff-import-${suffix}`,
        },
        {
          id: foreignTenantId,
          name: 'Foreign Takeoff Tenant',
          slug: `foreign-takeoff-${suffix}`,
        },
      ])
      await db.insert(users).values({
        id: userId,
        tenant_id: tenantId,
        email: `takeoff-${suffix}@integration.test`,
        full_name: 'Takeoff Import User',
        role: 'commercial',
      })
      await db.insert(projects).values([
        {
          id: projectId,
          tenant_id: tenantId,
          name: 'Takeoff Import Project',
          client: 'Takeoff Client',
          status: 'active',
          project_type: 'fit_out',
          created_by: userId,
        },
        {
          id: foreignProjectId,
          tenant_id: foreignTenantId,
          name: 'Foreign Takeoff Project',
          client: 'Foreign Client',
          status: 'active',
          project_type: 'fit_out',
          created_by: null,
        },
      ])
      await db.insert(boms).values([
        {
          id: bomId,
          tenant_id: tenantId,
          project_id: projectId,
          created_by: userId,
          label: 'Takeoff Import BOM',
        },
        {
          id: foreignBomId,
          tenant_id: foreignTenantId,
          project_id: foreignProjectId,
          created_by: null,
          label: 'Foreign Takeoff BOM',
        },
      ])
      await db.insert(documents).values([
        {
          id: documentId,
          tenant_id: tenantId,
          project_id: projectId,
          uploaded_by: userId,
          document_type: 'pdf',
          file_name: 'vision-scope.pdf',
          storage_path: `${tenantId}/${projectId}/vision-scope.pdf`,
          mime_type: 'application/pdf',
          size_bytes: 1_024,
        },
        {
          id: foreignDocumentId,
          tenant_id: foreignTenantId,
          project_id: foreignProjectId,
          uploaded_by: null,
          document_type: 'pdf',
          file_name: 'foreign-vision-scope.pdf',
          storage_path: `${foreignTenantId}/${foreignProjectId}/vision-scope.pdf`,
          mime_type: 'application/pdf',
          size_bytes: 1_024,
        },
      ])

      const service = new TakeoffImportService(database, new AuditService())
      const identity = {
        verifyAccessToken: vi.fn().mockResolvedValue({ userId }),
      } as unknown as SupabaseIdentityService
      const moduleRef = await Test.createTestingModule({
        controllers: [TakeoffImportController],
        providers: [{ provide: TakeoffImportService, useValue: service }],
      }).compile()
      app = moduleRef.createNestApplication()
      const reflector = new Reflector()
      app.useGlobalGuards(
        new SupabaseJwtGuard(identity, reflector, database),
        new CapabilityGuard(reflector)
      )
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      )
      await app.listen(0, '127.0.0.1')
      const address = app.getHttpServer().address() as AddressInfo
      vi.stubEnv('ERP_CORE_API_URL', `http://127.0.0.1:${address.port}`)

      const csv = [
        'Row,Description,Qty,UOM,Division,Location',
        'A-001,Suspended ceiling,12,sqm,Finishes,Level 2',
        'A-002,Unresolved item,1,box,,Level 2',
        'A-003,Fractional concrete,0.1,cu.m,Concrete,Level 2',
      ].join('\n')
      const mapping = JSON.stringify({
        sourceRowKey: 'Row',
        description: 'Description',
        quantity: 'Qty',
        unit: 'UOM',
        division: 'Division',
        location: 'Location',
      })
      const makeRequest = (
        mode: 'preview' | 'commit',
        csvPayload = csv,
        requestedBomId = bomId
      ): NextRequest => {
        const form = new FormData()
        form.set(
          'file',
          new File([csvPayload], 'takeoff.csv', { type: 'text/csv' })
        )
        form.set('bom_id', requestedBomId)
        form.set('source', 'generic')
        form.set('drawing_revision_key', 'drawing-1')
        form.set('mode', mode)
        form.set('mapping', mapping)
        return new Request('http://localhost/api/bom/takeoff-import', {
          method: 'POST',
          body: form,
        }) as unknown as NextRequest
      }

      const preview = await POST(makeRequest('preview'))
      expect(preview.status).toBe(200)
      await expect(preview.json()).resolves.toMatchObject({
        ok: true,
        mode: 'preview',
        tenantId,
        bomId,
        rowCount: 3,
        unresolvedCount: 3,
      })

      const foreignPreview = await POST(
        makeRequest('preview', csv, foreignBomId)
      )
      expect(foreignPreview.status).toBe(404)
      await expect(foreignPreview.json()).resolves.toMatchObject({
        ok: false,
        error: { code: 'BOM_NOT_FOUND' },
      })

      const firstCommit = await POST(makeRequest('commit'))
      expect(firstCommit.status).toBe(200)
      const firstPayload = (await firstCommit.json()) as {
        ok: boolean
        mode: string
        importId: string
        linesUpserted: number
        unresolvedCount: number
        bomId: string
      }
      expect(firstPayload).toMatchObject({
        ok: true,
        mode: 'commit',
        linesUpserted: 3,
        unresolvedCount: 3,
        bomId,
      })

      const [line] = await db
        .select({ id: bomLineItems.id })
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.tenant_id, tenantId),
            eq(bomLineItems.takeoff_import_id, firstPayload.importId),
            eq(bomLineItems.source_row_key, 'A-001')
          )
        )
      expect(line).toBeDefined()
      await db
        .update(bomLineItems)
        .set({
          unit_rate_source: 'dupa',
          unit_cost_cents: 777,
          line_total_cents: 777,
          notes: '[VENDOR:11111111-1111-1111-1111-111111111111:Vendor One]',
        })
        .where(eq(bomLineItems.id, line!.id))

      const changedCsv = [
        'Row,Description,Qty,UOM,Division,Location',
        'A-001,Changed ceiling,18,sqm,Finishes,Level 2',
        'A-002,Unresolved item,1,box,,Level 2',
        'A-003,Fractional concrete,0.1,cu.m,Concrete,Level 2',
      ].join('\n')
      const secondCommit = await POST(makeRequest('commit', changedCsv))
      expect(secondCommit.status).toBe(200)
      const secondPayload = (await secondCommit.json()) as {
        importId: string
        linesUpserted: number
        unresolvedCount: number
      }
      expect(secondPayload).toMatchObject({
        importId: firstPayload.importId,
        linesUpserted: 3,
        unresolvedCount: 3,
      })

      const [persisted] = await db
        .select({
          description: bomLineItems.description,
          quantity: bomLineItems.quantity,
          unitCostCents: bomLineItems.unit_cost_cents,
          lineTotalCents: bomLineItems.line_total_cents,
          notes: bomLineItems.notes,
        })
        .from(bomLineItems)
        .where(eq(bomLineItems.id, line!.id))
      const importedLines = await db
        .select({ id: bomLineItems.id })
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.tenant_id, tenantId),
            eq(bomLineItems.takeoff_import_id, firstPayload.importId)
          )
        )
      const [fractionalLine] = await db
        .select({
          quantity: bomLineItems.quantity,
          classificationStatus: bomLineItems.classification_status,
        })
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.tenant_id, tenantId),
            eq(bomLineItems.takeoff_import_id, firstPayload.importId),
            eq(bomLineItems.source_row_key, 'A-003')
          )
        )
      const fractionalIssues = await db
        .select({ reasonCode: takeoffUnresolvedItems.reason_code })
        .from(takeoffUnresolvedItems)
        .where(
          and(
            eq(takeoffUnresolvedItems.tenant_id, tenantId),
            eq(takeoffUnresolvedItems.takeoff_import_id, firstPayload.importId),
            eq(takeoffUnresolvedItems.source_row_key, 'A-003'),
            eq(takeoffUnresolvedItems.status, 'pending')
          )
        )
      const [audit] = await db
        .select({
          actorId: auditLog.actor_id,
          diff: auditLog.diff,
          entityId: auditLog.entity_id,
          entityType: auditLog.entity_type,
        })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantId),
            eq(auditLog.entity_type, 'takeoff_import'),
            eq(auditLog.entity_id, firstPayload.importId)
          )
        )

      expect(importedLines).toHaveLength(3)
      expect(persisted).toMatchObject({
        description: 'Suspended ceiling',
        quantity: 12,
        unitCostCents: 777,
        lineTotalCents: 777,
      })
      expect(persisted?.notes).toContain(
        'VENDOR:11111111-1111-1111-1111-111111111111'
      )
      expect(fractionalLine).toEqual({
        quantity: 0,
        classificationStatus: 'review',
      })
      expect(fractionalIssues).toEqual([{ reasonCode: 'INVALID_QUANTITY' }])
      expect(audit).toMatchObject({
        actorId: userId,
        entityId: firstPayload.importId,
        entityType: 'takeoff_import',
        diff: expect.objectContaining({ authority: 'erp_core' }),
      })

      await db
        .update(boms)
        .set({ status: 'approved' })
        .where(eq(boms.id, bomId))
      const approvedImport = await POST(makeRequest('commit'))
      expect(approvedImport.status).toBe(409)

      const aiDocumentCommand = {
        mode: 'commit' as const,
        target: 'ai_document' as const,
        projectId,
        documentId,
        sourceModel: 'gpt-4o-mini',
        source: 'ai-document',
        drawingRevisionKey: `document:${documentId}`,
        fileName: 'vision-scope.pdf',
        contentSha256: 'b'.repeat(64),
        mapping: {
          sourceRowKey: 'vision.code + row index',
          description: 'model.description',
          quantity: 'model.quantity',
          unit: 'model.unit',
          division: 'manual assignment required',
        },
        missingColumns: [],
        rows: [
          {
            sourceRowKey: 'vision-A-001-1',
            description: 'Suspended ceiling',
            quantity: 12,
            unit: 'sqm',
            division: null,
            location: null,
            itemNo: 'A-001',
            notes: 'Sheet A-2',
            raw: {
              code: 'A-001',
              description: 'Suspended ceiling',
              quantity: 12,
              unit: 'sqm',
            },
          },
        ],
      }
      const aiCandidateResponse = await fetch(
        `http://127.0.0.1:${address.port}/v1/boms/takeoff-import`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(aiDocumentCommand),
        }
      )
      expect(aiCandidateResponse.status).toBe(200)
      const aiCandidatePayload = (await aiCandidateResponse.json()) as {
        bomId: string
        importId: string
        linesUpserted: number
        unresolvedCount: number
      }
      expect(aiCandidatePayload).toMatchObject({
        linesUpserted: 1,
        unresolvedCount: 2,
      })

      const [candidateBom] = await db
        .select({
          id: boms.id,
          projectId: boms.project_id,
          status: boms.status,
          totalCostCents: boms.total_cost_cents,
          tcvCents: boms.tcv_cents,
          notes: boms.notes,
        })
        .from(boms)
        .where(
          and(
            eq(boms.id, aiCandidatePayload.bomId),
            eq(boms.tenant_id, tenantId)
          )
        )
      const [candidateLine] = await db
        .select({
          aiDrafted: bomLineItems.ai_drafted,
          sourceModel: bomLineItems.source_model,
          unitRateSource: bomLineItems.unit_rate_source,
          classificationStatus: bomLineItems.classification_status,
          unitCostCents: bomLineItems.unit_cost_cents,
          markupBps: bomLineItems.markup_bps,
          lineTotalCents: bomLineItems.line_total_cents,
        })
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.tenant_id, tenantId),
            eq(bomLineItems.takeoff_import_id, aiCandidatePayload.importId),
            eq(bomLineItems.source_row_key, 'vision-A-001-1')
          )
        )
      const candidateIssues = await db
        .select({ reasonCode: takeoffUnresolvedItems.reason_code })
        .from(takeoffUnresolvedItems)
        .where(
          and(
            eq(takeoffUnresolvedItems.tenant_id, tenantId),
            eq(takeoffUnresolvedItems.takeoff_import_id, aiCandidatePayload.importId),
            eq(takeoffUnresolvedItems.status, 'pending')
          )
        )

      expect(candidateBom).toMatchObject({
        projectId,
        status: 'draft',
        totalCostCents: 0,
        tcvCents: 0,
      })
      expect(candidateBom?.notes).toContain(`ai_document:${documentId}`)
      expect(candidateLine).toMatchObject({
        aiDrafted: true,
        sourceModel: 'gpt-4o-mini',
        unitRateSource: 'manual',
        classificationStatus: 'review',
        unitCostCents: 0,
        markupBps: 0,
        lineTotalCents: 0,
      })
      expect(candidateIssues.map((issue) => issue.reasonCode).sort()).toEqual([
        'MISSING_DIVISION',
        'NO_CATALOG_MATCH',
      ])

      const repeatCandidateResponse = await fetch(
        `http://127.0.0.1:${address.port}/v1/boms/takeoff-import`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(aiDocumentCommand),
        }
      )
      expect(repeatCandidateResponse.status).toBe(200)
      await expect(repeatCandidateResponse.json()).resolves.toMatchObject({
        bomId: aiCandidatePayload.bomId,
        importId: aiCandidatePayload.importId,
      })

      const foreignCandidateResponse = await fetch(
        `http://127.0.0.1:${address.port}/v1/boms/takeoff-import`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            ...aiDocumentCommand,
            projectId: foreignProjectId,
            documentId: foreignDocumentId,
            drawingRevisionKey: `document:${foreignDocumentId}`,
          }),
        }
      )
      expect(foreignCandidateResponse.status).toBe(404)
      expect(identity.verifyAccessToken).toHaveBeenCalledWith(accessToken)
    } finally {
      await app?.close()
      await db.transaction(async (transaction) => {
        await transaction
          .delete(takeoffUnresolvedItems)
          .where(eq(takeoffUnresolvedItems.tenant_id, tenantId))
        await transaction
          .delete(bomLineItems)
          .where(eq(bomLineItems.tenant_id, tenantId))
        await transaction
          .delete(takeoffImports)
          .where(eq(takeoffImports.tenant_id, tenantId))
        await transaction
          .delete(takeoffMappingProfiles)
          .where(eq(takeoffMappingProfiles.tenant_id, tenantId))
        await transaction
          .delete(drawingRevisions)
          .where(eq(drawingRevisions.tenant_id, tenantId))
        await transaction
          .delete(documents)
          .where(eq(documents.tenant_id, tenantId))
        await transaction
          .delete(projectLocations)
          .where(eq(projectLocations.tenant_id, tenantId))
        await transaction
          .delete(boqDivisions)
          .where(eq(boqDivisions.tenant_id, tenantId))
        await transaction.delete(auditLog).where(eq(auditLog.tenant_id, tenantId))
        await transaction.delete(boms).where(eq(boms.tenant_id, tenantId))
        await transaction
          .delete(projects)
          .where(eq(projects.tenant_id, tenantId))
        await transaction
          .delete(boms)
          .where(eq(boms.tenant_id, foreignTenantId))
        await transaction
          .delete(documents)
          .where(eq(documents.tenant_id, foreignTenantId))
        await transaction
          .delete(projects)
          .where(eq(projects.tenant_id, foreignTenantId))
        // Tenant deletion is deliberately omitted: database audit triggers
        // retain immutable tenant evidence in this shared disposable lane.
      })
    }
  }, 45_000)
})
