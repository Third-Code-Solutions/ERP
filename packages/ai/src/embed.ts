import { getOpenAI, EMBEDDING_MODEL } from './openai'

const EMBEDDING_CACHE_MAX_ENTRIES = 200

// Map preserves insertion order, so the oldest key is the first one returned
// by keys().next(). That gives FIFO eviction without a real LRU implementation.
const embeddingCache = new Map<string, number[]>()
let embeddingCacheHits = 0
let embeddingCacheMisses = 0

function buildCacheKey(text: string): string {
  return text.trim().slice(0, 1000)
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
  const cacheKey = buildCacheKey(text)
  const cached = readCache(cacheKey)
  if (cached) {
    embeddingCacheHits += 1
    return cached
  }

  embeddingCacheMisses += 1
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim().slice(0, 8000),
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
