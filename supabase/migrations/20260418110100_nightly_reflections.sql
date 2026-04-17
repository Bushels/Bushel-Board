-- WS1 Task 1.2 — Bushy chat harness
-- Stores nightly reflection reports: Bushy reviews yesterday's pending extractions,
-- emits a markdown + structured JSON report, flags surprising captures, and proposes
-- pattern hints for compression to escalate to Kyle.

CREATE TABLE nightly_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_date date NOT NULL UNIQUE,
  model_used text NOT NULL,
  extractions_reviewed int NOT NULL DEFAULT 0,
  report_markdown text NOT NULL,
  report_json jsonb NOT NULL,
  flagged_for_review int NOT NULL DEFAULT 0,
  auto_discarded int NOT NULL DEFAULT 0,
  surprising_captures jsonb,
  pattern_hints jsonb,
  kyle_decisions_pending int NOT NULL DEFAULT 0,
  kyle_decisions_made int NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  review_completed_at timestamptz
);

CREATE INDEX idx_nightly_reflections_date ON nightly_reflections(reflection_date DESC);

ALTER TABLE nightly_reflections ENABLE ROW LEVEL SECURITY;

-- NOTE: profiles.role CHECK constraint does not include 'admin' (as of 20260418100100).
-- This policy effectively limits authenticated reads to service role until an admin role
-- is added. By design: WS9 admin UI can use server actions with service role.
CREATE POLICY "admins read reflections" ON nightly_reflections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

GRANT SELECT ON nightly_reflections TO authenticated;
