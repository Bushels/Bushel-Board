#!/usr/bin/env python3
"""Validate the HRW GEE stress_index against USDA NASS ground truth (V2 §16.3, P-G2).

For each NASS winter-wheat report week (US TOTAL) in a season, compute the HRW
belt stress_index and correlate it with NASS good/excellent % and condition_index.
A genuine leading/coincident crop-stress signal should move WITH the ratings
(stress_index more negative when G/E is lower) -> positive Pearson r.

Until this passes, the stress_index stays WATCH-ONLY and must not move a stance.

Usage:
  py -3.13 scripts/gee/validate-hrw-vs-nass.py --project monette-494717 [--since 2026-03-01]
Output: JSON (per-week table + Pearson r + verdict) to stdout; diagnostics to stderr.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gee_stress_core import cdl_wheat_mask, compute_region_stress, hrw_state_geometries, init_ee, log  # noqa: E402


def load_env_local():
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
        if os.environ.get(n):
            return os.environ[n]
    return None


def fetch_nass(supabase_url, key, since):
    q = (
        "select=week_ending,good_excellent_pct,condition_index"
        "&state=eq.US TOTAL&commodity=ilike.*WHEAT*"
        "&good_excellent_pct=not.is.null"
        f"&week_ending=gte.{since}"
        "&order=week_ending.asc"
    )
    url = f"{supabase_url.rstrip('/')}/rest/v1/usda_crop_progress?{urllib.parse.quote(q, safe='=&.*:,-')}"
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def pearson(xs, ys):
    pts = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    n = len(pts)
    if n < 3:
        return None, n
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    cov = sum((p[0] - mx) * (p[1] - my) for p in pts)
    vx = sum((p[0] - mx) ** 2 for p in pts)
    vy = sum((p[1] - my) ** 2 for p in pts)
    if vx <= 0 or vy <= 0:
        return None, n
    return cov / (vx * vy) ** 0.5, n


def main():
    p = argparse.ArgumentParser(description="Validate HRW stress_index vs NASS ratings")
    p.add_argument("--project", help="EE project id (or GEE_PROJECT env)")
    p.add_argument("--since", default="2026-03-15", help="Earliest NASS week_ending (default 2026-03-15)")
    args = p.parse_args()

    load_env_local()
    supabase_url = env_value("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    key = env_value("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not supabase_url or not key:
        raise RuntimeError("Supabase URL + key required in .env.local")

    nass = fetch_nass(supabase_url, key, args.since)
    log(f"[validate] {len(nass)} NASS winter-wheat weeks since {args.since}")
    if not nass:
        print(json.dumps({"ok": False, "error": "no NASS rows"}, indent=2)); return

    ee, proj = init_ee(args.project)
    # use latest CDL for the whole backtest (consistent wheat mask across weeks)
    mask, cdl_year = cdl_wheat_mask(ee, dt.date.today().year)
    belt_geom = hrw_state_geometries(ee)["BELT"][1]

    table = []
    for row in nass:
        wk = dt.date.fromisoformat(row["week_ending"][:10])
        s = compute_region_stress(ee, belt_geom, mask, wk, cdl_year)
        ge = float(row["good_excellent_pct"]) if row.get("good_excellent_pct") is not None else None
        ci = float(row["condition_index"]) if row.get("condition_index") is not None else None
        table.append({"week_ending": wk.isoformat(), "ge_pct": ge, "condition_index": ci,
                      "stress_index": s["stress_index"], "ndvi_z": s["ndvi_z"], "sm_z": s["sm_z"]})
        log(f"[validate] {wk} G/E={ge} stress={s['stress_index']}")

    r_ge, n_ge = pearson([t["stress_index"] for t in table], [t["ge_pct"] for t in table])
    r_ci, n_ci = pearson([t["stress_index"] for t in table], [t["condition_index"] for t in table])

    def verdict(r):
        if r is None:
            return "inconclusive (insufficient variation/points)"
        if r >= 0.6:
            return "STRONG positive — stress_index tracks NASS; candidate to graduate to scoring"
        if r >= 0.3:
            return "MODERATE positive — promising, needs more weeks before scoring"
        if r <= -0.3:
            return "INVERTED — sign/logic bug, investigate before any use"
        return "WEAK — keep watch-only, do not score"

    out = {
        "ok": True, "project": proj, "crop_belt": "US_HRW", "cdl_year": cdl_year,
        "n_weeks": len(table),
        "pearson_stress_vs_ge": r_ge, "verdict_ge": verdict(r_ge),
        "pearson_stress_vs_condition_index": r_ci, "verdict_ci": verdict(r_ci),
        "interpretation": "positive r = stress_index moves WITH ratings (more negative stress when G/E lower) = signal is valid.",
        "table": table,
        "note": "Proxy caveat: NASS is US TOTAL winter wheat; stress_index is the HRW belt (~70% of US winter wheat). WATCH-ONLY until r is strong across a fuller season.",
    }
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
