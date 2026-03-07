-- Fix stale default: column default said claude-sonnet but Edge Function uses gpt-4o
-- All existing rows already have model_used = 'gpt-4o' set by the Edge Function,
-- so this only affects future direct INSERTs that omit model_used.
ALTER TABLE grain_intelligence
  ALTER COLUMN model_used SET DEFAULT 'gpt-4o';
