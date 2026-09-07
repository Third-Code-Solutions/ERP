import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), can: vi.fn(), select: vi.fn(), insert: vi.fn(),
  transaction: vi.fn(), audit: vi.fn(), refresh: vi.fn(),
}))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.profile, can: mocks.can }))
vi.mock('@third-code-erp/database', () => ({ db: mocks }))
vi.mock('@/lib/audit', () => ({ writeAuditLog: vi.fn(), writeAuditLogInTransaction: mocks.audit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('@/lib/operations/sla-clock', () => ({ startSlaClock: vi.fn() }))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))
vi.mock('@/lib/inngest', () => ({ inngest: {} }))
vi.mock('@/lib/pdf/site-inspection-report', () => ({ buildInspectionReportHtml: vi.fn() }))
vi.mock('@/lib/erp-core-client', () => ({ changeRequestWritesUseCoreApi: vi.fn(), createChangeRequestThroughCoreApi: vi.fn() }))
vi.mock('@/server/crm/pprf-submission-service', () => ({ pprfResubmissionCommandSchema: {}, pprfSubmissionResultSchema: {}, pprfSubmissionService: {} }))
vi.mock('@/server/crm/site-inspection-workflow-service', () => ({ siteInspectionRfiCommandSchema: {}, siteInspectionSubmissionCommandSchema: {}, siteInspectionWorkflowResultSchema: {}, siteInspectionWorkflowService: {} }))

import { uploadDesignFile } from './actions'

const tenantId = '11111111-1111-4111-8111-111111111111'
const opportunityId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const documentId = '44444444-4444-4444-8444-444444444444'
const designId = '55555555-5555-4555-8555-555555555555'

function form(existing = true): FormData {
  const data = new FormData()
  data.set('opportunity_id', opportunityId)
  data.set('document_id', documentId)
  data.set('file_type', 'initial_layout')
  data.set('name', 'Layout')
  if (existing) data.set('design_file_id', designId)
  return data
}

function query(rows: object[]) {
  const lock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), { for: lock }))
  const where = vi.fn().mockReturnValue(Object.assign(Promise.resolve(rows), { limit }))
  mocks.select.mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where }) })
  return { where, lock }
}

function sqlQuery(where: ReturnType<typeof vi.fn>) {
  return new PgDialect().sqlToQuery(where.mock.calls[0]![0] as SQL)
}

function expectNoWrites() {
  expect(mocks.insert).not.toHaveBeenCalled()
  expect(mocks.audit).not.toHaveBeenCalled()
  expect(mocks.refresh).not.toHaveBeenCalled()
}

describe('design upload authorization and approved-version lock', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.profile.mockResolvedValue({ tenantId, role: 'design', user: { id: tenantId } })
    mocks.can.mockReturnValue(true)
    mocks.transaction.mockImplementation(async (work: (tx: typeof mocks) => Promise<unknown>) => work(mocks))
    mocks.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: designId }]) }) })
  })

  it('refuses roles without upload capability before accessing data', async () => {
    mocks.can.mockReturnValue(false)
    expect((await uploadDesignFile(form())).error).toContain('Forbidden')
    expect(mocks.can).toHaveBeenCalledWith('design', 'design.upload')
    expect(mocks.select).not.toHaveBeenCalled()
    expectNoWrites()
  })

  it('requires document ID and tenant plus opportunity OR linked project', async () => {
    query([{ id: opportunityId, project_id: projectId }])
    const document = query([])
    expect(await uploadDesignFile(form())).toEqual({ error: 'Document not found' })
    const rendered = sqlQuery(document.where)
    expect(rendered.params).toEqual([documentId, tenantId, opportunityId, projectId])
    expect(rendered.sql).toContain('"documents"."opportunity_id" = $3 or "documents"."project_id" = $4')
    expectNoWrites()
  })

  it('does not allow an unlinked opportunity to attach an arbitrary project document', async () => {
    query([{ id: opportunityId, project_id: null }])
    const document = query([])
    expect((await uploadDesignFile(form())).error).toBe('Document not found')
    expect(sqlQuery(document.where).params).toEqual([documentId, tenantId, opportunityId])
    expect(sqlQuery(document.where).sql).not.toContain('"project_id"')
    expectNoWrites()
  })

  it('rejects nonexistent, foreign-tenant or sibling-opportunity design IDs without creating a group', async () => {
    query([{ id: opportunityId, project_id: projectId }])
    query([{ id: documentId }])
    const existing = query([])
    expect(await uploadDesignFile(form())).toEqual({ error: 'Design file not found' })
    expect(sqlQuery(existing.where).params).toEqual([designId, tenantId, opportunityId])
    expect(existing.lock).toHaveBeenCalledWith('update')
    expectNoWrites()
  })

  it('refuses another version of a client-approved design', async () => {
    query([{ id: opportunityId, project_id: projectId }])
    query([{ id: documentId }])
    query([{ id: designId, is_client_approved: true }])
    expect((await uploadDesignFile(form())).error).toContain('locked')
    expectNoWrites()
  })

  it.each([projectId, null])('appends a valid version with document scope and linked project %s', async (linkedProject) => {
    query([{ id: opportunityId, project_id: linkedProject }])
    query([{ id: documentId }])
    const existing = query([{ id: designId, is_client_approved: false }])
    query([{ max: 2 }])
    expect(await uploadDesignFile(form())).toEqual({ design_file_id: designId, version: 3 })
    expect(existing.lock).toHaveBeenCalledWith('update')
    expect(mocks.insert).toHaveBeenCalledTimes(1)
    expect(mocks.audit).toHaveBeenCalledWith(mocks, expect.objectContaining({ tenantId, entityType: 'design_file_version' }))
  })

  it('creates a new group only when no design ID was supplied', async () => {
    query([{ id: opportunityId, project_id: null }])
    query([{ id: documentId }])
    query([{ max: 0 }])
    expect(await uploadDesignFile(form(false))).toEqual({ design_file_id: designId, version: 1 })
    expect(mocks.insert).toHaveBeenCalledTimes(2)
    expect(mocks.audit).toHaveBeenCalledTimes(2)
  })
})
