import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './openai'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_TEXTS = 64
const MAX_TEXT_CHARS = 8_000
const EXPECTED_SCHEMA_VERSION = 1

interface PythonWorkerResponse {
  schema_version: unknown
  model: unknown
  dimensions: unknown
  embeddings: unknown
}

export interface GroundedAnswerEvidence {
  nodeId: string
  nodeType: string
  title: string | null
  summary: string | null
}

export interface GroundedAnswerResult {
  content: string
  citationNodeIds: string[]
  model: 'deterministic-grounded-v1'
}

interface PythonGroundedAnswerResponse {
  schema_version: unknown
  model: unknown
  content: unknown
  citation_node_ids: unknown
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function workerUrl(): string | null {
  const value = process.env.AI_WORKER_URL?.trim()
  if (!value) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('AI_WORKER_URL must be a valid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AI_WORKER_URL must use http or https')
  }
  return value.replace(/\/+$/, '')
}

function workerSecret(): string {
  const secret = process.env.AI_WORKER_SHARED_SECRET?.trim()
  if (!secret || secret.length < 20) {
    throw new Error('AI_WORKER_SHARED_SECRET is required when AI_WORKER_URL is set')
  }
  return secret
}

export function isPythonWorkerConfigured(): boolean {
  return Boolean(
    process.env.AI_WORKER_URL?.trim() &&
      (process.env.AI_WORKER_SHARED_SECRET?.trim().length ?? 0) >= 20
  )
}

/**
 * Returns true when either Python AI or the temporary TypeScript provider can
 * answer. This keeps current callers compatible while worker rollout is
 * explicit and fail-closed when only a partial worker config is present.
 */
export function isEmbeddingProviderConfigured(): boolean {
  const configuredUrl = Boolean(process.env.AI_WORKER_URL?.trim())
  if (configuredUrl) return isPythonWorkerConfigured()
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function validateTexts(texts: string[]): void {
  if (texts.length < 1 || texts.length > MAX_TEXTS) {
    throw new Error('AI worker embedding batch size is out of bounds')
  }
  if (
    texts.some(
      (text) =>
        typeof text !== 'string' ||
        text.trim().length === 0 ||
        text.trim().length > MAX_TEXT_CHARS
    )
  ) {
    throw new Error('AI worker embedding input is out of bounds')
  }
}

function parseResponse(value: unknown, expectedCount: number): number[][] {
  if (!value || typeof value !== 'object') {
    throw new Error('AI worker returned an invalid response')
  }
  const response = value as PythonWorkerResponse
  if (
    response.schema_version !== EXPECTED_SCHEMA_VERSION ||
    response.model !== EMBEDDING_MODEL ||
    response.dimensions !== EMBEDDING_DIMENSIONS ||
    !Array.isArray(response.embeddings) ||
    response.embeddings.length !== expectedCount
  ) {
    throw new Error('AI worker returned an invalid response')
  }

  const vectors = response.embeddings.map((vector) => {
    if (
      !Array.isArray(vector) ||
      vector.length !== response.dimensions ||
      vector.some(
        (value) => typeof value !== 'number' || !Number.isFinite(value)
      )
    ) {
      throw new Error('AI worker returned an invalid response')
    }
    return vector as number[]
  })
  return vectors
}

export async function embedBatchWithPythonWorker(
  texts: string[]
): Promise<number[][]> {
  validateTexts(texts)
  const url = workerUrl()
  if (!url) throw new Error('AI_WORKER_URL is not configured')
  const secret = workerSecret()
  const timeoutMs = Number(process.env.AI_WORKER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  const timeout = Number.isFinite(timeoutMs)
    ? Math.min(Math.max(timeoutMs, 1_000), 60_000)
    : DEFAULT_TIMEOUT_MS

  let response: Response
  try {
    response = await fetch(`${url}/v1/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ texts: texts.map((text) => text.trim()) }),
      signal: AbortSignal.timeout(timeout),
    })
  } catch {
    throw new Error('AI worker request failed')
  }

  if (!response.ok) {
    throw new Error(`AI worker returned HTTP ${response.status}`)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('AI worker returned invalid JSON')
  }
  return parseResponse(payload, texts.length)
}

export async function embedTextWithPythonWorker(
  text: string
): Promise<number[]> {
  const [embedding] = await embedBatchWithPythonWorker([text])
  if (!embedding) throw new Error('AI worker returned no embedding')
  return embedding
}

function validateGroundedInput(
  question: string,
  evidence: GroundedAnswerEvidence[]
): void {
  if (question.trim().length < 1 || question.trim().length > 20_000) {
    throw new Error('AI worker grounded question is out of bounds')
  }
  if (
    evidence.length > 12 ||
    new Set(evidence.map((item) => item.nodeId)).size !== evidence.length ||
    evidence.some(
      (item) =>
        !UUID_PATTERN.test(item.nodeId) ||
        item.nodeType.trim().length < 1 ||
        item.nodeType.trim().length > 64 ||
        (item.title !== null && item.title.length > 500) ||
        (item.summary !== null && item.summary.length > 4_000)
    )
  ) {
    throw new Error('AI worker grounded evidence is out of bounds')
  }
}

function parseGroundedResponse(
  value: unknown,
  allowedNodeIds: ReadonlySet<string>
): GroundedAnswerResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI worker returned an invalid grounded response')
  }
  const response = value as PythonGroundedAnswerResponse
  if (
    Object.keys(value).some(
      (key) =>
        !['schema_version', 'model', 'content', 'citation_node_ids'].includes(key)
    ) ||
    response.schema_version !== EXPECTED_SCHEMA_VERSION ||
    response.model !== 'deterministic-grounded-v1' ||
    typeof response.content !== 'string' ||
    response.content.trim().length < 1 ||
    response.content.length > 100_000 ||
    !Array.isArray(response.citation_node_ids) ||
    response.citation_node_ids.length > 12 ||
    response.citation_node_ids.some(
      (id) => typeof id !== 'string' || !allowedNodeIds.has(id)
    ) ||
    new Set(response.citation_node_ids).size !== response.citation_node_ids.length
  ) {
    throw new Error('AI worker returned an invalid grounded response')
  }
  return {
    content: response.content,
    citationNodeIds: response.citation_node_ids as string[],
    model: 'deterministic-grounded-v1',
  }
}

export async function generateGroundedAnswerWithPythonWorker(
  question: string,
  evidence: GroundedAnswerEvidence[]
): Promise<GroundedAnswerResult> {
  validateGroundedInput(question, evidence)
  const url = workerUrl()
  if (!url) throw new Error('AI_WORKER_URL is not configured')
  const secret = workerSecret()
  const timeoutMs = Number(process.env.AI_WORKER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS)
  const timeout = Number.isFinite(timeoutMs)
    ? Math.min(Math.max(timeoutMs, 1_000), 60_000)
    : DEFAULT_TIMEOUT_MS
  const body = {
    question: question.trim(),
    evidence: evidence.map((item) => ({
      node_id: item.nodeId,
      node_type: item.nodeType.trim(),
      title: item.title,
      summary: item.summary,
    })),
  }

  let response: Response
  try {
    response = await fetch(`${url}/v1/cortex/grounded-answer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })
  } catch {
    throw new Error('AI worker request failed')
  }
  if (!response.ok) throw new Error(`AI worker returned HTTP ${response.status}`)

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('AI worker returned invalid JSON')
  }
  return parseGroundedResponse(
    payload,
    new Set(evidence.map((item) => item.nodeId))
  )
}
