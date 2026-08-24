import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const SUBMISSION_ID = '55555555-5555-4555-8555-555555555555'
const INSPECTION_ID = '66666666-6666-4666-8666-666666666666'
const DOCUMENT_ID = '77777777-7777-4777-8777-777777777777'
const REPORT_ATTEMPT_ID = '88888888-8888-4888-8888-888888888888'
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999'
const OTHER_PROJECT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const tables = vi.hoisted(() => ({
  opportunities: {
    id: 'opportunities.id',
    tenant_id: 'opportunities.tenant_id',
    project_id: 'opportunities.project_id',
    account_id: 'opportunities.account_id',
  },
  pprfSubmissions: {
    id: 'pprf_submissions.id',
    tenant_id: 'pprf_submissions.tenant_id',
    opportunity_id: 'pprf_submissions.opportunity_id',
  },
  siteInspections: {
    id: 'site_inspections.id',
    tenant_id: 'site_inspections.tenant_id',
    opportunity_id: 'site_inspections.opportunity_id',
    client_submission_id: 'site_inspections.client_submission_id',
  },
  siteInspectionPhotos: {
    tenant_id: 'site_inspection_photos.tenant_id',
    inspection_id: 'site_inspection_photos.inspection_id',
    document_id: 'site_inspection_photos.document_id',
  },
  documents: {
    id: 'documents.id',
    tenant_id: 'documents.tenant_id',
    project_id: 'documents.project_id',
    opportunity_id: 'documents.opportunity_id',
  },
  projects: {
    id: 'projects.id',
    tenant_id: 'projects.tenant_id',
    name: 'projects.name',
    client: 'projects.client',
    location: 'projects.location',
  },
  accounts: {
    id: 'accounts.id',
    tenant_id: 'accounts.tenant_id',
    name: 'accounts.name',
    billing_address: 'accounts.billing_address',
  },
  tenants: {
    id: 'tenants.id',
    name: 'tenants.name',
    bir_tin: 'tenants.bir_tin',
    pcab_license: 'tenants.pcab_license',
  },
  users: {
    id: 'users.id',
    tenant_id: 'users.tenant_id',
    full_name: 'users.full_name',
    email: 'users.email',
  },
}))

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  rootInsertValues: vi.fn(),
  rootInsertReturning: vi.fn(),
  rootUpdateSet: vi.fn(),
  rootUpdateWhere: vi.fn(),
  txExecute: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  txInsertValues: vi.fn(),
  txInsertReturning: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createDocumentThroughCoreApi: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  buildInspectionReportHtml: vi.fn(),
  startSlaClock: vi.fn(),
  notifyRoles: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('node:crypto', () => ({
  randomUUID: () => REPORT_ATTEMPT_ID,
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    transaction: mocks.transaction,
  },
}))

vi.mock('@third-code-erp/database/schema', () => tables)

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  changeRequestWritesUseCoreApi: vi.fn(),
  createChangeRequestThroughCoreApi: vi.fn(),
  createDocumentThroughCoreApi: mocks.createDocumentThroughCoreApi,
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))

vi.mock('@/lib/operations/sla-clock', () => ({
  startSlaClock: mocks.startSlaClock,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))

vi.mock('@/lib/inngest', () => ({
  inngest: {},
}))

vi.mock('@/lib/pdf/site-inspection-report', () => ({
  buildInspectionReportHtml: mocks.buildInspectionReportHtml,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { submitInspection } from './actions'

let opportunityProjectId: string | null = PROJECT_ID

function rowsFor(table: object): unknown[] {
  if (table === tables.opportunities) {
    return [
      {
        id: OPPORTUNITY_ID,
        project_id: opportunityProjectId,
        account_id: null,
      },
    ]
  }
  if (table === tables.pprfSubmissions) return [{ id: 'pprf-1' }]
  if (table === tables.projects) {
    return [
      {
        id: PROJECT_ID,
        name: 'Project Alpha',
        client: 'Client A',
        location: 'Makati',
      },
    ]
  }
  if (table === tables.tenants) {
    return [{ name: 'Tenant A', bir_tin: null, pcab_license: null }]
  }
  if (table === tables.users) {
    return [{ full_name: 'Inspector A', email: 'inspector@example.test' }]
  }
  return []
}

function selectChain() {
  return {
    from: (table: object) => ({
      where: () => ({
        limit: async () => rowsFor(table),
      }),
    }),
  }
}

function inspectionForm(): FormData {
  const form = new FormData()
  form.set('opportunity_id', OPPORTUNITY_ID)
  form.set('client_submission_id', SUBMISSION_ID)
  form.set('site_address', '123 Test Street')
  form.set('photo_document_ids', '[]')
  return form
}

function expectedStoragePath(folderId: string): string {
  return `${TENANT_ID}/${folderId}/inspection-report-${INSPECTION_ID}-${REPORT_ATTEMPT_ID}.html`
}

describe('site inspection report document authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    opportunityProjectId = PROJECT_ID
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'admin',
    })
    mocks.can.mockReturnValue(true)
    mocks.select.mockImplementation(selectChain)
    mocks.txExecute.mockResolvedValue(undefined)
    mocks.txSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: async () => [] }),
      }),
    })
    mocks.txInsert.mockReturnValue({ values: mocks.txInsertValues })
    mocks.txInsertValues.mockReturnValue({ returning: mocks.txInsertReturning })
    mocks.txInsertReturning.mockResolvedValue([{ id: INSPECTION_ID }])
    mocks.transaction.mockImplementation(
      async (callback: (transaction: object) => Promise<unknown>) =>
        callback({
          execute: mocks.txExecute,
          select: mocks.txSelect,
          insert: mocks.txInsert,
        })
    )
    mocks.insert.mockReturnValue({ values: mocks.rootInsertValues })
    mocks.rootInsertValues.mockReturnValue({
      returning: mocks.rootInsertReturning,
    })
    mocks.rootInsertReturning.mockResolvedValue([{ id: DOCUMENT_ID }])
    mocks.update.mockReturnValue({ set: mocks.rootUpdateSet })
    mocks.rootUpdateSet.mockReturnValue({ where: mocks.rootUpdateWhere })
    mocks.rootUpdateWhere.mockResolvedValue(undefined)
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      remove: mocks.remove,
    })
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: mocks.storageFrom },
    })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.buildInspectionReportHtml.mockReturnValue(
      '<html><body>Inspection report</body></html>'
    )
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: expectedStoragePath(PROJECT_ID),
        documentType: 'other',
        status: 'created',
        created: true,
      },
    })
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
    mocks.startSlaClock.mockResolvedValue(undefined)
    mocks.notifyRoles.mockResolvedValue(undefined)
  })

  it('commits a project-linked report through Core with its opportunity association', async () => {
    await expect(submitInspection(inspectionForm())).resolves.toEqual({
      id: INSPECTION_ID,
    })

    expect(mocks.upload).toHaveBeenCalledWith(
      expectedStoragePath(PROJECT_ID),
      expect.any(Buffer),
      { contentType: 'text/html; charset=utf-8', upsert: false }
    )
    expect(mocks.createDocumentThroughCoreApi).toHaveBeenCalledWith(
      {
        projectId: PROJECT_ID,
        opportunityId: OPPORTUNITY_ID,
        storagePath: expectedStoragePath(PROJECT_ID),
        fileName: `inspection-report-${INSPECTION_ID.slice(0, 8)}.html`,
        mimeType: 'text/html; charset=utf-8',
        sizeBytes: Buffer.byteLength(
          '<html><body>Inspection report</body></html>',
          'utf8'
        ),
        description: `Site Inspection Report (auto-generated) for inspection ${INSPECTION_ID}`,
      },
      `site-inspection-report:${INSPECTION_ID}:${REPORT_ATTEMPT_ID}`
    )
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.rootUpdateSet).toHaveBeenCalledWith({
      pdf_document_id: DOCUMENT_ID,
      updated_at: expect.any(Date),
    })
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('removes the exact project object when Core rejects metadata', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'private Core diagnostics',
    })

    await expect(submitInspection(inspectionForm())).resolves.toEqual({
      id: INSPECTION_ID,
    })

    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith([expectedStoragePath(PROJECT_ID)])
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.rootUpdateSet).not.toHaveBeenCalled()
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
    warning.mockRestore()
  })

  it('removes the exact project object when the Core helper throws', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.createDocumentThroughCoreApi.mockRejectedValue(
      new Error('private thrown Core diagnostics')
    )

    await expect(submitInspection(inspectionForm())).resolves.toEqual({
      id: INSPECTION_ID,
    })

    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith([expectedStoragePath(PROJECT_ID)])
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.rootUpdateSet).not.toHaveBeenCalled()
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
    warning.mockRestore()
  })

  it('removes the exact project object when Core returns malformed success data', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
    })

    await expect(submitInspection(inspectionForm())).resolves.toEqual({
      id: INSPECTION_ID,
    })

    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith([expectedStoragePath(PROJECT_ID)])
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.rootUpdateSet).not.toHaveBeenCalled()
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
    warning.mockRestore()
  })

  it.each([
    {
      mismatch: 'tenant',
      data: { tenantId: OTHER_TENANT_ID },
    },
    {
      mismatch: 'project',
      data: { projectId: OTHER_PROJECT_ID },
    },
    {
      mismatch: 'storage path',
      data: {
        storagePath: `${TENANT_ID}/${PROJECT_ID}/another-object.html`,
      },
    },
  ])(
    'removes the exact project object for a Core $mismatch correlation mismatch',
    async ({ data }) => {
      const warning = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined)
      mocks.createDocumentThroughCoreApi.mockResolvedValue({
        ok: true,
        status: 201,
        data: {
          documentId: DOCUMENT_ID,
          tenantId: TENANT_ID,
          projectId: PROJECT_ID,
          storagePath: expectedStoragePath(PROJECT_ID),
          documentType: 'other',
          status: 'created',
          created: true,
          ...data,
        },
      })

      await expect(submitInspection(inspectionForm())).resolves.toEqual({
        id: INSPECTION_ID,
      })

      expect(mocks.remove).toHaveBeenCalledOnce()
      expect(mocks.remove).toHaveBeenCalledWith([expectedStoragePath(PROJECT_ID)])
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(mocks.rootUpdateSet).not.toHaveBeenCalled()
      expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
      warning.mockRestore()
    }
  )

  it('does not expose cleanup diagnostics or remove another path when cleanup fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'private Core diagnostics',
    })
    mocks.remove.mockResolvedValue({
      error: new Error('private Storage cleanup diagnostics'),
    })

    await expect(submitInspection(inspectionForm())).resolves.toEqual({
      id: INSPECTION_ID,
    })

    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith([expectedStoragePath(PROJECT_ID)])
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.rootUpdateSet).not.toHaveBeenCalled()
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
    warning.mockRestore()
  })

  it('reports archival failure when Core succeeds but the inspection link update fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.rootUpdateWhere.mockRejectedValue(new Error('private database diagnostics'))

    await expect(submitInspection(inspectionForm())).resolves.toEqual({
      id: INSPECTION_ID,
    })

    expect(mocks.createDocumentThroughCoreApi).toHaveBeenCalledOnce()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith(
      `[site-inspection] report archival failed for ${INSPECTION_ID}`
    )
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
    warning.mockRestore()
  })

  it('preserves direct opportunity metadata for a pre-project inspection', async () => {
    opportunityProjectId = null

    await expect(submitInspection(inspectionForm())).resolves.toEqual({
      id: INSPECTION_ID,
    })

    expect(mocks.createDocumentThroughCoreApi).not.toHaveBeenCalled()
    expect(mocks.rootInsertValues).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      project_id: null,
      opportunity_id: OPPORTUNITY_ID,
      uploaded_by: USER_ID,
      document_type: 'other',
      file_name: `inspection-report-${INSPECTION_ID.slice(0, 8)}.html`,
      storage_path: expectedStoragePath(OPPORTUNITY_ID),
      mime_type: 'text/html; charset=utf-8',
      size_bytes: Buffer.byteLength(
        '<html><body>Inspection report</body></html>',
        'utf8'
      ),
      description: `Site Inspection Report (auto-generated) for inspection ${INSPECTION_ID}`,
    })
    expect(mocks.rootUpdateSet).toHaveBeenCalledWith({
      pdf_document_id: DOCUMENT_ID,
      updated_at: expect.any(Date),
    })
  })
})
