-- =============================================================================
-- pgvector enablement + embeddings column type migration
-- =============================================================================
-- Per Phase 4 PRD: store OpenAI text-embedding-3-small (1536 dim) as
-- a real vector(1536) column with an HNSW cosine index for fast retrieval.
-- This replaces the placeholder TEXT column from initial schema.

CREATE EXTENSION IF NOT EXISTS vector;

-- The embedding column was created as TEXT in the initial migration.
-- Drop and re-add as vector(1536). Safe because no rows exist yet —
-- BOM embedding emission requires OPENAI_API_KEY which has not run in prod.
ALTER TABLE public.embeddings
  DROP COLUMN IF EXISTS embedding;

ALTER TABLE public.embeddings
  ADD COLUMN embedding vector(1536);

-- HNSW index for cosine similarity (better recall/latency than IVFFlat for our scale).
-- ef_construction=64 + m=16 are sensible defaults for ~1536-dim vectors.
CREATE INDEX IF NOT EXISTS embeddings_vector_cosine_idx
  ON public.embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
