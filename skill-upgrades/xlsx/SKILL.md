---
name: xlsx
description: "Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing .xlsx, .xlsm, .csv, or .tsv file (e.g., adding columns, computing formulas, formatting, charting, cleaning messy data); create a new spreadsheet from scratch or from other data sources; or convert between tabular file formats. Trigger especially when the user references a spreadsheet file by name or path — even casually (like 'the xlsx in my downloads') — and wants something done to it or produced from it. Also trigger for cleaning or restructuring messy tabular data files (malformed rows, misplaced headers, junk data) into proper spreadsheets. The deliverable must be a spreadsheet file. Do NOT trigger when the primary deliverable is a Word document (use docx), HTML report, standalone Python script, database pipeline, PDF (use pdf), slide deck (use pptx), or Google Sheets API integration, even if tabular data is involved."
license: Proprietary. LICENSE.txt has complete terms
---

# Requirements for Outputs

## All Excel files

### Professional Font
- Use a consistent, professional font (e.g., Arial, Times New Roman) unless otherwise instructed

### Zero Formula Errors
- Every Excel model MUST be delivered with ZERO formula errors (#REF!, #DIV/0!, #VALUE!, #N/A, #NAME?)

### Preserve Existing Templates (when updating templates)
- Study and EXACTLY match existing format, style, and conventions
- Never impose standardized formatting on files with established patterns

## Financial models

### Color Coding Standards
Unless otherwise stated by the user or existing template:

- **Blue text (0,0,255)**: Hardcoded inputs and scenario numbers
- **Black text (0,0,0)**: ALL formulas and calculations
- **Green text (0,128,0)**: Links from other worksheets
- **Red text (255,0,0)**: External links to other files
- **Yellow background (255,255,0)**: Key assumptions needing attention

### Number Formatting Standards

- **Years**: Format as text strings ("2024" not "2,024")
- **Currency**: Use $#,##0; ALWAYS specify units in headers ("Revenue ($mm)")
- **Zeros**: Format as "-" including percentages ($#,##0;($#,##0);-)
- **Percentages**: Default to 0.0% (one decimal)
- **Multiples**: Format as 0.0x (EV/EBITDA, P/E)
- **Negative numbers**: Parentheses (123) not minus -123

### Formula Construction Rules

- Place ALL assumptions in separate cells, use cell references instead of hardcoded values
- Example: Use =B5*(1+$B$6) instead of =B5*1.05
- Verify references, check off-by-one errors, ensure consistent formulas across periods
- Document hardcodes: "Source: [System/Document], [Date], [Reference], [URL if applicable]"

# XLSX creation, editing, and analysis

## Overview

A user may ask you to create, edit, or analyze .xlsx files. Different tools and workflows are available for different tasks.

## Important Requirements

**LibreOffice Required for Formula Recalculation**: Use `scripts/recalc.py` to recalculate formula values. The script auto-configures LibreOffice on first run.

## Reading and analyzing data

### Data analysis with pandas
```python
import pandas as pd

df = pd.read_excel('file.xlsx')  # Default: first sheet
all_sheets = pd.read_excel('file.xlsx', sheet_name=None)  # All sheets as dict

df.head(); df.info(); df.describe()

df.to_excel('output.xlsx', index=False)
```

## CRITICAL: Use Formulas, Not Hardcoded Values

Always use Excel formulas instead of calculating in Python and hardcoding.

### ❌ WRONG
```python
total = df['Sales'].sum()
sheet['B10'] = total  # Hardcodes 5000
```

### ✅ CORRECT
```python
sheet['B10'] = '=SUM(B2:B9)'
sheet['C5'] = '=(C4-C2)/C2'
sheet['D20'] = '=AVERAGE(D2:D19)'
```

## Common Workflow
1. **Choose tool**: pandas for data, openpyxl for formulas/formatting
2. **Create/Load**: Create new workbook or load existing file
3. **Modify**: Add/edit data, formulas, and formatting
4. **Save**: Write to file
5. **Recalculate formulas (MANDATORY IF USING FORMULAS)**:
   ```bash
   python scripts/recalc.py output.xlsx
   ```
6. **Verify and fix errors**: Check `error_summary` for #REF!, #DIV/0!, etc.

### Creating new Excel files

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
sheet = wb.active
sheet['A1'] = 'Hello'
sheet.append(['Row', 'of', 'data'])
sheet['B2'] = '=SUM(A1:A10)'
sheet['A1'].font = Font(bold=True, color='FF0000')
sheet['A1'].fill = PatternFill('solid', start_color='FFFF00')
sheet.column_dimensions['A'].width = 20
wb.save('output.xlsx')
```

### Editing existing Excel files

```python
from openpyxl import load_workbook

wb = load_workbook('existing.xlsx')
sheet = wb.active  # or wb['SheetName']
sheet['A1'] = 'New Value'
sheet.insert_rows(2)
new_sheet = wb.create_sheet('NewSheet')
wb.save('modified.xlsx')
```

## Recalculating formulas

```bash
python scripts/recalc.py <excel_file> [timeout_seconds]
```

The script recalculates all formulas, scans for errors, and returns JSON:
```json
{
  "status": "success",           // or "errors_found"
  "total_errors": 0,
  "total_formulas": 42,
  "error_summary": { "#REF!": { "count": 2, "locations": ["Sheet1!B5"] } }
}
```

## Formula Verification Checklist

### Essential
- Test 2-3 sample references before building full model
- Confirm column mapping (column 64 = BL, not BK)
- Remember row offset (DataFrame row 5 = Excel row 6)

### Common Pitfalls
- NaN handling: check with `pd.notna()`
- Far-right columns: FY data often in columns 50+
- Division by zero: check denominators
- Cross-sheet references: use `Sheet1!A1` format

### Testing Strategy
- Start small: test formulas on 2-3 cells first
- Verify dependencies: check all referenced cells exist
- Test edge cases: zero, negative, very large values

## Best Practices

### Library Selection
- **pandas**: Data analysis, bulk operations, simple export
- **openpyxl**: Complex formatting, formulas, Excel-specific features

### Working with openpyxl
- Cell indices are 1-based
- `data_only=True` reads values but **WARNING**: saving replaces formulas with values permanently
- For large files: `read_only=True` or `write_only=True`

### Working with pandas
- Specify dtypes: `pd.read_excel('file.xlsx', dtype={'id': str})`
- Large files: `usecols=['A', 'C', 'E']`
- Dates: `parse_dates=['date_column']`

### Code Style
Write minimal, concise Python without unnecessary comments or print statements. For Excel files, add comments to cells with complex formulas and document data sources.

## Examples

**Example 1: Financial model**
User says: "Build a 3-year revenue projection model"
→ Use openpyxl. Blue text for inputs (growth rates, starting revenue), black for formulas. Place assumptions in a dedicated section. Use =B5*(1+$B$6) pattern. Format currency as $#,##0, percentages as 0.0%. Recalculate with recalc.py. Verify zero errors.

**Example 2: Data cleanup**
User says: "This CSV has messy headers and duplicate rows, clean it up"
→ Use pandas to read, identify malformed rows, fix headers, deduplicate, standardize formats. Export to .xlsx with proper column widths and formatting via openpyxl.

**Example 3: Dashboard spreadsheet**
User says: "Create an Excel dashboard with charts from this sales data"
→ Use openpyxl for formatting and chart creation. Add summary formulas (SUM, AVERAGE, COUNTIF). Create charts referencing data ranges. Format with conditional formatting for KPIs. Recalculate.

## Common Issues

- **Formula shows as text**: Cell is formatted as text. Change format to General before writing the formula.
- **#REF! errors**: Invalid cell references, often from off-by-one errors or deleted ranges. Verify all references point to existing cells.
- **Values lost after saving with data_only=True**: This permanently replaces formulas. Never save a workbook opened with `data_only=True` unless you intentionally want to strip formulas.
- **Numbers formatted as 2,024 instead of 2024 for years**: Format year cells as text strings or use custom format `0` to suppress thousand separators.
- **recalc.py fails**: Ensure LibreOffice is available. The script auto-configures on first run, but sandbox environments may need the `scripts/office/soffice.py` wrapper.
