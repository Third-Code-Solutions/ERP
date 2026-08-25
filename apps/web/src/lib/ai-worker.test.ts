import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  embedBatch,
  embedBatchWithPythonWorker,
  embedText,
  clearEmbeddingCache,
  EMBEDDING_DIMENSIONS,
  isEmbeddingProviderConfigured,
  generateGroundedAnswerWithPythonWorker,
} from '@third-code-erp/ai'

const VECTOR_A = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
  index === 0 ? 0.1 : index === 1 ? 0.2 : 0
)
const VECTOR_B = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) =>
  index === 0 ? 0.3 : index === 1 ? 0.4 : 0
)

const ENV_KEYS = [
  'AI_WORKER_URL',
  'AI_WORKER_SHARED_SECRET',
  'AI_WORKER_TIMEOUT_MS',
  'OPENAI_API_KEY',
] as const

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
)

afterEach(() => {
  clearEmbeddingCache()
  for (const key of ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.unstubAllGlobals()
})

describe('Python AI worker boundary', () => {
  it('selects Python embeddings without requiring a TypeScript OpenAI key', () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    delete process.env.OPENAI_API_KEY

    expect(isEmbeddingProviderConfigured()).toBe(true)
  })

  it('sends bounded authenticated batches and validates response contract', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test/'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          schema_version: 1,
          model: 'text-embedding-3-small',
          dimensions: EMBEDDING_DIMENSIONS,
          embeddings: [VECTOR_A, VECTOR_B],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      embedBatchWithPythonWorker([' Copper pipe ', 'Valve'])
    ).resolves.toEqual([VECTOR_A, VECTOR_B])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai-worker.example.test/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${'s'.repeat(32)}`,
        }),
        body: JSON.stringify({ texts: ['Copper pipe', 'Valve'] }),
      })
    )
  })

  it('fails closed when worker URL has no shared secret', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    delete process.env.AI_WORKER_SHARED_SECRET

    await expect(embedBatchWithPythonWorker(['Copper pipe'])).rejects.toThrow(
      'AI_WORKER_SHARED_SECRET is required when AI_WORKER_URL is set'
    )
    expect(isEmbeddingProviderConfigured()).toBe(false)
  })

  it('rejects a worker response from a different embedding model', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: 1,
            model: 'different-embedding-model',
            dimensions: EMBEDDING_DIMENSIONS,
            embeddings: [VECTOR_A],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    )

    await expect(embedText('Copper pipe')).rejects.toThrow(
      'AI worker returned an invalid response'
    )
  })

  it('rejects a worker response with dimensions outside the repository contract', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: 1,
            model: 'text-embedding-3-small',
            dimensions: 2,
            embeddings: [[0.1, 0.2]],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    )

    await expect(embedText('Copper pipe')).rejects.toThrow(
      'AI worker returned an invalid response'
    )
  })

  it('routes shared embedding helper through Python when worker is configured', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          schema_version: 1,
          model: 'text-embedding-3-small',
          dimensions: EMBEDDING_DIMENSIONS,
          embeddings: [VECTOR_A],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(embedBatch(['Copper pipe'])).resolves.toEqual([VECTOR_A])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keys cached embeddings by the complete normalized provider input', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    const sharedPrefix = 'a'.repeat(1_000)
    const firstText = `${sharedPrefix}-first-tail`
    const secondText = `${sharedPrefix}-second-tail`
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: 1,
            model: 'text-embedding-3-small',
            dimensions: EMBEDDING_DIMENSIONS,
            embeddings: [VECTOR_A],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: 1,
            model: 'text-embedding-3-small',
            dimensions: EMBEDDING_DIMENSIONS,
            embeddings: [VECTOR_B],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(embedText(firstText)).resolves.toEqual(VECTOR_A)
    await expect(embedText(secondText)).resolves.toEqual(VECTOR_B)
    await expect(embedText(`  ${firstText}  `)).resolves.toEqual(VECTOR_A)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not share cache entries between Python worker and OpenAI providers', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    const input = 'Provider-isolated embedding input'
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            schema_version: 1,
            model: 'text-embedding-3-small',
            dimensions: EMBEDDING_DIMENSIONS,
            embeddings: [VECTOR_A],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(embedText(input)).resolves.toEqual(VECTOR_A)

    delete process.env.AI_WORKER_URL
    delete process.env.AI_WORKER_SHARED_SECRET
    delete process.env.OPENAI_API_KEY
    await expect(embedText(input)).rejects.toThrow(
      'OPENAI_API_KEY not configured'
    )

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('accepts only grounded citations supplied by Nest', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    const nodeId = '11111111-1111-4111-8111-111111111111'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          schema_version: 1,
          model: 'deterministic-grounded-v1',
          content: 'Grounded answer',
          citation_node_ids: [nodeId],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateGroundedAnswerWithPythonWorker('What changed?', [
        { nodeId, nodeType: 'project', title: 'Tower', summary: null },
      ])
    ).resolves.toEqual({
      content: 'Grounded answer',
      citationNodeIds: [nodeId],
      model: 'deterministic-grounded-v1',
    })
  })

  it('rejects grounded citations not supplied by Nest', async () => {
    process.env.AI_WORKER_URL = 'https://ai-worker.example.test'
    process.env.AI_WORKER_SHARED_SECRET = 's'.repeat(32)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          schema_version: 1,
          model: 'deterministic-grounded-v1',
          content: 'Unsafe answer',
          citation_node_ids: ['22222222-2222-4222-8222-222222222222'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateGroundedAnswerWithPythonWorker('What changed?', [
        {
          nodeId: '11111111-1111-4111-8111-111111111111',
          nodeType: 'project',
          title: 'Tower',
          summary: null,
        },
      ])
    ).rejects.toThrow('invalid grounded response')
  })
})
