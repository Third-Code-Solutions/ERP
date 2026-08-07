import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  embed: vi.fn(),
}))

vi.mock('@third-code-erp/ai', () => ({
  isPythonWorkerConfigured: mocks.configured,
  embedBatchWithPythonWorker: mocks.embed,
}))

import {
  CortexSemanticIndexWorkerClient,
  CortexSemanticIndexWorkerError,
} from './cortex-semantic-index.worker'

describe('CortexSemanticIndexWorkerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.configured.mockReturnValue(true)
    mocks.embed.mockResolvedValue([new Array(1_536).fill(0.01)])
  })

  it('uses only the Python worker embedding boundary', async () => {
    const client = new CortexSemanticIndexWorkerClient()
    await expect(client.embed(['project — Tower'])).resolves.toHaveLength(1)
    expect(mocks.embed).toHaveBeenCalledOnce()
    expect(mocks.embed).toHaveBeenCalledWith(['project — Tower'])
  })

  it('fails closed on partial configuration and invalid dimensions', async () => {
    mocks.configured.mockReturnValue(false)
    await expect(
      new CortexSemanticIndexWorkerClient().embed(['project — Tower'])
    ).rejects.toBeInstanceOf(CortexSemanticIndexWorkerError)
    expect(mocks.embed).not.toHaveBeenCalled()

    mocks.configured.mockReturnValue(true)
    mocks.embed.mockResolvedValue([[0.01]])
    await expect(
      new CortexSemanticIndexWorkerClient().embed(['project — Tower'])
    ).rejects.toMatchObject({ code: 'invalid_embedding_response' })
  })
})
