# Hermes Grok X Scout Bridge

Use this when Hermes is open in the Desktop app with Grok 4.3 selected and the goal is X sentiment/evidence discovery for Track 54.

Current closeout note (2026-06-24): Hermes terminal with xAI OAuth is the working no-write scout path. Grok Composer 2.5 / `grok-composer-2.5-fast` remains blocked until Grok CLI auth is repaired or `XAI_API_KEY` is configured.

Hermes is a shadow scout only. It does not write thesis rows, Supabase rows, `x_market_signals`, `x_scout_runs`, `score_trajectory`, `us_score_trajectory`, `market_analysis`, `us_market_analysis`, or `thesis_packet_cache`.

## Workflow

### Terminal Runner

Codex can run Hermes from the terminal when xAI OAuth is logged in:

```powershell
npm run track54:hermes-preflight
npm run track54:hermes-x-scout:terminal -- --mode daily_pulse --date 2026-06-08
```

Direct terminal smoke proof uses the OAuth provider name, not the API-key provider name:

```powershell
hermes --model grok-4.3 --provider xai-oauth -z "Return exactly: HERMES_GROK_OK"
```

Do not use `--provider xai` unless `XAI_API_KEY` is configured. The `xai` provider path expects an API key and can fail even when Hermes xAI OAuth is logged in.

The preflight checks Hermes CLI availability, xAI OAuth login, a one-line no-search model smoke response, and whether Hermes can see the `x_search` toolset. It does not run X search. The runner uses Hermes one-shot mode with `--provider xai-oauth`, `--model grok-4.3`, and `--toolsets x_search`. It writes the Hermes response to `scratch/hermes-x-scout/<date>-<mode>-hermes-terminal-output.json`, performs the same read-only `grain_prices.price_date` freshness check as the normal scout runner, then imports the response into the normal local Track 54 artifact folder with the same prompt/raw/summary stem.

The default `--price-snapshot-status auto` marks price context `fresh` only when the latest price row is within two days of the scout date. Use a manual `--price-snapshot-status` value only when debugging that check.

After the terminal runner completes, review the artifact through the existing Track 54 gate:

```powershell
npm run grok:x-scout:review-week -- --mode daily_pulse --required-days 5 --min-accepted-signals 1
```

### Manual Paste Fallback

1. Generate the prompt for Hermes:

```powershell
npx tsx scripts/build-hermes-x-scout-artifact.ts --prompt-only --mode daily_pulse --date 2026-06-08
```

2. Open the emitted `prompt_path`, paste the full prompt into Hermes with Grok 4.3 selected, and ask it to return exactly one raw JSON object.

3. Save the Hermes response to a scratch file, for example:

```text
scratch/hermes-x-scout/2026-06-08-hermes-output.json
```

4. Import the Hermes response into the existing Track 54 artifact contract:

```powershell
npx tsx scripts/build-hermes-x-scout-artifact.ts --mode daily_pulse --date 2026-06-08 --raw-file scratch/hermes-x-scout/2026-06-08-hermes-output.json --price-snapshot-status fresh
```

Use `--price-snapshot-status fresh` only when price proof is actually fresh. Otherwise omit it and the artifact will remain `not_checked`.

5. Review the artifact through the existing Track 54 gate:

```powershell
npm run grok:x-scout:review-week -- --mode daily_pulse --required-days 5 --min-accepted-signals 1
```

For Friday:

```powershell
npx tsx scripts/build-hermes-x-scout-artifact.ts --prompt-only --mode friday_deep --date 2026-06-12
npx tsx scripts/build-hermes-x-scout-artifact.ts --mode friday_deep --date 2026-06-12 --raw-file scratch/hermes-x-scout/2026-06-12-hermes-output.json --price-snapshot-status fresh
npm run grok:x-scout:review-week -- --mode friday_deep --required-days 1 --min-accepted-signals 1
```

The package shortcuts `npm run track54:hermes-x-scout:prompt`, `npm run track54:hermes-x-scout`, and `npm run track54:hermes-x-scout:terminal` exist, but direct `npx tsx` commands avoid npm 11 argument-forwarding warnings on Windows.

## Codex Automation

Active Codex automation `track-54-hermes-x-scout-prompt-bridge` now runs as `Track 54 Hermes terminal X scout shadow recovery` weekdays after the normal no-write scout window. It first reviews today's `daily_pulse` artifact. If today's artifact is already structurally valid, no-write, date/mode matched, and price-fresh, it does not run Hermes. If today's artifact is missing, invalid, parse-failed, identity-mismatched, or lacks fresh price proof, it runs `npm --silent run track54:hermes-x-scout:terminal -- --mode daily_pulse --date <local-run-date>` and then reruns the artifact reviewer.

It runs `npm --silent run track54:hermes-preflight` before any terminal scout attempt. It must not run Hermes for low signal count alone when the same-day artifact is otherwise valid and price-fresh. It must not run daily thesis review, run `--write`, write Supabase rows, enable production Grok routines, register write-mode automations, or call `/api/pipeline/run`.

Track 54 readiness now audits this automation's schedule, workspace, prompt boundaries, and forbidden write-path fragments.

## Acceptance

A Hermes artifact can help the gate only when:

- `dry_run = true`
- `write = false`
- `scout_run_id = null`
- `schema_version = grok_x_scout_v1`
- `run_date` and `mode` match the reviewed day
- `price_snapshot_status = fresh`
- at least one signal passes deterministic validation when the mode requires an accepted signal

Quiet days are valid evidence that X was quiet, but they are not promotion-ready by themselves. A zero-signal day can be useful context and still hold manual review.

## Common Failures

- `price_snapshot_status = not_checked`: run price proof first or leave the artifact out of promotion.
- `outside_search_window:daily_pulse`: Hermes widened the daily window; keep broader context in `no_signal_notes`.
- `missing_or_invalid_source_url`: Hermes summarized X chatter without a canonical X URL.
- `forbidden_advice_language`: Hermes used buy/sell/trade/advice wording.
- `unsupported_grain`: Hermes included a grain outside public V1 scope.

## Boundary

Do not create a separate Hermes production lane. The bridge exists only to convert a Hermes/Grok 4.3 response into the same local no-write artifact shape already reviewed by Track 54.
