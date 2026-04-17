-- WS1 Task 1.1 — Bushy chat harness
-- Adds reasoning + human-review columns to chat_extractions per design doc Section 4.
-- These columns feed nightly reflection: Bushy writes `reasoning` when capturing,
-- Kyle triages by setting `review_status` (keep/discard/defer) during morning review.

ALTER TABLE chat_extractions
  ADD COLUMN IF NOT EXISTS reasoning text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','keep','discard','defer')),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS idx_chat_extractions_review_status
  ON chat_extractions(review_status, extracted_at)
  WHERE review_status = 'pending';

COMMENT ON COLUMN chat_extractions.reasoning IS
  'Bushy''s justification for capturing this extraction. Used by nightly reflection.';
COMMENT ON COLUMN chat_extractions.review_status IS
  'pending=unreviewed, keep=Kyle approved, discard=Kyle rejected, defer=let compression decide';
