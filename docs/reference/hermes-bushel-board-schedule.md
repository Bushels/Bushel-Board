# Hermes ownership — Bushel Board schedules

**Date:** 2026-07-15  
**Owner:** Hermes Agent (default model Grok 4.5 via xAI OAuth)  
**Repo workdir:** `C:\Users\kyle\Agriculture\bushel-board-app`

## Why this exists

Claude Desktop Routines previously owned collectors and Friday desks. That path produced multi-week silent desk death and mixed timezone/docs drift. As of this date, **Hermes cron is the intended scheduler** for Bushel Board mechanical work and Wheat X Pulse.

## Hard boundaries (do not violate)

1. **Do not revive** `/api/pipeline/run` or Grok thesis writers (`analyze-grain-market`, etc.). Those stay HTTP 410 tombstones.
2. **X Pulse is no-write** for thesis tables (`market_analysis`, `us_market_analysis`, `score_trajectory`, `thesis_packet_cache`).
3. **Desk writes** require the desk CLI approval phrase / `DESK_WRITE_APPROVAL` — never auto-enable from a silent cron without Kyle approval.
4. Farmer product remains **Wheat-only** on normal `/thesis`.

## Wrapper scripts

Repo source of truth:

- `scripts/hermes/run-bushel-collector.sh`
- `scripts/hermes/run-bushel-watchdog.sh`
- `scripts/hermes/run-wheat-x-pulse.sh`

Installed for Hermes resolution under:

- `%LOCALAPPDATA%\hermes\scripts\bushel-*.sh` (Windows)

Logs:

- `~/.hermes/logs/bushel-board-collectors/`

## Mechanical schedule (America/Edmonton / local MT)

| Job name | Cron (local) | Script | npm target |
|----------|--------------|--------|------------|
| bushel-collect-crop-progress | `32 16 * * 1` | `bushel-collect-crop-progress.sh` | `collect:crop-progress` |
| bushel-collect-canada-mb | `45 12 * * 2` | `bushel-collect-canada-mb.sh` | `collect:canada-crop-progress:mb` |
| bushel-collect-canada-mb-retry | `30 10 * * 3` | `bushel-collect-canada-mb.sh` | same |
| bushel-collect-grain-monitor | `17 14 * * 3` | `bushel-collect-grain-monitor.sh` | `collect:grain-monitor` |
| bushel-collect-export-sales | `3 9 * * 4` | `bushel-collect-export-sales.sh` | `collect:export-sales` |
| bushel-collect-canada-mb-sk | `15 11 * * 4` | `bushel-collect-canada-mb-sk.sh` | `collect:canada-crop-progress:mb-sk` |
| bushel-collect-cgc | `35 13 * * 4` | `bushel-collect-cgc.sh` | `collect:cgc` |
| bushel-collect-producer-cars | `0 16 * * 4` | `bushel-collect-producer-cars.sh` | `collect:producer-cars` |
| bushel-collect-canada-all | `45 13 * * 5` | `bushel-collect-canada-all.sh` | `collect:canada-crop-progress:all` |
| bushel-collect-cftc-cot | `0 14 * * 5` | `bushel-collect-cftc-cot.sh` | `collect:cftc-cot` |
| bushel-collect-gee-crop-stress | `0 11 * * 5` | `bushel-collect-gee-crop-stress.sh` | `collect:gee-crop-stress` |
| bushel-collect-prices | `45 15 * * 1-5` | `bushel-collect-prices.sh` | `collect:prices` |
| bushel-collect-wasde | `33 12 10-14 * *` | `bushel-collect-wasde.sh` | `collect:wasde` |
| bushel-source-freshness-tue | `20 13 * * 2` | `bushel-source-freshness.sh` | `check:source-freshness` |
| bushel-source-freshness-mwf | `45 16 * * 1,3-5` | `bushel-source-freshness.sh` | `check:source-freshness` |
| bushel-desk-freshness-sat | `0 9 * * 6` | `bushel-desk-freshness.sh` | `check:desk-freshness` |
| bushel-wheat-x-pulse-daily | `10 16 * * 1-5` | `bushel-wheat-x-pulse-daily.sh` | Hermes X scout `daily_pulse` |
| bushel-wheat-x-pulse-friday | `50 16 * * 5` | `bushel-wheat-x-pulse-friday.sh` | Hermes X scout `friday_deep` |

All of the above are **`--no-agent`** (script stdout only; no LLM spend).

## Agent jobs (Grok 4.5)

| Job | Schedule | Purpose |
|-----|----------|---------|
| bushel-wheat-friday-desk-orchestrator | Fri `0 18 * * 5` (6:00 PM MT) | Run US then CAD desk **preflight**, summarize freshness, report X pulse status. **Does not write thesis rows** unless operator has set approval and explicitly enables write mode later. |
| bushel-wheat-daily-operator-brief | Mon–Fri `0 17 * * 1-5` (5:00 PM MT) | Short Grok brief: price freshness, X pulse artifact, source alerts. Watch-only. |

## Operator commands

```bash
hermes cron list
hermes cron status
# force one collector now (example):
bash %LOCALAPPDATA%/hermes/scripts/bushel-collect-prices.sh
```

## Migration note from Claude Desktop

| Old owner | New owner |
|-----------|-----------|
| Claude Desktop collector Routines | Hermes `bushel-collect-*` |
| Claude Desktop desk Routines | Hermes orchestrator + `npm run desk:*` CLI |
| Codex Track 54 dry-run jobs | Hermes `bushel-wheat-x-pulse-*` |
| Vercel crons | Remain disabled for pipeline automation |

Disable or delete the old Claude Desktop Routines once Hermes jobs show a clean week of heartbeats in `source_runs`.

## Related docs

- `docs/reference/collector-task-configs.md` (historical Claude schedule; superseded for ownership)
- `docs/audits/2026-07-15-wheat-centric-board-deep-audit.md`
- `docs/plans/STATUS.md`
- `PROJECT_STATE.md`
