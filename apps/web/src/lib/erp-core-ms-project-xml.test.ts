import { createSupabaseServerClient } from '@third-code-erp/auth'
import { MS_PROJECT_XML_PARSER_VERSION } from '@third-code-erp/shared-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importMsProjectXmlThroughCoreApi, previewMsProjectXmlThroughCoreApi } from './erp-core-client'

vi.mock('@third-code-erp/auth', () => ({ createSupabaseServerClient: vi.fn() }))
const projectId = '33333333-3333-4333-8333-333333333333'
const preview = { projectId, sourceBase64: Buffer.from('<Project />').toString('base64'), fileName: 'schedule.xml' }
const command = { projectId, sourceBase64: preview.sourceBase64, sourceHash: 'a'.repeat(64), parserVersion: MS_PROJECT_XML_PARSER_VERSION, requestId: '55555555-5555-4555-8555-555555555555', mappings: [{ sourceUid: 1, sourceOutlineLevel: 1, level: 'l1', ownerId: null }] }

describe('MS Project XML Core transport', () => {
  beforeEach(() => {
    vi.stubEnv('ERP_CORE_API_URL', 'https://erp-api.example.test')
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } }) } } as never)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it.each([500, 502, 408])('keeps commit status %s uncertain and redacts raw errors', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'secret SQL details' }), { status })))
    const result = await importMsProjectXmlThroughCoreApi(command)
    expect(result).toMatchObject({ ok: false, outcomeUnknown: true, status })
    expect(JSON.stringify(result)).not.toContain('secret SQL details')
  })
  it.each([400, 401, 403, 409, 422])('preserves definitive commit rejection %s', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    const result = await importMsProjectXmlThroughCoreApi(command)
    expect(result).toMatchObject({ ok: false, status })
    expect(result.outcomeUnknown).not.toBe(true)
  })
  it('treats malformed success as uncertain with exact command sent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await importMsProjectXmlThroughCoreApi(command)).toMatchObject({ ok: false, outcomeUnknown: true })
    expect(fetchMock).toHaveBeenCalledWith(`https://erp-api.example.test/v1/projects/${projectId}/schedule/ms-project-xml/import`, expect.objectContaining({ method: 'POST', body: JSON.stringify(command) }))
  })
  it('does not mark read-only preview network failure as uncertain mutation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const result = await previewMsProjectXmlThroughCoreApi(preview)
    expect(result.ok).toBe(false)
    expect(result.outcomeUnknown).not.toBe(true)
  })
})
