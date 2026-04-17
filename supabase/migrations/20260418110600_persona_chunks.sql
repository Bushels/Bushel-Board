-- WS1 Task 1.7 — Bushy chat harness
-- L2 persona chunks: retrievable book-derived voice fragments. Populated by the
-- Phase-2/3 persona pipeline (WS5.3, WS5.4). Embedding column commented out for
-- Phase 2 when pgvector + semantic search are added; today the harness retrieves
-- by exact topic match.

CREATE TABLE persona_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_book text NOT NULL,
  topic text NOT NULL,
  chunk_text text NOT NULL,
  -- embedding vector(1536),  -- Phase 2: enable when we add semantic search
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_persona_chunks_topic ON persona_chunks(topic);

GRANT SELECT ON persona_chunks TO authenticated, service_role;
