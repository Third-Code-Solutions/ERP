import { createHash } from 'node:crypto'
import { getOpenAI, EMBEDDING_MODEL } from './openai'
import {
  embedBatchWithPythonWorker,
  embedTextWithPythonWorker,
  isPythonWorkerConfigured,
} from './python-worker'

const EMBEDDING_CACHE_MAX_ENTRIES = 200
const EMBEDDING_INPUT_MAX_CHARS = 8_000

interface EmbeddingProviderIdentity {
  provider: 'openai' | 'python-worker'
  model: typeof EMBEDDING_MODEL
  version: 'v1'
  endpoint?: string
}

// Map preserves insertion order, so the oldest key is the first one returned
// by keys().next(). That gives FIFO eviction without a real LRU implementation.
const embeddingCache = new Map<string, number[]>()
let embeddingCacheHits = 0
let embeddingCacheMisses = 0

function normalizedEmbeddingInput(text: string): string {
  return text.trim().slice(0, EMBEDDING_INPUT_MAX_CHARS)
}

function embeddingProviderIdentity(): EmbeddingProviderIdentity {
  const workerUrl = process.env.AI_WORKER_URL?.trim()
  if (workerUrl) {
    return {
      provider: 'python-worker',
      model: EMBEDDING_MODEL,
      version: 'v1',
      endpoint: workerUrl.replace(/\/+$/, ''),
    }
  }
  return {
    provider: 'openai',
    model: EMBEDDING_MODEL,
    version: 'v1',
  }
}

function buildCacheKey(
  identity: EmbeddingProviderIdentity,
  input: string
): string {
  return createHash('sha256')
    .update(JSON.stringify({ ...identity, input }))
    .digest('hex')
}

function readCache(key: string): number[] | undefined {
  return embeddingCache.get(key)
}

function writeCache(key: string, value: number[]): void {
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX_ENTRIES) {
    const oldestKey = embeddingCache.keys().next().value
    if (oldestKey !== undefined) {
      embeddingCache.delete(oldestKey)
    }
  }
  embeddingCache.set(key, value)
}

export async function embedText(text: string): Promise<number[]> {
  const input = normalizedEmbeddingInput(text)
  const provider = embeddingProviderIdentity()
  const cacheKey = buildCacheKey(provider, input)
  const cached = readCache(cacheKey)
  if (cached) {
    embeddingCacheHits += 1
    return cached
  }

  embeddingCacheMisses += 1
  if (provider.provider === 'python-worker') {
    if (!isPythonWorkerConfigured()) {
      throw new Error(
        'AI_WORKER_SHARED_SECRET is required when AI_WORKER_URL is set'
      )
    }
    const embedding = await embedTextWithPythonWorker(input)
    writeCache(cacheKey, embedding)
    return embedding
  }
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
  })
  const embedding = response.data[0]!.embedding
  writeCache(cacheKey, embedding)
  return embedding
}

export function clearEmbeddingCache(): void {
  embeddingCache.clear()
  embeddingCacheHits = 0
  embeddingCacheMisses = 0
}

export interface EmbeddingCacheStats {
  size: number
  hits: number
  misses: number
}

export function getEmbeddingCacheStats(): EmbeddingCacheStats {
  return {
    size: embeddingCache.size,
    hits: embeddingCacheHits,
    misses: embeddingCacheMisses,
  }
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (process.env.AI_WORKER_URL?.trim()) {
    if (!isPythonWorkerConfigured()) {
      throw new Error(
        'AI_WORKER_SHARED_SECRET is required when AI_WORKER_URL is set'
      )
    }
    return embedBatchWithPythonWorker(texts)
  }
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts.map((t) => t.trim().slice(0, 8000)),
  })
  return response.data.map((d) => d.embedding)
}

// pgvector wire format: `[1.0,2.0,...]`. Both JSON.stringify and the bracket
// form parse identically with JSON.parse, so deserialize is forgiving.
export function serializeEmbedding(vec: number[]): string {
  return `[${vec.join(',')}]`
}

export function deserializeEmbedding(raw: string | number[] | null): number[] | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw
  try {
    return JSON.parse(raw) as number[]
  } catch {
    return null
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function chunkText(text: string, maxChars = 1500, overlap = 100): string[] {
  if (text.length <= maxChars) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length)
    chunks.push(text.slice(start, end))
    start = end - overlap
  }
  return chunks
}
