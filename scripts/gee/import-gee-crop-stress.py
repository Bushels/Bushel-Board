#!/usr/bin/env python3
"""GEE crop-stress collector — US HRW belt (Stance Model V2 §16.3, P-G2).

Computes CDL winter-wheat-masked MODIS NDVI + SMAP root-zone soil-moisture
anomalies (z vs trailing 5yr baseline) per HRW state (KS/OK/TX/NE/CO) AND a
belt aggregate, then upserts into public.gee_crop_stress and writes a source_run.

WATCH-ONLY: this populates data for validation/display. It is NOT wired into any
stance score until the NASS backtest (validate-hrw-vs-nass.py) confirms it tracks
ground truth.

Usage:
  py -3.13 scripts/gee/import-gee-crop-stress.py --project monette-494717 [--date YYYY-MM-DD] [--dry-run]
  py -3.13 scripts/gee/import-gee-crop-stress.py --help

Output: one JSON summary to stdout; diagnostics to stderr. Idempotent (upsert).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # scripts/ for source_run

from gee_stress_core import (  # noqa: E402
    SOURCE_DATASETS, WINDOW_DAYS, NDVI_SCALE, SM_SCALE,
    cdl_wheat_mask, compute_region_stress, hrw_state_geometries, init_ee, log,
)
from source_run import write_source_run, SourceRunError  # noqa: E402

CROP_BELT = "US_HRW"
SUPABASE_TIMEOUT = 60


def load_env_local():
    """Populate SUPABASE_* from .env.local if not already in the environment."""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    path = os.path.join(root, ".env.local")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                v = v[1:-1]
            os.environ.setdefault(k, v)


def env_value(*names):
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    return None


def sunday_on_or_before(d: dt.date) -> dt.date:
    # NASS crop-progress weeks end on Sunday; align week_ending for join-ability.
    return d - dt.timedelta(days=(d.weekday() + 1) % 7)


def upsert_rows(rows, supabase_url, service_key):
    conflict = "crop_belt,region_code,grain,week_ending"
    url = (
        f"{supabase_url.rstrip('/')}/rest/v1/gee_crop_stress"
        f"?on_conflict={urllib.parse.quote(conflict, safe=',')}"
    )
    req = urllib.request.Request(
        url, data=json.dumps(rows).encode("utf-8"), method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise RuntimeError(f"gee_crop_stress upsert failed: HTTP {exc.code} {body[:800]}") from exc


def main():
    p = argparse.ArgumentParser(description="US HRW GEE crop-stress collector")
    p.add_argument("--project", help="Earth Engine Cloud project id (or GEE_PROJECT env)")
    p.add_argument("--date", help="Target date YYYY-MM-DD (default: today)")
    p.add_argument("--dry-run", action="store_true", help="Compute + print, do not write to Supabase")
    args = p.parse_args()

    target = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    week_ending = sunday_on_or_before(target)
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    log(f"[gee-collector] target {target} -> week_ending {week_ending}")

    ee, proj = init_ee(args.project)
    mask, cdl_year = cdl_wheat_mask(ee, target.year)
    geoms = hrw_state_geometries(ee)

    data_quality = {"window_days": WINDOW_DAYS, "ndvi_scale": NDVI_SCALE, "sm_scale": SM_SCALE,
                    "mask": "CDL winter wheat (class 24)"}
    rows = []
    for code, (name, geom) in geoms.items():
        log(f"[gee-collector] computing {code} ({name})...")
        s = compute_region_stress(ee, geom, mask, target, cdl_year)
        rows.append({
            "crop_belt": CROP_BELT, "region_code": code, "region_name": name, "grain": "Wheat",
            "week_ending": week_ending.isoformat(),
            "ndvi_current": s["ndvi_current"], "ndvi_baseline_mean": s["ndvi_baseline_mean"],
            "ndvi_baseline_std": s["ndvi_baseline_std"], "ndvi_z": s["ndvi_z"],
            "sm_current": s["sm_current"], "sm_baseline_mean": s["sm_baseline_mean"],
            "sm_baseline_std": s["sm_baseline_std"], "sm_z": s["sm_z"],
            "stress_index": s["stress_index"], "reading": s["reading"],
            "baseline_years": s["baseline_years"], "cdl_year": cdl_year,
            "data_quality": data_quality, "source_datasets": SOURCE_DATASETS,
        })

    belt = next((r for r in rows if r["region_code"] == "BELT"), None)
    summary = {
        "ok": True, "dry_run": args.dry_run, "project": proj, "crop_belt": CROP_BELT,
        "week_ending": week_ending.isoformat(), "regions": len(rows),
        "belt_stress_index": belt["stress_index"] if belt else None,
        "belt_reading": belt["reading"] if belt else None,
        "rows": rows,
    }

    if args.dry_run:
        summary["note"] = "dry-run: no Supabase write"
        print(json.dumps(summary, indent=2))
        return

    load_env_local()
    supabase_url = env_value("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    service_key = env_value("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE")
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")

    written = upsert_rows(rows, supabase_url, service_key)
    summary["rows_written"] = len(written)

    try:
        sr = write_source_run(
            supabase_url, service_key,
            source_name="gee_crop_stress", source_lane="us",
            collector_name="import-gee-crop-stress", status="success",
            source_period_end=week_ending.isoformat(),
            latest_source_label=f"{CROP_BELT} {week_ending.isoformat()}",
            rows_inserted=len(written), source_url="earthengine:MODIS+SMAP+CDL",
            started_at=started_at,
            metadata={"belt_stress_index": summary["belt_stress_index"],
                      "belt_reading": summary["belt_reading"], "cdl_year": cdl_year},
        )
        summary["source_run_id"] = sr.get("id")
    except SourceRunError as exc:
        log(f"[gee-collector] source_run write failed (non-fatal): {exc}")
        summary["source_run_error"] = str(exc)[:200]

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
