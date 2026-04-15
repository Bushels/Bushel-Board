-- Phase 2: Farmer Memory table
-- Persistent key-value store per user for cross-conversation context.
-- The analyst remembers: preferred elevator, farm size, primary grains, delivery preferences.
-- UPSERT by (user_id, memory_key, grain) — NULLS NOT DISTINCT required for correct
-- PostgREST UPSERT when grain is NULL (grain-agnostic memories like farm_size_acres).

CREATE TABLE IF NOT EXISTS public.farmer_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  memory_key text NOT NULL,
  memory_value text NOT NULL,
  grain text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_thread_id uuid REFERENCES public.chat_threads ON DELETE SET NULL,

  -- NULLS NOT DISTINCT ensures (user_id, 'farm_size', NULL) is truly unique
  -- Without this, PostgREST UPSERT creates duplicates for NULL grain
  CONSTRAINT farmer_memory_unique UNIQUE NULLS NOT DISTINCT (user_id, memory_key, grain)
);

-- Fast user-scoped lookups (context builder loads all memories per user)
CREATE INDEX idx_farmer_memory_user
  ON public.farmer_memory (user_id);

-- Grain-scoped lookups (e.g., last_rec_wheat for recommendation memory)
CREATE INDEX idx_farmer_memory_grain
  ON public.farmer_memory (user_id, grain)
  WHERE grain IS NOT NULL;

-- RLS: users see and manage only their own memories
ALTER TABLE public.farmer_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own memory"
  ON public.farmer_memory
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role needs full access for Edge Function writes
GRANT ALL ON public.farmer_memory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farmer_memory TO authenticated;

COMMENT ON TABLE public.farmer_memory IS
  'Persistent per-user key-value memory for the grain analyst. Powers cross-conversation context: preferred elevator, farm details, recommendation history. UPSERT by (user_id, memory_key, grain).';
