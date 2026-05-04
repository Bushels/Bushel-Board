#!/usr/bin/env python3
"""Small PostgREST writer for the source_runs ledger."""

from __future__ import annotations

import datetime as dt
import json
import urllib.error
import urllib.request
from typing import Any

SUPABASE_TIMEOUT_SECONDS = 30


class SourceRunError(Exception):
    pass


def _utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def write_source_run(
    supabase_url: str,
    service_key: str,
    *,
    source_name: str,
    source_lane: str,
    collector_name: str,
    status: str,
    source_period_start: str | None = None,
    source_period_end: str | None = None,
    latest_source_label: str | None = None,
    rows_inserted: int = 0,
    rows_updated: int = 0,
    rows_skipped: int = 0,
    error_message: str | None = None,
    source_url: str | None = None,
    started_at: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = {
        "source_name": source_name,
        "source_lane": source_lane,
        "collector_name": collector_name,
        "status": status,
        "source_period_start": source_period_start,
        "source_period_end": source_period_end,
        "latest_source_label": latest_source_label,
        "rows_inserted": int(rows_inserted or 0),
        "rows_updated": int(rows_updated or 0),
        "rows_skipped": int(rows_skipped or 0),
        "error_message": error_message[:2000] if error_message else None,
        "source_url": source_url,
        "started_at": started_at or _utc_now(),
        "finished_at": _utc_now(),
        "metadata": metadata or {},
    }

    req = urllib.request.Request(
        f"{supabase_url.rstrip('/')}/rest/v1/source_runs",
        data=json.dumps(row).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "return=representation",
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=SUPABASE_TIMEOUT_SECONDS) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")
        raise SourceRunError(f"source_runs insert failed: HTTP {exc.code} {body[:500]}") from exc

    if isinstance(payload, list) and payload:
        return payload[0]
    return row
