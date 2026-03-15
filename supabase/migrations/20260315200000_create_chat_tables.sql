-- Chat tables for Kitchen Table Advisor
-- Design doc: docs/plans/2026-03-15-kitchen-table-advisor-chat-design.md

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT,
  grain_context TEXT[] NOT NULL DEFAULT '{}',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_threads IS
  'Conversation threads for the Kitchen Table Advisor chat feature.';

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES public.chat_threads(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  reasoning_json JSONB,
  input_tokens INTEGER,
  output_tokens INTEGER,
  model_used TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_messages IS
  'Messages within Kitchen Table Advisor chat threads.';

-- Indexes
CREATE INDEX idx_chat_threads_user ON public.chat_threads (user_id, updated_at DESC);
CREATE INDEX idx_chat_messages_thread ON public.chat_messages (thread_id, created_at);

-- RLS
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own threads" ON public.chat_threads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own messages" ON public.chat_messages
  FOR ALL USING (
    thread_id IN (SELECT id FROM public.chat_threads WHERE user_id = auth.uid())
  );

-- Grants
GRANT ALL ON public.chat_threads TO authenticated;
GRANT ALL ON public.chat_messages TO authenticated;
