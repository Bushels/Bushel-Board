-- Fix: Add 'verified' to local_market_intel confidence CHECK constraint.
-- Required for gamified data exchange: verified data points from farmer confirmation prompts.
-- The original migration may have been deployed before 'verified' was added to the file.

ALTER TABLE public.local_market_intel DROP CONSTRAINT IF EXISTS valid_confidence;
ALTER TABLE public.local_market_intel ADD CONSTRAINT valid_confidence CHECK (
  confidence IN ('reported', 'verified', 'inferred', 'outlier')
);
