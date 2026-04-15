-- Phase 1 chat-completion additions to existing chat tables.
-- Adds user_id to chat_messages (for direct RLS), metadata column,
-- 'tool' role support, and service_role grants.

-- Add user_id column to chat_messages if not present (needed for direct RLS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.chat_messages ADD COLUMN user_id UUID REFERENCES auth.users;
    -- Backfill from thread
    UPDATE public.chat_messages m SET user_id = t.user_id
      FROM public.chat_threads t WHERE m.thread_id = t.id AND m.user_id IS NULL;
  END IF;
END $$;

-- Add metadata column for trust footer, model info, token counts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.chat_messages ADD COLUMN metadata JSONB;
  END IF;
END $$;

-- Expand role check to include 'tool' role
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user', 'assistant', 'system', 'tool'));

-- Grant service role full access (Edge Function uses service role for writes)
GRANT ALL ON public.chat_threads TO service_role;
GRANT ALL ON public.chat_messages TO service_role;
