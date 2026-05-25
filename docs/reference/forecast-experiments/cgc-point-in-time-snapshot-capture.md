# CGC Point-in-Time Snapshot Capture

## Direct Answer

Historical replay needs as-published source files. The weekly CGC snapshot capture lane saves the current public CGC CSV as a compressed local artifact with metadata and a SHA-256 hash.

This is separate from the Supabase CGC importer. Capture proves what the file looked like when fetched; import writes operational data.

## Command

```powershell
npm run capture-cgc:snapshot -- --output-dir "data\CGC Weekly Snapshots"
```

Use dry-run to verify the live URL and hash without writing files:

```powershell
npm run capture-cgc:snapshot:dry
```

Use the direct form for custom flags on Windows:

```powershell
npx tsx scripts/capture-cgc-weekly-snapshot.ts --output-dir "data\CGC Weekly Snapshots" --dry-run
```

## Output

Snapshots are local-only and ignored by git:

```text
data/CGC Weekly Snapshots/
  2025-2026/
    week-38/
      2026-05-10-192500Z-cgc-week-38-6d75c3b7.csv.gz
      2026-05-10-192500Z-cgc-week-38-6d75c3b7.metadata.json
```

The metadata records:

- capture timestamp,
- source page URL,
- resolved CSV URL,
- crop year,
- grain week,
- week ending date,
- raw CSV byte length,
- raw CSV SHA-256 hash,
- hash basis (`uncompressed_csv_text`),
- compressed CSV SHA-256 hash,
- compressed CSV path,
- `point_in_time_certified: true`.

## Guardrails

- No Supabase reads.
- No Supabase writes.
- No sidecar writes.
- No production writes.
- No model API calls.
- No dashboard imports.
- No Hermes automation.
- Local files are ignored until we choose a permanent storage route.

These snapshots can later feed historical replay as clean point-in-time source artifacts. Annual CGC CSVs remain review-only unless separately certified as as-published.

## First Local Capture

Captured on 2026-05-10:

- Crop year: `2025-2026`
- Grain week: `39`
- Week ending: `2026-05-03`
- Rows in raw CSV: `161264`
- Latest-week rows: `4358`
- Raw CSV bytes: `15763344`
- CSV hash: `sha256:6d75c3b7fda56997416ce0234228809a63325bfa30538a916aa1f03484d20c2a`
- Local metadata path: `data\CGC Weekly Snapshots\2025-2026\week-39\2026-05-10-cgc-week-39.metadata.json`

The local files are intentionally ignored by git. The hash and metadata prove the captured file identity without adding weekly raw CSV blobs to the repository.

New captures include UTC capture time in the filename so same-day CGC file changes do not overwrite earlier point-in-time files.
New captures also include the first eight characters of the raw CSV hash in the filename so same-timestamp backfills cannot overwrite different payloads.
