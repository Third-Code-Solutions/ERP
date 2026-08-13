export { getOpenAI, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from './openai'
export {
  embedText,
  embedBatch,
  serializeEmbedding,
  deserializeEmbedding,
  cosineSimilarity,
  chunkText,
  clearEmbeddingCache,
  getEmbeddingCacheStats,
  type EmbeddingCacheStats,
} from './embed'
export { findSimilar } from './retrieve'
export type { StoredEmbedding, RetrievalResult } from './retrieve'
export {
  embedBatchWithPythonWorker,
  embedTextWithPythonWorker,
  isEmbeddingProviderConfigured,
  isPythonWorkerConfigured,
  generateGroundedAnswerWithPythonWorker,
  type GroundedAnswerEvidence,
  type GroundedAnswerResult,
} from './python-worker'
