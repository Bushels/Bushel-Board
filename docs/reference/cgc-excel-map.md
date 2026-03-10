# CGC Excel Spreadsheet Structure Map

> Authoritative reference for mapping CGC weekly grain statistics Excel files to CSV and Supabase.
> Verified against Week 29 (`gsw-shg-29-en.xlsx`) and Week 30 (`gsw-shg-30-en.xlsx`) — structure is consistent.

## File Naming

- Excel: `data/gsw-shg-{week}-en.xlsx` (e.g., `gsw-shg-30-en.xlsx`)
- CSV: `data/gsw-shg-en.csv` (cumulative, all weeks)
- Units: All values in thousands of tonnes (Kt)

## Sheet Index (14 sheets)

| # | Sheet Name | Dims (Week 30) | Header Row | Columns | Content |
|---|-----------|-----------------|------------|---------|---------|
| 1 | Grain Statistics Weekly 2025 | 48×2 | — | A-B | Cover page (skip) |
| 2 | Notes | 68×3 | — | A-C | Footnotes (skip) |
| 3 | Summary | 54×18 | **Row 5** | A-R | Handling summary: 16 grains in columns |
| 4 | Detail Summary | 75×18 | **Row 5** | A-R | Detailed handling by sector |
| 5 | Primary | 150×10 | **Row 6** | A-J | Producer deliveries by province |
| 6 | Producer Cars | 112×10 | **Row 6** | A-J | Producer car shipments |
| 7 | Process | 123×10 | **Row 6** | A-J | Process elevator deliveries/shipments |
| 8 | PPShipDist | 186×10 | **Row 6** | A-J | Primary/Process shipment distribution |
| 9 | Feed Grains | 82×10 | **Row 6** | A-J | Feed grain deliveries by province |
| 10 | Terminal Exports | 100×8 | **Row 6** | A-H | Exports by port, per-grade rows |
| 11 | Terminal Receipts | 183×8 | **Row 6** | A-H | Receipts by port, per-grade rows |
| 12 | Terminal Stocks | 113×8 | **Row 6** | A-H | Stocks by port, per-grade rows |
| 13 | Terminal Disposition | 73×8 | **Row 6** | A-H | Disposition by port |
| 14 | Imported Grains | 85×10 | **Row 6** | A-J | Imported grain statistics |

---

## Summary Sheet (Sheet 3)

**Layout:** Grains in columns, metrics in rows. Header row 5.

### Column Map (Row 5)
| Col | Grain |
|-----|-------|
| B | Wheat |
| C | Amber Durum |
| D | Oat |
| E | Barley |
| F | Rye |
| G | Flaxseed |
| H | Canola |
| I | Sunflower |
| J | Soybeans |
| K | Peas |
| L | Corn |
| M | Canaryseed |
| N | Mustard Seed |
| O | Beans |
| P | Lentil |
| Q | Chick Peas |
| R | Total |

### Row Map (Column A)
| Rows | Section | Metrics |
|------|---------|---------|
| 14-18 | Producer Deliveries | 15: Current Week, 16: Week Ago, 17: To Date, 18: Year Ago |
| 20-24 | Terminal Receipts | 21: Current Week, 22: Week Ago, 23: To Date, 24: Year Ago |
| 26-30 | Exports | 27: Current Week, 28: Week Ago, 29: To Date, 30: Year Ago |
| 32-36 | Domestic Disappearance | 33: Current Week, 34: Week Ago, 35: To Date, 36: Year Ago |
| 44-52 | Commercial Stocks (Week N) | 44: Primary, 45: Process, 46-51: Ports, 52: Total |

### Quick Lookup Examples
- **Wheat Producer Deliveries Current Week:** Summary!B15
- **Canola Exports Crop Year to Date:** Summary!H29
- **Peas Terminal Receipts Current Week:** Summary!K21
- **Total Commercial Stocks:** Summary!R52

---

## Primary Sheet (Sheet 5)

**Layout:** Grains in rows, provinces in columns. 5 repeating sections of 16 grains each.

### Column Map (Row 6)
| Col | Region |
|-----|--------|
| B | Manitoba |
| C | Saskatchewan |
| D | Alberta |
| E | British Columbia |
| F | Total |

### Section Map
| Start Row | Section | CSV `metric` | CSV `period` |
|-----------|---------|-------------|--------------|
| 3 / grains 7-23 | Producer Deliveries (Current Week) | `Deliveries` | `Current Week` |
| 29 / grains 32-48 | Primary Elevator Shipments (Current Week) | `Shipments` | `Current Week` |
| 54 / grains 57-73 | Crop Year to Date Deliveries | `Deliveries` | `Crop Year` |
| 79 / grains 82-98 | Crop Year to Date Shipments | `Shipments` | `Crop Year` |
| 104 / grains 107-123 | Stocks at Primary Elevators | `Stocks` | `Current Week` |
| 129 / grains 132-148 | Condo Storage | `Condo Storage` | `Current Week` |

### Grain Row Positions (relative within each section)
| Offset | Grain |
|--------|-------|
| +0 | Wheat |
| +1 | Amber Durum |
| +2 | Oat |
| +3 | Barley |
| +4 | Rye |
| +5 | Flaxseed |
| +6 | Canola |
| +7 | Sunflower |
| +8 | Soybeans |
| +9 | Peas |
| +10 | Corn |
| +11 | Canaryseed |
| +12 | Mustard Seed |
| +13 | Beans |
| +14 | Lentil |
| +15 | Chick Peas |
| +16 | Total |

### Quick Lookup Examples
- **Wheat Deliveries Current Week, Alberta:** Primary!D7
- **Canola Deliveries Crop Year, Saskatchewan:** Primary!C63
- **Barley Stocks, Manitoba:** Primary!B110

---

## Process Sheet (Sheet 7)

**Layout:** Grains in rows, metrics in columns. 2 sections (Current Week + Crop Year).

### Column Map (Row 6)
| Col | Metric | CSV `metric` |
|-----|--------|-------------|
| B | Producer Deliveries | `Producer Deliveries` |
| C | Other Deliveries | `Other Deliveries` |
| D | Shipments | `Shipments` |
| E | Milled/MFG Grain | `Milled/MFG Grain` |

### Section Map
| Start Row | Grains | Period |
|-----------|--------|--------|
| 3 / grains 7-22 | 15 grains + Total | Current Week |
| 28 / grains 32-47 | 15 grains + Total | Crop Year |

**Note:** Process has 15 grains (no Sunflower in Current Week section, but Sunflower appears in Crop Year section).

### Quick Lookup
- **Canola Process Producer Deliveries Current Week:** Process!B13
- **Soybeans Process Producer Deliveries Crop Year:** Process!B40

---

## PPShipDist Sheet (Sheet 8)

**Layout:** Grains in rows, destinations in columns. Primary/Process Shipment Distribution.

### Column Map (Row 6)
| Col | Destination | CSV `region` |
|-----|-------------|-------------|
| B | Canadian Domestic | `Canadian Domestic` |
| C | Process Elevators | `Process Elevators` |
| D | Pacific Coast | `Pacific Coast` |
| E | Churchill | `Churchill` |
| F | Thunder Bay | `Thunder Bay` |
| G | Eastern Terminals | `Eastern Terminals` |
| H | Western Container | `Western Container` |
| I | Eastern Container | `Eastern Container` |
| J | Export Destinations | `Export Destinations` |

### Section Map
| Start Row | Grains | Period |
|-----------|--------|--------|
| 3 / grains 7-22 | 15 grains + Total | Current Week |
| 28 / grains 31-47 | 16 grains + Total | Crop Year |

---

## Terminal Sheets (Exports, Receipts, Stocks, Disposition)

**Layout:** Per-grade sub-rows under each grain. Ports in columns.

### Column Map (Row 6)
| Col | Port | CSV `region` |
|-----|------|-------------|
| B | Vancouver | `Vancouver` |
| C | Prince Rupert | `Prince Rupert` |
| D | Churchill | `Churchill` |
| E | Thunder Bay | `Thunder Bay` |
| F | Bay & Lakes | `Bay & Lakes` |
| G | St. Lawrence | `St. Lawrence` |
| H | Total | `Total` |

### Terminal Receipts — Grain Groupings (Current Week section)
| Start Row | Grain | Grade Rows | Total Row |
|-----------|-------|------------|-----------|
| 8 | Wheat | 9-19 (11 grades) | 20 |
| 22 | Amber Durum | 23-26 (4 grades) | 27 |
| 29 | Oat | 30 (1 grade) | 31 |
| 33 | Barley | 34 (1 grade) | 35 |
| 37 | Rye | 38 (1 grade) | 39 |
| 41 | Canola | 42-46 (5 grades) | 47 |
| 48 | Soybeans | 49-53 (5 grades) | 54 |
| 55 | Peas | 56: "All grades combined" | 56 |
| 59 | Corn | (varies) | varies |
| 68 | Lentil | (varies) | varies |

**⚠️ Important:** Only Peas has an "All grades combined" row. All other grains require summing individual grade rows. The CSV has per-grade rows — no pre-aggregated `grade=''` rows for Terminal worksheets.

### Section Structure
Each Terminal sheet has two main sections:
1. **Current Week** — starts after header, per-grade rows
2. **Crop Year to Date** — starts ~halfway through sheet, same grain/grade structure

---

## CSV Column Mapping

The CSV (`gsw-shg-en.csv`) flattens the Excel wide format into 10 columns:

| CSV Column | Source | Example |
|-----------|--------|---------|
| `Crop Year` | File metadata | `2025-2026` |
| `Grain Week` | File metadata | `30` |
| `Week Ending Date` | Section headers | `01/03/2026` (DD/MM/YYYY) |
| `worksheet` | Sheet name | `Primary`, `Process`, `Terminal Receipts` |
| `metric` | Section header / column header | `Deliveries`, `Producer Deliveries`, `Receipts` |
| `period` | Section context | `Current Week`, `Crop Year` |
| `grain` | Row label (col A) | `Wheat`, `Canola` |
| `grade` | Grade sub-row (Terminal sheets only) | `No.1 CW RS`, `` (empty for Primary) |
| `Region` | Column header | `Alberta`, `Vancouver`, `Total` |
| `Ktonnes` | Cell value | `213.8` |

### Key CSV → Excel Mappings
| CSV `worksheet` | CSV `metric` | Excel Sheet | Excel Column/Section |
|----------------|-------------|-------------|---------------------|
| `Primary` | `Deliveries` | Primary | Section 1 (rows 7-23) |
| `Primary` | `Shipments` | Primary | Section 2 (rows 32-48) |
| `Primary` | `Stocks` | Primary | Section 5 (rows 107-123) |
| `Process` | `Producer Deliveries` | Process | Column B |
| `Process` | `Shipments` | Process | Column D |
| `Terminal Receipts` | `Receipts` | Terminal Receipts | Per-grade rows |
| `Terminal Exports` | `Exports` | Terminal Exports | Per-grade rows |
| `Summary` | `Deliveries` | Summary | Rows 15-18 |
| `PPShipDist` | `Shipments` | PPShipDist | Sections 1 & 2 |

---

## Cross-Reference Examples

### Example 1: Verify Wheat Primary Deliveries, Alberta, Current Week
```
Excel:    Primary!D7  = 213.8
CSV:      worksheet=Primary, metric=Deliveries, period=Current Week, grain=Wheat, region=Alberta → 213.8
Supabase: SELECT ktonnes FROM cgc_observations
          WHERE worksheet='Primary' AND metric='Deliveries' AND period='Current Week'
          AND grain='Wheat' AND region='Alberta' AND grain_week=30 AND crop_year='2025-2026';
```

### Example 2: Verify Canola Terminal Receipts Total (must sum grades)
```
Excel:    Terminal Receipts!H47 (Total row for Canola)
CSV:      worksheet=Terminal Receipts, metric=Receipts, grain=Canola, grade=<each grade>, region=Total
Supabase: SELECT SUM(ktonnes) FROM cgc_observations
          WHERE worksheet='Terminal Receipts' AND metric='Receipts' AND period='Current Week'
          AND grain='Canola' AND grain_week=30 AND crop_year='2025-2026' AND region='Total';
```

### Example 3: Verify Summary Producer Deliveries, Peas
```
Excel:    Summary!K15
CSV:      worksheet=Summary, metric=Deliveries, period=Current Week, grain=Peas
Supabase: SELECT ktonnes FROM cgc_observations
          WHERE worksheet='Summary' AND metric='Deliveries' AND period='Current Week'
          AND grain='Peas' AND grain_week=30 AND crop_year='2025-2026';
```
