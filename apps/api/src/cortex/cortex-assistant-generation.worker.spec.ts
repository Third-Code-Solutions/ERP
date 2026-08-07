import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  generate: vi.fn(),
}))

vi.mock('@third-code-erp/ai', () => ({
  isPythonWorkerConfigured: mocks.configured,
  generateGroundedAnswerWithPythonWorker: mocks.generate,
}))

import {
  CortexAssistantGenerationWorkerClient,
  CortexAssistantGenerationWorkerError,
} from './cortex-assistant-generation.worker'

const EVIDENCE = [
  {
    nodeId: '11111111-1111-4111-8111-111111111111',
    nodeType: 'project',
    title: 'Tower',
    summary: null,
  },
]

describe('CortexAssistantGenerationWorkerClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.configured.mockReturnValue(true)
    mocks.generate.mockResolvedValue({
      content: 'Grounded answer',
      citationNodeIds: [EVIDENCE[0]?.nodeId],
      model: 'deterministic-grounded-v1',
    })
  })

  it('uses only the provider-free Python grounded analysis boundary', async () => {
    const client = new CortexAssistantGenerationWorkerClient()
    await expect(client.generate('What changed?', EVIDENCE)).resolves.toEqual({
      content: 'Grounded answer',
      citationNodeIds: [EVIDENCE[0]?.nodeId],
      model: 'deterministic-grounded-v1',
    })
    expect(mocks.generate).toHaveBeenCalledWith('What changed?', EVIDENCE)
  })

  it('fails closed when Python is unavailable', async () => {
    mocks.configured.mockReturnValue(false)
    await expect(
      new CortexAssistantGenerationWorkerClient().generate(
        'What changed?',
        EVIDENCE
      )
    ).rejects.toMatchObject({
      code: 'python_worker_unavailable',
    } satisfies Partial<CortexAssistantGenerationWorkerError>)
    expect(mocks.generate).not.toHaveBeenCalled()
  })
})
