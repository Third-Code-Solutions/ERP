import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { MS_PROJECT_XML_PARSER_VERSION } from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), capability: vi.fn(), preview: vi.fn(), commit: vi.fn(), refresh: vi.fn(),
}))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.profile, requireCapability: mocks.capability }))
vi.mock('@/lib/erp-core-client', () => ({ previewMsProjectXmlThroughCoreApi: mocks.preview, importMsProjectXmlThroughCoreApi: mocks.commit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))

import { importMsProjectXmlAction, previewMsProjectXmlAction } from './ms-project-xml-actions'

const actorId = '11111111-1111-4111-8111-111111111111'
const tenantId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const expectedScope = { actorId, tenantId }
const previewCommand = { projectId, fileName: 'schedule.xml', sourceBase64: Buffer.from('<Project />').toString('base64') }
const sourceHash = createHash('sha256').update('<Project />').digest('hex')
const requestId = '55555555-5555-4555-8555-555555555555'
const taskId = '66666666-6666-4666-8666-666666666666'
const mappings = [{ sourceUid: 1, sourceOutlineLevel: 1, level: 'l1' as const, ownerId: null }]
const command = { projectId, sourceBase64: previewCommand.sourceBase64, sourceHash, requestId, parserVersion: MS_PROJECT_XML_PARSER_VERSION, mappings }
function committed() {
  return { ok: true as const, projectId, requestId, sourceHash, parserVersion: MS_PROJECT_XML_PARSER_VERSION,
    created: true, changed: true, receipt: { tenantId, actorId, projectId, requestId, sourceHash,
      parserVersion: MS_PROJECT_XML_PARSER_VERSION, mappings,
      tasks: [{ sourceUid: 1, taskId, version: 1, level: 'l1' as const, ownerId: null }] } }
}

describe('reviewed MS Project XML action admission', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.profile.mockResolvedValue({ user: { id: actorId }, tenantId, role: 'pm' })
  })

  it.each([previewMsProjectXmlAction, importMsProjectXmlAction])('rejects stale actor scope before dispatch', async action => {
    const result = await action({ command: previewCommand, expectedScope: { ...expectedScope, actorId: projectId } })
    expect(result).toMatchObject({ ok: false })
    expect(result).not.toHaveProperty('outcomeUnknown', true)
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it.each([previewMsProjectXmlAction, importMsProjectXmlAction])('rejects stale tenant scope before dispatch', async action => {
    const result = await action({ command: previewCommand, expectedScope: { ...expectedScope, tenantId: projectId } })
    expect(result).toMatchObject({ ok: false })
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it('requires schedule management even for preview and does not disclose raw errors', async () => {
    mocks.capability.mockImplementation(() => { throw new Error('Forbidden project.schedule.manage secret detail') })
    const result = await previewMsProjectXmlAction({ command: previewCommand, expectedScope })
    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).not.toContain('secret detail')
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('does not refresh or mark writes uncertain when read-only preview fails', async () => {
    mocks.preview.mockRejectedValue(new Error('private upstream details'))
    const result = await previewMsProjectXmlAction({ command: previewCommand, expectedScope })
    expect(result).toMatchObject({ ok: false })
    expect(result).not.toHaveProperty('outcomeUnknown', true)
    expect(JSON.stringify(result)).not.toContain('private upstream details')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('forwards exact reviewed command and returns verified original receipt', async () => {
    const data = committed()
    mocks.commit.mockResolvedValue({ ok: true, data })
    expect(await importMsProjectXmlAction({ command, expectedScope })).toEqual({ ok: true, data })
    expect(mocks.commit).toHaveBeenCalledWith(command)
    expect(mocks.refresh).toHaveBeenCalledWith(`/projects/${projectId}/schedule`)
  })

  it('keeps committed success when refresh fails', async () => {
    mocks.commit.mockResolvedValue({ ok: true, data: committed() })
    mocks.refresh.mockImplementation(() => { throw new Error('cache failed') })
    expect(await importMsProjectXmlAction({ command, expectedScope })).toMatchObject({ ok: true, refreshWarning: expect.any(String) })
  })

  it('keeps a thrown post-dispatch result uncertain', async () => {
    mocks.commit.mockRejectedValue(new Error('secret details'))
    const result = await importMsProjectXmlAction({ command, expectedScope })
    expect(result).toMatchObject({ ok: false, outcomeUnknown: true })
    expect(JSON.stringify(result)).not.toContain('secret details')
  })

  it.each(['actorId', 'tenantId', 'projectId', 'requestId'] as const)('rejects receipt %s mismatch without refreshing', async field => {
    const data = committed()
    data.receipt[field] = '77777777-7777-4777-8777-777777777777'
    mocks.commit.mockResolvedValue({ ok: true, data })
    expect(await importMsProjectXmlAction({ command, expectedScope })).toMatchObject({ ok: false, outcomeUnknown: true })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('rejects a different source before dispatch', async () => {
    expect(await importMsProjectXmlAction({ command: { ...command, sourceHash: 'b'.repeat(64) }, expectedScope })).toMatchObject({ ok: false })
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it('rejects a receipt reconstructed from current mutable task versions', async () => {
    const data = committed()
    data.receipt.tasks = data.receipt.tasks.map(task => ({ ...task, version: 2 }))
    mocks.commit.mockResolvedValue({ ok: true, data })
    expect(await importMsProjectXmlAction({ command, expectedScope })).toMatchObject({ ok: false, outcomeUnknown: true })
  })

  it('rejects substituted source task identity', async () => {
    const data = committed()
    data.receipt.tasks = data.receipt.tasks.map(task => ({ ...task, sourceUid: 2 }))
    mocks.commit.mockResolvedValue({ ok: true, data })
    expect(await importMsProjectXmlAction({ command, expectedScope })).toMatchObject({ ok: false, outcomeUnknown: true })
  })
})
