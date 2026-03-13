-- Vendor-neutral knowledge corpus for grain market intelligence.
-- Stores extracted document metadata and chunked passages, then exposes a
-- retrieval RPC that Edge Functions can call regardless of model provider.

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_path text NOT NULL UNIQUE,
  source_hash text NOT NULL,
  title text NOT NULL,
  source_type text NOT NULL
    CHECK (source_type IN ('framework', 'guide', 'book', 'reference', 'note')),
  mime_type text,
  language_code text NOT NULL DEFAULT 'en',
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  chunk_count integer NOT NULL DEFAULT 0,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.knowledge_documents IS
  'Source documents used to ground grain market intelligence prompts.';

COMMENT ON COLUMN public.knowledge_documents.metadata IS
  'Document metadata such as source filename, file size, page count, and ingestion notes.';

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  heading text,
  content text NOT NULL,
  grain_tags text[] NOT NULL DEFAULT '{}'::text[],
  topic_tags text[] NOT NULL DEFAULT '{}'::text[],
  region_tags text[] NOT NULL DEFAULT '{}'::text[],
  source_priority smallint NOT NULL DEFAULT 50 CHECK (source_priority BETWEEN 0 AND 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector tsvector,  -- maintained by trigger (GENERATED ALWAYS not possible: to_tsvector is STABLE)
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_chunks_document_chunk_unique UNIQUE (document_id, chunk_index)
);

COMMENT ON TABLE public.knowledge_chunks IS
  'Chunked passages extracted from grain market reference material.';

COMMENT ON COLUMN public.knowledge_chunks.metadata IS
  'Chunk-level metadata such as page range, source section, and extraction method.';

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_active
  ON public.knowledge_documents (is_active, source_type);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document
  ON public.knowledge_chunks (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_search
  ON public.knowledge_chunks
  USING gin (search_vector);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_grain_tags
  ON public.knowledge_chunks
  USING gin (grain_tags);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_topic_tags
  ON public.knowledge_chunks
  USING gin (topic_tags);

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_knowledge_context(
  p_query text,
  p_grain text DEFAULT NULL,
  p_topics text[] DEFAULT NULL,
  p_limit integer DEFAULT 6
)
RETURNS TABLE (
  chunk_id bigint,
  document_id bigint,
  title text,
  source_path text,
  heading text,
  content text,
  grain_tags text[],
  topic_tags text[],
  region_tags text[],
  source_priority smallint,
  metadata jsonb,
  rank double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  search_query text := NULLIF(trim(p_query), '');
  capped_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 6), 12));
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      kc.id AS chunk_id,
      kc.document_id,
      kd.title,
      kd.source_path,
      kc.heading,
      kc.content,
      kc.grain_tags,
      kc.topic_tags,
      kc.region_tags,
      kc.source_priority,
      kc.metadata,
      (
        CASE
          WHEN search_query IS NULL THEN 0::double precision
          ELSE ts_rank_cd(kc.search_vector, websearch_to_tsquery('english', search_query))
        END
        + CASE
          WHEN p_grain IS NOT NULL
            AND (COALESCE(array_length(kc.grain_tags, 1), 0) = 0 OR kc.grain_tags @> ARRAY[p_grain])
          THEN 0.20
          ELSE 0::double precision
        END
        + CASE
          WHEN p_topics IS NOT NULL
            AND COALESCE(array_length(p_topics, 1), 0) > 0
            AND (COALESCE(array_length(kc.topic_tags, 1), 0) = 0 OR kc.topic_tags && p_topics)
          THEN 0.15
          ELSE 0::double precision
        END
        + (kc.source_priority::double precision / 1000.0)
      ) AS rank
    FROM public.knowledge_chunks kc
    JOIN public.knowledge_documents kd
      ON kd.id = kc.document_id
    WHERE kd.is_active = true
      AND (
        p_grain IS NULL
        OR COALESCE(array_length(kc.grain_tags, 1), 0) = 0
        OR kc.grain_tags @> ARRAY[p_grain]
      )
      AND (
        p_topics IS NULL
        OR COALESCE(array_length(p_topics, 1), 0) = 0
        OR COALESCE(array_length(kc.topic_tags, 1), 0) = 0
        OR kc.topic_tags && p_topics
      )
  )
  SELECT
    ranked.chunk_id,
    ranked.document_id,
    ranked.title,
    ranked.source_path,
    ranked.heading,
    ranked.content,
    ranked.grain_tags,
    ranked.topic_tags,
    ranked.region_tags,
    ranked.source_priority,
    ranked.metadata,
    ranked.rank
  FROM ranked
  ORDER BY ranked.rank DESC, ranked.source_priority DESC, ranked.document_id, ranked.chunk_id
  LIMIT capped_limit;
END;
$$;

COMMENT ON FUNCTION public.get_knowledge_context(text, text, text[], integer) IS
  'Returns the most relevant knowledge chunks for a grain/task query using Postgres full-text search and tag boosts.';

REVOKE ALL ON FUNCTION public.get_knowledge_context(text, text, text[], integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_knowledge_context(text, text, text[], integer)
  TO service_role;

-- Trigger to maintain search_vector on insert/update
CREATE OR REPLACE FUNCTION public.knowledge_chunks_search_vector_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.heading, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B') ||
    setweight(to_tsvector('english', array_to_string(NEW.topic_tags, ' ')), 'C') ||
    setweight(to_tsvector('english', array_to_string(NEW.grain_tags, ' ')), 'C') ||
    setweight(to_tsvector('english', array_to_string(NEW.region_tags, ' ')), 'D');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_knowledge_chunks_search_vector
  BEFORE INSERT OR UPDATE ON public.knowledge_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.knowledge_chunks_search_vector_trigger();
