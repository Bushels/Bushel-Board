-- Switch model_used default from gpt-4o to grok-4-1-fast-reasoning (xAI Grok migration)
ALTER TABLE grain_intelligence
  ALTER COLUMN model_used SET DEFAULT 'grok-4-1-fast-reasoning';
