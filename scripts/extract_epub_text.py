#!/usr/bin/env python
"""Extract ordered chapter text from an EPUB as JSON for the knowledge ingestion script."""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from posixpath import dirname, join, normpath


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.parts.append(data.strip())

    def get_text(self) -> str:
        return " ".join(self.parts)


def emit_error(message: str, code: int = 1) -> None:
    print(json.dumps({"error": message}))
    raise SystemExit(code)


def parse_xml(zip_file: zipfile.ZipFile, file_path: str) -> ET.Element:
    with zip_file.open(file_path) as handle:
        return ET.fromstring(handle.read())


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(sys.argv) != 2:
        emit_error("Usage: extract_epub_text.py <epub_path>")

    epub_path = Path(sys.argv[1]).resolve()
    if not epub_path.exists():
        emit_error(f"EPUB not found: {epub_path}")

    try:
        archive = zipfile.ZipFile(epub_path)
    except zipfile.BadZipFile as exc:
        emit_error(f"Invalid EPUB archive: {exc}")

    with archive:
        container = parse_xml(archive, "META-INF/container.xml")
        rootfile = container.find(".//{*}rootfile")
        if rootfile is None:
            emit_error("EPUB is missing META-INF/container.xml rootfile metadata")

        package_path = rootfile.attrib.get("full-path")
        if not package_path:
            emit_error("EPUB rootfile metadata does not include a package path")

        package_dir = dirname(package_path)
        package = parse_xml(archive, package_path)

        manifest = {
            item.attrib.get("id"): item.attrib.get("href")
            for item in package.findall(".//{*}manifest/{*}item")
            if item.attrib.get("id") and item.attrib.get("href")
        }
        spine = [
            itemref.attrib.get("idref")
            for itemref in package.findall(".//{*}spine/{*}itemref")
            if itemref.attrib.get("idref")
        ]

        chapters = []
        for chapter_index, item_id in enumerate(spine, start=1):
            href = manifest.get(item_id)
            if not href:
                continue

            chapter_path = normpath(join(package_dir, href))
            try:
                with archive.open(chapter_path) as handle:
                    html = handle.read().decode("utf-8", errors="ignore")
            except KeyError:
                continue

            parser = TextExtractor()
            parser.feed(html)
            text = parser.get_text().strip()
            if not text:
                continue

            chapters.append({
                "chapter": chapter_index,
                "path": chapter_path,
                "text": text,
            })

    print(
        json.dumps(
            {
                "path": str(epub_path),
                "chapter_count": len(chapters),
                "chapters": chapters,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
