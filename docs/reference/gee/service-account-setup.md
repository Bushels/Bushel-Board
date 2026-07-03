# GEE Service Account Setup (unattended collection)

**Goal:** let `scripts/gee/import-gee-crop-stress.py` run **unattended** (weekly Claude Desktop Routine) without the interactive browser auth. The collector's `init_ee()` already prefers a service-account key when `GEE_SERVICE_ACCOUNT_JSON` is set — these steps create that key.

**Account/project:** `gronningk@gmail.com`, Cloud project **`monette-494717`** (already registered for non-commercial Earth Engine — the Code Editor works on it). Non-commercial is fine; do **not** attach billing.

> **⚠️ STATUS 2026-06-15 — SA-key path BLOCKED by org policy.** The SA `bushel-gee@monette-494717.iam.gserviceaccount.com` was created and granted `roles/earthengine.writer`, **but** the org enforces `constraints/iam.disableServiceAccountKeyCreation`, so Step 3 (key download) fails with "Key creation is not allowed on this service account." **Resolution for the prototype:** don't use a SA key — leave `GEE_SERVICE_ACCOUNT_JSON` unset and let `init_ee()` use gronningk's persisted Earth Engine refresh token (`~/.config/earthengine/credentials`), which refreshes silently and works unattended. To use a real SA key, an **Org Policy Admin** must first lift `iam.disableServiceAccountKeyCreation` for this project/org (Console → IAM & Admin → Organization Policies), then run Step 3. Also fix the gcloud account first: `gcloud auth login gronningk@gmail.com && gcloud config set account gronningk@gmail.com && gcloud config set project monette-494717` (default gcloud account here is `kyle@bushelsenergy.com`, which does NOT own the EE project).

---

## Step 1 — Create the service account
**gcloud (fastest):**
```bash
gcloud config set project monette-494717
gcloud iam service-accounts create bushel-gee \
  --display-name="Bushel Board GEE collector"
```
**Console (alternative):** console.cloud.google.com → project `monette-494717` → IAM & Admin → Service Accounts → **+ Create Service Account** → name `bushel-gee` → Create.

The SA email will be: `bushel-gee@monette-494717.iam.gserviceaccount.com`

## Step 2 — Grant the Earth Engine role
```bash
gcloud projects add-iam-policy-binding monette-494717 \
  --member="serviceAccount:bushel-gee@monette-494717.iam.gserviceaccount.com" \
  --role="roles/earthengine.writer"
```
**Console:** IAM & Admin → IAM → Grant Access → paste the SA email → role **Earth Engine Resource Writer** → Save. (`writer` covers compute + asset reads; `viewer` also works if you prefer least-privilege and never write assets.)

## Step 3 — Create a JSON key
```bash
# from the repo root
mkdir -p .secrets
gcloud iam service-accounts keys create .secrets/gee-service-account.json \
  --iam-account=bushel-gee@monette-494717.iam.gserviceaccount.com
```
**Console:** Service Accounts → click `bushel-gee` → Keys → Add Key → Create new key → **JSON** → download → move it to `.secrets/gee-service-account.json`.

> `.secrets/` and `*-service-account*.json` are gitignored — the key will **never** be committed. Never paste the key contents into chat, code, or a commit.

## Step 4 — Register the SA for non-commercial EE *(only if Step 6 fails)*
Projects already registered for non-commercial EE usually cover their service accounts automatically. If `init_ee` later errors with a permission/registration message, register the SA email once at:
`https://code.earthengine.google.com/register` → choose the existing `monette-494717` non-commercial registration → add the service account email. (Older flow: `https://signup.earthengine.google.com/#!/service_accounts`.)

## Step 5 — Point the app at the key
Add to `.env.local` (already gitignored):
```
GEE_SERVICE_ACCOUNT_JSON=C:\Users\kyle\Agriculture\bushel-board-app\.secrets\gee-service-account.json
GEE_PROJECT=monette-494717
```
`init_ee()` reads `GEE_SERVICE_ACCOUNT_JSON` first; if the JSON has `project_id`, `GEE_PROJECT` is optional.

## Step 6 — Verify (no browser, no interactive auth)
```bash
py -3.13 scripts/gee/import-gee-crop-stress.py --belt US_HRW --dry-run
```
Expect stderr: `[gee] init via service account bushel-gee@monette-494717.iam.gserviceaccount.com project=monette-494717`, and a JSON summary with a `belt_stress_index`. No browser should open. If that works, drop `--dry-run` to write, and repeat for `--belt RU_WINTER` and `--belt RU_SPRING`.

## Step 7 — Automate
1. Add an npm wrapper (runs all three belts + refreshes the thesis cache):
   ```jsonc
   // package.json scripts
   "collect:gee-crop-stress": "tsx -- scripts/run-collector-with-thesis-cache-refresh.ts --name collect-gee-crop-stress bash scripts/gee/collect-all-belts.sh"
   ```
   (or a small wrapper that calls the collector once per belt with `--project monette-494717`).
2. Register a **Claude Desktop Routine** `collect-gee-crop-stress`, weekly **Monday** (after MODIS composites refresh), per `docs/reference/collector-task-configs.md`.
3. Confirm freshness via the CLAUDE.md monitoring query (`SELECT ... FROM gee_crop_stress ...`) and `source_runs`.

---

## Troubleshooting
- **`Caller does not have permission` / `not registered`** → do Step 4 (register the SA email under the non-commercial project).
- **`Earth Engine API has not been used in project ...`** → the API is enabled on `monette-494717`; make sure `GEE_PROJECT`/the key's `project_id` is `monette-494717`, not another project.
- **billing/commercial error** → ensure `monette-494717` has **no billing account** attached (non-commercial requirement).
- **key rotation** → `gcloud iam service-accounts keys list --iam-account=bushel-gee@...`; create a new key, update `.env.local`, delete the old key id.
