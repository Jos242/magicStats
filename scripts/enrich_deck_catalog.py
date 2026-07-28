#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from mtg_data import (
    DATA_DIR,
    DECK_CATALOG_FIELDS,
    csv_text,
    is_known,
    moxfield_public_id,
    normalize_moxfield_url,
    read_csv_rows,
)

CATALOG_PATH = DATA_DIR / "deck_catalog.csv"
USER_AGENT = "magicStats/1.0 (+https://github.com/Jos242/magicStats)"
API_ENDPOINTS = (
    "https://api2.moxfield.com/v2/decks/all/{public_id}",
    "https://api.moxfield.com/v2/decks/all/{public_id}",
)
HTML_ENDPOINTS = (
    "https://moxfield.com/decks/{public_id}",
    "https://www.moxfield.com/decks/{public_id}",
)


@dataclass
class DeckMetadata:
    official_name: str = ""
    commander_name: str = ""
    source: str = ""


class FetchFailure(Exception):
    pass


def request_text(url: str, timeout: int, accept: str) -> str:
    request = Request(
        url,
        headers={
            "Accept": accept,
            "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
            "Referer": "https://moxfield.com/",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except HTTPError as exc:
        raise FetchFailure(f"{url}: HTTP {exc.code}") from exc
    except URLError as exc:
        raise FetchFailure(f"{url}: {exc.reason}") from exc
    except TimeoutError as exc:
        raise FetchFailure(f"{url}: timeout") from exc


def compact_text(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


def card_name_from_entry(entry: Any) -> str:
    if not isinstance(entry, dict):
        return ""
    if is_known(entry.get("name")):
        return str(entry["name"]).strip()
    card = entry.get("card")
    if isinstance(card, dict) and is_known(card.get("name")):
        return str(card["name"]).strip()
    return ""


def commander_names(deck: dict[str, Any]) -> list[str]:
    commanders = deck.get("commanders")
    if not isinstance(commanders, dict):
        return []

    names = []
    for entry in commanders.values():
        name = card_name_from_entry(entry)
        if name and name not in names:
            names.append(name)
    return names


def parse_json_metadata(raw_json: str) -> DeckMetadata:
    deck = json.loads(raw_json)
    if not isinstance(deck, dict):
        raise ValueError("La respuesta JSON no contiene un objeto de deck")

    official_name = compact_text(deck.get("name", ""))
    commander_name = " / ".join(commander_names(deck))

    if not official_name and not commander_name:
        raise ValueError("La respuesta JSON no tiene name ni commanders")

    return DeckMetadata(official_name=official_name, commander_name=commander_name, source="moxfield_api")


def html_attr(tag: str, name: str) -> str:
    match = re.search(rf'\b{re.escape(name)}=["\']([^"\']+)["\']', tag, flags=re.IGNORECASE)
    return compact_text(match.group(1)) if match else ""


def meta_content(raw_html: str, name: str) -> str:
    for match in re.finditer(r"<meta\b[^>]*>", raw_html, flags=re.IGNORECASE):
        tag = match.group(0)
        meta_name = html_attr(tag, "property") or html_attr(tag, "name")
        if meta_name.casefold() == name.casefold():
            return html_attr(tag, "content")
    return ""


def parse_html_metadata(raw_html: str) -> DeckMetadata:
    title = meta_content(raw_html, "og:title") or meta_content(raw_html, "twitter:title")
    if not title:
        match = re.search(r"<title[^>]*>(.*?)</title>", raw_html, flags=re.IGNORECASE | re.DOTALL)
        title = compact_text(match.group(1)) if match else ""

    title = re.sub(r"\s*\|\s*Moxfield\s*$", "", title, flags=re.IGNORECASE).strip()
    commander_match = re.match(r"^(?P<name>.+?)\s*-\s*Commander\s*\((?P<commander>.+?)\)\s*$", title)
    if commander_match:
        return DeckMetadata(
            official_name=compact_text(commander_match.group("name")),
            commander_name=compact_text(commander_match.group("commander")),
            source="moxfield_html",
        )

    if title:
        return DeckMetadata(official_name=title, commander_name="", source="moxfield_html")

    raise ValueError("La página HTML no contiene title usable")


def fetch_moxfield_metadata(moxfield_url: str, timeout: int) -> DeckMetadata:
    public_id = moxfield_public_id(moxfield_url)
    if not public_id:
        raise FetchFailure(f"Link inválido de Moxfield: {moxfield_url}")

    failures = []
    for template in API_ENDPOINTS:
        endpoint = template.format(public_id=public_id)
        try:
            return parse_json_metadata(request_text(endpoint, timeout, "application/json,text/plain,*/*"))
        except Exception as exc:
            failures.append(str(exc))

    for template in HTML_ENDPOINTS:
        endpoint = template.format(public_id=public_id)
        try:
            return parse_html_metadata(request_text(endpoint, timeout, "text/html,*/*"))
        except Exception as exc:
            failures.append(str(exc))

    raise FetchFailure("; ".join(failures))


def row_value(row: dict[str, str], field: str) -> str:
    return str(row.get(field, "") or "").strip()


def set_if_allowed(row: dict[str, str], field: str, value: str, overwrite: bool) -> bool:
    value = str(value or "").strip()
    if not value:
        return False
    if not overwrite and is_known(row.get(field)):
        return False
    if row.get(field, "") == value:
        return False
    row[field] = value
    return True


def preferred_url(rows: list[dict[str, str]]) -> str:
    sorted_rows = sorted(
        rows,
        key=lambda row: 0 if row_value(row, "player") == row_value(row, "owner_player") else 1,
    )
    for row in sorted_rows:
        url = normalize_moxfield_url(row_value(row, "moxfield_url"))
        if url:
            return url
    return ""


def needs_metadata(rows: list[dict[str, str]], overwrite: bool) -> bool:
    if overwrite:
        return True
    return any(
        not is_known(row.get("official_name")) or not is_known(row.get("commander_name"))
        for row in rows
    )


def load_catalog(path: Path) -> list[dict[str, str]]:
    rows = read_csv_rows(path)
    for row in rows:
        for field in DECK_CATALOG_FIELDS:
            row.setdefault(field, "")
    return rows


def write_catalog(path: Path, rows: list[dict[str, str]]) -> None:
    path.write_text(csv_text(DECK_CATALOG_FIELDS, rows), encoding="utf-8")


def enrich_catalog(args: argparse.Namespace) -> int:
    rows = load_catalog(args.catalog)
    by_deck_id: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        deck_id = row_value(row, "deck_id")
        if deck_id:
            by_deck_id.setdefault(deck_id, []).append(row)

    selected_deck_ids = set(args.deck_id or [])
    changed = 0
    fetched = 0
    skipped = 0
    failed = 0

    for deck_id, deck_rows in sorted(by_deck_id.items()):
        if selected_deck_ids and deck_id not in selected_deck_ids:
            continue

        url = preferred_url(deck_rows)
        if not url:
            skipped += 1
            continue
        if not needs_metadata(deck_rows, args.overwrite):
            skipped += 1
            continue

        try:
            metadata = fetch_moxfield_metadata(url, args.timeout)
            fetched += 1
        except FetchFailure as exc:
            failed += 1
            if not args.quiet:
                print(f"ERROR {deck_id}: {exc}", file=sys.stderr)
            continue

        for row in deck_rows:
            changed += set_if_allowed(row, "moxfield_url", url, overwrite=False)
            changed += set_if_allowed(row, "official_name", metadata.official_name, args.overwrite)
            changed += set_if_allowed(row, "commander_name", metadata.commander_name, args.overwrite)

        if not args.quiet:
            print(f"{deck_id}: {metadata.official_name or 'sin nombre'} / {metadata.commander_name or 'sin comandante'} ({metadata.source})")

        if args.sleep > 0:
            time.sleep(args.sleep)

    if args.dry_run:
        if not args.quiet:
            print(f"Dry run: {changed} celdas cambiarían.")
    elif changed:
        write_catalog(args.catalog, rows)

    if not args.quiet:
        print(f"Resumen: fetched={fetched}, skipped={skipped}, failed={failed}, changed={changed}")

    return 1 if args.strict and failed else 0


def inspect_url(args: argparse.Namespace) -> int:
    url = normalize_moxfield_url(args.url)
    if not url:
        print(f"ERROR: link inválido de Moxfield: {args.url}", file=sys.stderr)
        return 1
    metadata = fetch_moxfield_metadata(url, args.timeout)
    print(json.dumps(metadata.__dict__, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Completa deck_catalog.csv con metadata de Moxfield.")
    parser.add_argument("--catalog", type=Path, default=CATALOG_PATH, help="CSV de catálogo a enriquecer.")
    parser.add_argument("--deck-id", action="append", help="Limita la ejecución a un deck_id. Puede repetirse.")
    parser.add_argument("--url", help="Inspecciona un link de Moxfield sin editar el catálogo.")
    parser.add_argument("--timeout", type=int, default=15, help="Timeout por request en segundos.")
    parser.add_argument("--sleep", type=float, default=0.25, help="Pausa entre decks para no golpear Moxfield.")
    parser.add_argument("--overwrite", action="store_true", help="Pisa official_name/commander_name existentes.")
    parser.add_argument("--dry-run", action="store_true", help="Muestra cambios sin escribir el CSV.")
    parser.add_argument("--strict", action="store_true", help="Devuelve código 1 si algún fetch falla.")
    parser.add_argument("--quiet", action="store_true", help="Reduce la salida.")
    args = parser.parse_args()

    try:
        if args.url:
            return inspect_url(args)
        return enrich_catalog(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
