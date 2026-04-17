-- WS1 Task 1.3 — Bushy chat harness
-- Stores accumulated extraction heuristics derived from Kyle's morning-review decisions.
-- Sunday lesson-generation job synthesizes patterns from keep/discard history into
-- 1-2 sentence heuristics. Lessons inject into Bushy's system prompt to steer future
-- capture decisions (e.g., "Don't capture delivery volumes under 10 bushels — noise").

CREATE TABLE extraction_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_text text NOT NULL,
  category_scope text CHECK (category_scope IN
    ('market','agronomic','weather','intent','logistics','input_cost') OR category_scope IS NULL),
  evidence_count int NOT NULL DEFAULT 0,
  confidence smallint NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_reinforced_at timestamptz,
  superseded_by uuid REFERENCES extraction_lessons(id)
);

CREATE INDEX idx_extraction_lessons_active
  ON extraction_lessons(category_scope, confidence DESC)
  WHERE status = 'active';

-- RPC: get active lessons for prompt injection
CREATE FUNCTION get_active_extraction_lessons(p_category text DEFAULT NULL)
RETURNS TABLE(lesson_text text, category_scope text, confidence smallint)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT lesson_text, category_scope, confidence
  FROM extraction_lessons
  WHERE status = 'active'
    AND (p_category IS NULL OR category_scope IS NULL OR category_scope = p_category)
  ORDER BY confidence DESC, created_at DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION get_active_extraction_lessons(text) TO authenticated, service_role;
