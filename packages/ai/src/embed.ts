import { getOpenAI, EMBEDDING_MODEL } from './openai'

export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim().slice(0, 8000),
  })
  return response.data[0]!.embedding
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

export function serializeEmbedding(vec: number[]): string {
  return JSON.stringify(vec)
}

export function deserializeEmbedding(raw: string | null): number[] | null {
  if (!raw) return null
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
