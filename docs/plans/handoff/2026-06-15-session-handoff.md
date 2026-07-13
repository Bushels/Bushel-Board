# Session Handoff — 2026-06-15 (wheat-first / collectors / GEE)

Clean starting point for the next session. Read this first, then the linked docs.

## Two parallel threads to continue
1. **Wheat-first site redesign (visualization work)** — the user's primary next focus. Start at `docs/plans/2026-06-15-wheat-first-data-viz-redesign.md` §10. Build the data page + the GEE crop-stress map (the hero) from `gee_crop_stress`, reusing the existing Mapbox components (`components/dashboard/spring-wheat-pulse-map.tsx`, `province-map.tsx`) and the `/data-universe` route.
2. **Finish the collector scheduled-task fixes** (below) — quick, mechanical, ~15 min.

## Collector scheduled-task fixes — STATUS

**Root cause (confirmed by the audit workflow):** the 6 registered grain collector scheduled-tasks had **stale hand-rolled SKILL.md prompts** that bypassed the tested `npm run collect:*` wrappers — they pointed at dead `/api/pipeline/run` (HTTP 410), Supabase-MCP imports that hit `-32600` under the routine harness, Firecrawl scraping + hand-written INSERTs, the deprecated `usda_wasde_estimates` table, and skipped the thesis-cache refresh. **The importers themselves are fine** (we ran them all this session). The fix is to repoint each SKILL.md at its `npm run collect:*` wrapper.

| Collector | Done? | Cron (MT) |
|---|---|---|
| `collect-cgc` | ✅ applied + ENABLED | `35 13 * * 4` (Thu 1:38 PM) |
| `collect-gee-crop-stress` | ✅ enabled (built this session) | `0 11 * * 5` (Fri 11:04 AM) |
| `collect-cftc-cot` | ⏳ TODO | `0 14 * * 5` (Fri 2 PM) |
| `collect-crop-progress` | ⏳ TODO | `32 16 * * 1` (Mon 4:32 PM) |
| `collect-export-sales` | ⏳ TODO | `3 9 * * 4` (Thu 9:03 AM) |
| `collect-wasde` | ⏳ TODO | `33 12 10-14 * *` (10th–14th 12:33 PM) |
| `collect-grain-monitor` | ⏳ TODO | `17 14 * * 3` (Wed 2:17 PM) |

**To finish (next session):** the EXACT corrected prompts for all 6 are saved in `docs/plans/handoff/2026-06-15-collector-fix-corrected-prompts.json` (the `final_prompts[]` array, with `collector`, `cron`, `final_prompt`). For each of the 5 TODO collectors, call `mcp__scheduled-tasks__update_scheduled_task` with `{ taskId, prompt: <final_prompt with the leading ---frontmatter--- stripped>, description, cronExpression: <cron>, enabled: true }`. `collect-cgc` is the worked reference (already applied). The corrected prompts already handle the harness gotchas (Supabase MCP `-32600` → verify MCP-free via wrapper stdout + `npm run check:source-freshness`; `python3` may resolve to the inert Windows Store alias → use the real interpreter).

**After enabling each:** tell the user to click **"Run now"** in the Scheduled sidebar once per task to pre-approve the Bash/npm tools, so unattended runs don't stall on a permission prompt.

## Follow-up cleanups flagged (not blocking; do when convenient)
- **Stale analysis-side skill/docs that disagree with the corrected prompts** (risk: wrong codes/ingress get re-copied):
  - `.claude/skills/cftc-cot/SKILL.md` — still documents retired Vercel-cron/`$CRON_SECRET` curl ingress.
  - `docs/hermes/skills/import-usda-export-sales.md` — stale WRONG FAS commodity codes + wrong `on_conflict` key.
  - `docs/hermes/skills/import-grain-monitor.md` — charter header shows a stale "12:17 PM" cadence (now Wed 2:17 PM).
- **`collect-crop-progress` importer bug (seasonal, moot until Dec):** the off-season (Dec–Mar) branch in `scripts/import-usda-crop-progress.py` references vars before they're bound and would `NameError` instead of cleanly skipping. (The no-new-data branch was fixed this session.)
- **June 14 NASS Crop Progress week** still wasn't on the QuickStats API as of session end — re-run `npm run collect:crop-progress` when it posts (the collector now skips cleanly until then).

## Repo state at session end
- Clean working tree (only `.mcp.json` + `.playwright-mcp/` untracked — both intentional/tooling).
- ~10 commits this session (`a73c1f9`→ this handoff): GEE crop-stress lane (US HRW + Russia, validated r=0.93/0.98, Fri-scheduled), Stance Model V2 spec + Rule-9 fix + Rules 20–21, wheat thesis persisted (Canada +9 / US +11), crop-progress UnboundLocalError fix, wheat-first direction + redesign doc.
- CLAUDE.md "Right now", PROJECT_STATE.md, STATUS.md all reflect the wheat-first direction.
