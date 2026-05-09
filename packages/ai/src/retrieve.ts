import { cosineSimilarity, deserializeEmbedding, embedText } from './embed'

export interface StoredEmbedding {
  id: string
  entity_type: string
  entity_id: string
  chunk_index: number
  chunk_text: string
  embedding: string | null
  metadata?: Record<string, unknown>
}

export interface RetrievalResult {
  entity_type: string
  entity_id: string
  chunk_text: string
  score: number
  metadata?: Record<string, unknown>
}

export async function findSimilar(
  query: string,
  candidates: StoredEmbedding[],
  topK = 5
): Promise<RetrievalResult[]> {
  if (candidates.length === 0) return []

  const queryVec = await embedText(query)

  const results: RetrievalResult[] = []

  for (const c of candidates) {
    const vec = deserializeEmbedding(c.embedding)
    if (!vec) continue
    results.push({
      entity_type: c.entity_type,
      entity_id: c.entity_id,
      chunk_text: c.chunk_text,
      score: cosineSimilarity(queryVec, vec),
      metadata: c.metadata,
    })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK)
}
