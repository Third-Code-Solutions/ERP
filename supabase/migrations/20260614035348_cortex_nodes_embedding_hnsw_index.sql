-- HNSW index for cosine semantic search over the Cortex graph. Additive.
create index if not exists idx_cortex_nodes_embedding
  on cortex_nodes using hnsw (embedding vector_cosine_ops);;
