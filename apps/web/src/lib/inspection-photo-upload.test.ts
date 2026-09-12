import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@third-code-erp/auth/client', () => ({ createSupabaseBrowserClient: () => ({ auth: mocks }) }))
import { uploadInspectionPhoto } from './inspection-photo-upload'

const scope = { actorId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', opportunityId: '33333333-3333-4333-8333-333333333333' }
const documentId = '44444444-4444-4444-8444-444444444444'
const bytes = new Uint8Array([255, 216, 255, 217])
const file = new File([bytes], 'photo.jpg', { type: 'image/jpeg' })
const uploadUrl = `https://core.example.test/v1/opportunities/${scope.opportunityId}/inspection-photos/upload`
const metadata = { ...scope, uploadUrl }
const receipt = { documentId, tenantId: scope.tenantId, opportunityId: scope.opportunityId, projectId: null, fileName: file.name,
  storagePath: `${scope.tenantId}/opportunities/${scope.opportunityId}/inspection/${createHash('sha256').update(bytes).digest('hex')}-${file.name}`, status: 'created' }

describe('direct inspection photo transport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'session-token', user: { id: scope.actorId } } }, error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(Response.json(receipt)))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('sends only metadata through Web and authenticated multipart directly to Core', async () => {
    expect(await uploadInspectionPhoto(file, scope, () => {})).toBe(documentId)
    const calls = vi.mocked(fetch).mock.calls
    expect(calls[0]?.[0]).toContain('/transport')
    expect(calls[0]?.[1]?.body).toBeUndefined()
    expect(calls[1]?.[0]).toBe(uploadUrl)
    expect(calls[1]?.[1]).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', headers: { Authorization: 'Bearer session-token', 'x-expected-actor-id': scope.actorId, 'x-expected-tenant-id': scope.tenantId } })
    expect(Array.from((calls[1]?.[1]?.body as FormData).keys())).toEqual(['file'])
  })
  it.each(['actorId', 'tenantId', 'opportunityId'])('rejects mismatched transport %s before exposing credentials', async field => {
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json({ ...metadata, [field]: documentId }))
    await expect(uploadInspectionPhoto(file, scope, () => {})).rejects.toThrow('did not match')
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each(['https://core.example.test/evil', uploadUrl + '?token=bad', uploadUrl + '#bad', 'https://user:secret@core.example.test/v1/opportunities/' + scope.opportunityId + '/inspection-photos/upload'])('rejects invalid destination %s', async target => {
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json({ ...metadata, uploadUrl: target }))
    await expect(uploadInspectionPhoto(file, scope, () => {})).rejects.toThrow('invalid destination')
    expect(mocks.getSession).not.toHaveBeenCalled()
  })
  it('rejects changed signed-in actor before byte transfer', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'other-token', user: { id: documentId } } }, error: null })
    await expect(uploadInspectionPhoto(file, scope, () => {})).rejects.toThrow('session changed')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each(['café.jpg', 'folder/photo.jpg', 'folder\\photo.jpg', 'floor..jpg'])('canonicalizes multipart filename before transfer: %s', async name => {
    const expectedName = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_')
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(Response.json({
      ...receipt, fileName: expectedName, storagePath: receipt.storagePath.replace(/photo.jpg$/, expectedName),
    }))
    expect(await uploadInspectionPhoto(new File([bytes], name), scope, () => {})).toBe(documentId)
    const form = vi.mocked(fetch).mock.calls[1]?.[1]?.body as FormData
    expect((form.get('file') as File).name).toBe(expectedName)
  })
  it.each(['tenantId', 'opportunityId', 'storagePath', 'fileName'])('rejects mismatched receipt %s', async field => {
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(Response.json(metadata)).mockResolvedValueOnce(Response.json({ ...receipt, [field]: documentId }))
    await expect(uploadInspectionPhoto(file, scope, () => {})).rejects.toThrow('unconfirmed')
  })
  it('stops when the component lifetime changes after metadata', async () => {
    const current = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('stale lifetime') })
    await expect(uploadInspectionPhoto(file, scope, current)).rejects.toThrow('unconfirmed')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects oversized bytes before any request', async () => {
    await expect(uploadInspectionPhoto(new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'large.jpg'), scope, () => {})).rejects.toThrow('15 MiB')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('bounds a stalled response body and sanitizes provider failures', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(new Response(new ReadableStream({ start() {} })))
    const result = uploadInspectionPhoto(file, scope, () => {})
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not expose provider error text', async () => {
    vi.mocked(fetch).mockReset().mockRejectedValue(new Error('https://provider.test?secret=private-token'))
    await expect(uploadInspectionPhoto(file, scope, () => {})).rejects.toThrow(/^Photo upload is unconfirmed/)
  })
  it('bounds a stalled session refresh without dispatching a late upload', async () => {
    vi.useFakeTimers()
    let resolveSession: ((value: unknown) => void) | undefined
    mocks.getSession.mockImplementation(() => new Promise(resolve => { resolveSession = resolve }))
    const result = uploadInspectionPhoto(file, scope, () => {})
    const assertion = expect(result).rejects.toThrow('timed out')
    // Hashing uses native crypto; allow it to settle before advancing the timer.
    await vi.waitFor(() => expect(mocks.getSession).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
    resolveSession?.({ data: { session: { access_token: 'late-token', user: { id: scope.actorId } } }, error: null })
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
