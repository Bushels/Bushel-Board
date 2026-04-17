# Bushy Chat Harness — Required Environment Variables

Canonical list of env vars introduced by the Bushy chat harness. Set these in
Vercel (production) and in your local `.env.local` (development).

> **Note:** `.env.local.example` exists on disk as a local dev scaffold, but is
> gitignored (`.gitignore:34` matches `.env*`). Treat this file as the tracked
> source of truth for what must be configured.

## LLM provider keys

| Var | Provider | Required when |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic | `chat_engine_config.control_model_id` or `variant_model_id` starts with `claude-` |
| `OPENAI_API_KEY` | OpenAI | Routing to `gpt-4o` / `gpt-4.1` via `OpenAIAdapter` |
| `OPENROUTER_API_KEY` | OpenRouter | Offline shadow eval or provider-neutral routing via `OpenRouterAdapter` |
| `XAI_API_KEY` | xAI | Routing to `grok-*` via `XaiAdapter` — **already configured** for the existing intelligence pipeline; Bushy reuses the same key |

## Weather APIs

ECCC (Canada) and NOAA (US) both require an identifying User-Agent string per
their usage policies. Use a contact email so the maintainers can reach out if
your traffic pattern raises flags.

| Var | Example |
|---|---|
| `ECCC_USER_AGENT` | `BushelsApp/1.0 (kyle@bushelsenergy.com)` |
| `NOAA_USER_AGENT` | `BushelsApp/1.0 (kyle@bushelsenergy.com)` |

## Cron + admin

| Var | Purpose |
|---|---|
| `BUSHY_CRON_SECRET` | Shared secret guarding `/api/bushy/cron/*` routes (reflection, compression, lessons, audit). Kept separate from `CRON_SECRET` so Bushy crons can be rotated independently. Generate with `openssl rand -base64 32`. |
| `BUSHY_ADMIN_EMAIL` | Recipient for nightly reflection report delivery. Default: `kyle@bushelsenergy.com`. |

## Pre-existing (reused, not new)

These already exist in the project's env setup; Bushy uses them without adding
new vars:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `XAI_API_KEY` (grok routing)
- `BUSHEL_INTERNAL_FUNCTION_SECRET` (internal function chaining)
- `CRON_SECRET` (non-Bushy Vercel crons)
