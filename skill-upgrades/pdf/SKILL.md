---
name: pdf
description: "Use this skill whenever the user wants to do anything with PDF files. This includes: reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs. Trigger when the user says: 'read this PDF', 'merge these PDFs', 'split this PDF', 'fill this form', 'extract tables from PDF', 'create a PDF', 'add a watermark', 'OCR this document', or mentions any .pdf file. Do NOT use for Word documents (use docx), spreadsheets (use xlsx), slide decks (use pptx), or HTML/web content (use web-artifacts-builder)."
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

## Overview

This guide covers essential PDF operations using Python libraries and command-line tools. For advanced features, JavaScript libraries, and detailed examples, see REFERENCE.md. For PDF form filling, read FORMS.md and follow its instructions.

## Quick Start

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Python Libraries

### pypdf — Basic Operations

#### Merge PDFs
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

#### Split PDF
```python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

#### Extract Metadata
```python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}, Author: {meta.author}")
```

#### Rotate Pages
```python
reader = PdfReader("input.pdf")
writer = PdfWriter()
page = reader.pages[0]
page.rotate(90)  # 90 degrees clockwise
writer.add_page(page)
with open("rotated.pdf", "wb") as output:
    writer.write(output)
```

### pdfplumber — Text and Table Extraction

#### Extract Text
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        print(page.extract_text())
```

#### Extract Tables
```python
with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"Table {j+1} on page {i+1}:")
            for row in table:
                print(row)
```

#### Tables to Excel
```python
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
```

### reportlab — Create PDFs

#### Basic PDF
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter
c.drawString(100, height - 100, "Hello World!")
c.line(100, height - 140, 400, height - 140)
c.save()
```

#### Multi-Page Report
```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

story.append(Paragraph("Report Title", styles['Title']))
story.append(Spacer(1, 12))
story.append(Paragraph("Body content here. " * 20, styles['Normal']))
story.append(PageBreak())
story.append(Paragraph("Page 2", styles['Heading1']))

doc.build(story)
```

#### Subscripts and Superscripts

**IMPORTANT**: Never use Unicode subscript/superscript characters (₀₁₂₃) in ReportLab — they render as black boxes. Use XML markup tags instead:
```python
chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])
squared = Paragraph("x<super>2</super>", styles['Normal'])
```

## Command-Line Tools

### pdftotext (poppler-utils)
```bash
pdftotext input.pdf output.txt
pdftotext -layout input.pdf output.txt  # Preserve layout
pdftotext -f 1 -l 5 input.pdf output.txt  # Pages 1-5
```

### qpdf
```bash
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf  # Merge
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf  # Split
qpdf input.pdf output.pdf --rotate=+90:1  # Rotate page 1
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf  # Decrypt
```

## Common Tasks

### OCR Scanned PDFs
```python
import pytesseract
from pdf2image import convert_from_path

images = convert_from_path('scanned.pdf')
text = ""
for i, image in enumerate(images):
    text += f"Page {i+1}:\n" + pytesseract.image_to_string(image) + "\n\n"
```

### Add Watermark
```python
from pypdf import PdfReader, PdfWriter

watermark = PdfReader("watermark.pdf").pages[0]
reader = PdfReader("document.pdf")
writer = PdfWriter()
for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)
with open("watermarked.pdf", "wb") as output:
    writer.write(output)
```

### Extract Images
```bash
pdfimages -j input.pdf output_prefix
```

### Password Protection
```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)
writer.encrypt("userpassword", "ownerpassword")
with open("encrypted.pdf", "wb") as output:
    writer.write(output)
```

## Quick Reference

| Task | Best Tool | Key Function |
|------|-----------|-------------|
| Merge PDFs | pypdf | `writer.add_page(page)` |
| Split PDFs | pypdf | One page per file |
| Extract text | pdfplumber | `page.extract_text()` |
| Extract tables | pdfplumber | `page.extract_tables()` |
| Create PDFs | reportlab | Canvas or Platypus |
| CLI merge | qpdf | `qpdf --empty --pages ...` |
| OCR scanned | pytesseract | Convert to image first |
| Fill forms | See FORMS.md | pdf-lib or pypdf |

## Next Steps

- For advanced pypdfium2 usage, see REFERENCE.md
- For JavaScript libraries (pdf-lib), see REFERENCE.md
- For PDF form filling, follow FORMS.md
- For troubleshooting, see REFERENCE.md

## Examples

**Example 1: Extract tables to Excel**
User says: "Pull the financial tables out of this annual report PDF"
→ Use pdfplumber to extract tables, pandas to create DataFrames, export to .xlsx. Handle multi-page tables by concatenating.

**Example 2: Merge and watermark**
User says: "Combine these 5 PDFs and add a 'CONFIDENTIAL' watermark"
→ Create watermark PDF with reportlab (red diagonal text), merge all PDFs with pypdf, then apply watermark to each page.

**Example 3: Fill a form**
User says: "Fill out this W-9 form with my company info"
→ Read FORMS.md for the specific workflow. Use pdf-lib or pypdf depending on form type. Validate all required fields are populated.

## Common Issues

- **Unicode subscripts render as black boxes**: Never use Unicode subscript/superscript characters with ReportLab. Use `<sub>` and `<super>` tags in Paragraph objects instead.
- **Table extraction misses columns**: Try adjusting pdfplumber's table settings or use `page.extract_text()` with layout mode as a fallback.
- **OCR quality is poor**: Increase DPI when converting (`convert_from_path('file.pdf', dpi=300)`), or preprocess images (threshold, deskew) before OCR.
- **Merged PDF has wrong page order**: Ensure you're iterating files in the correct order. Use sorted() or explicit ordering.
- **Form fields not found**: Some PDFs use flattened forms (fields baked into the page). Check FORMS.md for handling these cases.
- **Encrypted PDF won't open**: Use `qpdf --password=... --decrypt` or `PdfReader("file.pdf", password="...")` with pypdf.
