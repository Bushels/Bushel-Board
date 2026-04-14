#!/usr/bin/env python3
"""
Import USDA PSD metadata (attributes and units) into Supabase.
"""

from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from typing import Any

BASE_URL = 'https://apps.fas.usda.gov/PSDOnlineApi/api/downloadableData/'
TIMEOUT = 60


def load_env_files() -> None:
    candidates = [
        Path.cwd() / '.env.local',
        Path.cwd() / '.env',
        Path.cwd().parent / '.env.local',
        Path.cwd().parent / '.env',
        Path.home() / '.hermes' / '.env',
    ]
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def request_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        return json.load(response)


def upsert(table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
    import urllib.parse, urllib.request
    supabase_url = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
    service_key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
    url = supabase_url.rstrip('/') + f'/rest/v1/{table}?on_conflict=' + urllib.parse.quote(on_conflict, safe=',')
    req = urllib.request.Request(
        url,
        data=json.dumps(rows).encode('utf-8'),
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal',
            'apikey': service_key,
            'Authorization': f'Bearer {service_key}',
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        response.read()


def main() -> None:
    load_env_files()
    attributes = request_json(BASE_URL + 'GetAllAttributes')
    units = request_json(BASE_URL + 'GetAllUOMs')
    upsert('usda_wasde_attributes', [
        {'attribute_id': int(r['attributeId']), 'attribute_name': str(r['attributeName']).strip(), 'variants': r.get('variants')}
        for r in attributes
    ], 'attribute_id')
    upsert('usda_wasde_units', [
        {'unit_id': int(r['unitId']), 'unit_description': str(r['unitDescription']).strip()}
        for r in units
    ], 'unit_id')
    print(json.dumps({'status':'success','attributes':len(attributes),'units':len(units)}, indent=2))


if __name__ == '__main__':
    main()
