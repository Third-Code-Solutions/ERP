import { beforeEach, describe, expect, it, vi } from 'vitest'

const GENERATION_ID = '44444444-4444-4444-8444-444444444444'
const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const REPORT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'

const mocks = vi.hoisted(() => ({
  createDocumentThroughCoreApi: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}))

vi.mock('node:crypto', () => ({
  randomUUID: () => GENERATION_ID,
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    update: mocks.update,
  },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  weeklyReports: {
    id: 'weekly_reports.id',
    tenant_id: 'weekly_reports.tenant_id',
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  createDocumentThroughCoreApi: mocks.createDocumentThroughCoreApi,
}))

vi.mock('./weekly-report-template', () => ({
  buildWeeklyReportHtml: vi.fn(),
}))

import { persistWeeklyReportArtifact } from './generate-weekly-report'

const STORAGE_PATH = `${TENANT_ID}/${PROJECT_ID}/weekly-report-${REPORT_ID}-${GENERATION_ID}.html`

function artifactInput() {
  return {
    tenantId: TENANT_ID,
    projectId: PROJECT_ID,
    reportId: REPORT_ID,
    weekEnding: new Date('2026-08-23T15:59:59.999Z'),
    html: '<html><body>Weekly report</body></html>',
  }
}

describe('persistWeeklyReportArtifact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      remove: mocks.remove,
    })
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: mocks.storageFrom },
    })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.remove.mockResolvedValue({ error: null })
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue(undefined)
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: STORAGE_PATH,
        documentType: 'other',
        status: 'created',
        created: true,
      },
    })
  })

  it('uploads a unique non-upsert object and commits metadata through Core', async () => {
    await expect(persistWeeklyReportArtifact(artifactInput())).resolves.toBe(
      DOCUMENT_ID
    )

    expect(mocks.storageFrom).toHaveBeenCalledWith('documents')
    expect(mocks.upload).toHaveBeenCalledWith(
      STORAGE_PATH,
      artifactInput().html,
      {
        contentType: 'text/html; charset=utf-8',
        upsert: false,
      }
    )
    expect(mocks.createDocumentThroughCoreApi).toHaveBeenCalledWith(
      {
        storagePath: STORAGE_PATH,
        projectId: PROJECT_ID,
        fileName: 'weekly-report-2026-08-23.html',
        mimeType: 'text/html; charset=utf-8',
        sizeBytes: Buffer.byteLength(artifactInput().html, 'utf8'),
        description: 'Weekly report — week ending 2026-08-23',
      },
      `weekly-report:${REPORT_ID}:${GENERATION_ID}`
    )
    expect(mocks.set).toHaveBeenCalledWith({
      report_document_id: DOCUMENT_ID,
    })
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('removes only the uploaded object when Core rejects metadata', async () => {
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'provider diagnostics that must stay private',
    })

    await expect(persistWeeklyReportArtifact(artifactInput())).resolves.toBeNull()

    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith([STORAGE_PATH])
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('treats a mismatched Core result as invalid and removes the exact object', async () => {
    mocks.createDocumentThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/another-object.html`,
        documentType: 'other',
        status: 'created',
        created: true,
      },
    })

    await expect(persistWeeklyReportArtifact(artifactInput())).resolves.toBeNull()

    expect(mocks.remove).toHaveBeenCalledWith([STORAGE_PATH])
    expect(mocks.update).not.toHaveBeenCalled()
  })

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

    await expect(persistWeeklyReportArtifact(artifactInput())).resolves.toBeNull()

    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith([STORAGE_PATH])
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
    warning.mockRestore()
  })

  it('reports link failure without deleting a Core-committed object', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.where.mockRejectedValue(new Error('private database diagnostics'))

    await expect(persistWeeklyReportArtifact(artifactInput())).resolves.toBe(
      DOCUMENT_ID
    )

    expect(mocks.remove).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith(
      '[weekly-report] document link update failed'
    )
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private')
    warning.mockRestore()
  })
})
