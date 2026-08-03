#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any

from mtg_data import (
    DATA_DIR,
    DECK_CATALOG_FIELDS,
    csv_text,
    deck_id as make_deck_id,
    generate_exports,
    is_known,
    load_dataset,
    normalize_text,
    read_deck_catalog,
    save_dataset,
)

REVIEW_PATH = DATA_DIR / "deck_review.json"
DECK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*(--[a-z0-9][a-z0-9_-]*)+$")
IDENTITY_FIELDS = [
    "owner_player",
    "display_name",
    "official_name",
    "commander_name",
    "moxfield_url",
    "archidekt_url",
    "edhrec_url",
    "archetype",
    "power_level",
    "tags",
    "colors",
    "notes",
]


def assignment_key(player: str, deck_name: str) -> str:
    return f"{player}||{deck_name}"


def sorted_unique(values: list[str]) -> list[str]:
    return sorted({value for value in values if is_known(value)}, key=lambda value: (normalize_text(value), value))


def existing_review(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def catalog_maps(catalog: list[dict[str, Any]]) -> tuple[dict[tuple[str, str], dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    by_pair = {(row["player"], row["deck_name_normalized"]): row for row in catalog}
    by_deck_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in catalog:
        if is_known(row.get("deck_id")):
            by_deck_id[row["deck_id"]].append(row)
    return by_pair, by_deck_id


def preferred_identity_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    for row in rows:
        if row.get("player") == row.get("owner_player"):
            return row
    return rows[0]


def identity_from_rows(deck_id: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    preferred = preferred_identity_row(rows)
    all_aliases = []
    all_variants = []
    pilots = []
    games_played = 0
    wins = 0
    for row in rows:
        pilots.append(row.get("player", ""))
        all_aliases.extend(row.get("aliases_list", []))
        all_variants.extend(row.get("variants_list", []))
        games_played += int(row.get("games_played") or 0)
        wins += int(row.get("wins") or 0)

    return {
        "deck_id": deck_id,
        "owner_player": preferred.get("owner_player") or preferred.get("player", ""),
        "display_name": preferred.get("display_name") or preferred.get("deck_name_normalized", ""),
        "official_name": preferred.get("official_name", ""),
        "commander_name": preferred.get("commander_name", ""),
        "moxfield_url": preferred.get("moxfield_url", ""),
        "archidekt_url": preferred.get("archidekt_url", ""),
        "edhrec_url": preferred.get("edhrec_url", ""),
        "archetype": preferred.get("archetype", ""),
        "power_level": preferred.get("power_level", ""),
        "tags": preferred.get("tags", ""),
        "colors": preferred.get("colors", ""),
        "notes": preferred.get("notes", ""),
        "stats": {
            "pilots": sorted_unique(pilots),
            "games_played": games_played,
            "wins": wins,
            "aliases": sorted_unique(all_aliases),
            "variants": sorted_unique(all_variants),
        },
    }


def collect_assignment_stats(dataset: dict[str, Any], catalog: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_pair, _ = catalog_maps(catalog)
    stats: dict[str, dict[str, Any]] = {}

    for game in dataset["games"]:
        for participant in game.get("participants", []):
            player = participant.get("player", "")
            deck_name = participant.get("deck_name_normalized", "")
            if not is_known(player) or not is_known(deck_name):
                continue

            key = assignment_key(player, deck_name)
            catalog_row = by_pair.get((player, deck_name), {})
            current_deck_id = (
                participant.get("deck_id")
                or catalog_row.get("deck_id")
                or make_deck_id(player, deck_name)
            )
            current_owner = (
                participant.get("deck_owner")
                or catalog_row.get("owner_player")
                or player
            )

            if key not in stats:
                stats[key] = {
                    "assignment_key": key,
                    "player": player,
                    "source_deck_name_normalized": deck_name,
                    "current_deck_id": current_deck_id,
                    "current_deck_owner": current_owner,
                    "target_deck_id": current_deck_id,
                    "target_deck_name_normalized": deck_name,
                    "target_assignment_confidence": "",
                    "target_notes": None,
                    "stats": {
                        "appearances": 0,
                        "wins": 0,
                        "first_played": game["date"],
                        "last_played": game["date"],
                        "raw_names": [],
                        "variants": [],
                        "game_ids": [],
                    },
                }

            row = stats[key]
            row["stats"]["appearances"] += 1
            row["stats"]["wins"] += 1 if game.get("winner_player") == player else 0
            row["stats"]["first_played"] = min(row["stats"]["first_played"], game["date"])
            row["stats"]["last_played"] = max(row["stats"]["last_played"], game["date"])
            row["stats"]["raw_names"].append(participant.get("deck_name_raw", ""))
            row["stats"]["variants"].append(participant.get("deck_variant", ""))
            row["stats"]["game_ids"].append(game["game_id"])

    rows = []
    for row in stats.values():
        row["stats"]["raw_names"] = sorted_unique(row["stats"]["raw_names"])
        row["stats"]["variants"] = sorted_unique(row["stats"]["variants"])
        row["stats"]["game_ids"] = sorted_unique(row["stats"]["game_ids"])
        rows.append(row)

    return sorted(rows, key=lambda row: (row["current_deck_id"], normalize_text(row["player"]), normalize_text(row["source_deck_name_normalized"])))


def merge_existing_edits(review: dict[str, Any], existing: dict[str, Any]) -> dict[str, Any]:
    if not existing:
        return review

    existing_assignments = {
        row.get("assignment_key"): row
        for row in existing.get("assignments", [])
        if row.get("assignment_key")
    }
    for assignment in review["assignments"]:
        previous = existing_assignments.get(assignment["assignment_key"])
        if not previous:
            continue
        for field in ["target_deck_id", "target_deck_name_normalized", "target_assignment_confidence", "target_notes"]:
            if field in previous:
                assignment[field] = previous[field]

    existing_identities = {
        row.get("deck_id"): row
        for row in existing.get("identities", [])
        if row.get("deck_id")
    }
    for identity in review["identities"]:
        previous = existing_identities.get(identity["deck_id"])
        if not previous:
            continue
        for field in IDENTITY_FIELDS:
            if field in previous:
                identity[field] = previous[field]

    review["game_overrides"] = existing.get("game_overrides", review["game_overrides"])
    return review


def build_review(dataset: dict[str, Any], catalog: list[dict[str, Any]]) -> dict[str, Any]:
    _, by_deck_id = catalog_maps(catalog)
    identities = [
        identity_from_rows(deck_id, rows)
        for deck_id, rows in sorted(by_deck_id.items(), key=lambda item: item[0])
    ]

    return {
        "version": 1,
        "instructions": [
            "Edita target_deck_id y target_deck_name_normalized en assignments.",
            "Si dos filas deben ser el mismo deck real, apunta ambas al mismo target_deck_id.",
            "Si una fila fue fusionada por error, crea una identidad nueva en identities y apunta esa assignment al nuevo deck_id.",
            "Edita owner_player, display_name, official_name, commander_name, links, archetype, power_level, tags y colors dentro de identities.",
            "No edites stats salvo que quieras dejar notas personales; el script las regenera.",
            "Para casos puntuales por partida, agrega filas en game_overrides con game_id, seat_order, target_deck_id y target_deck_name_normalized.",
        ],
        "identities": identities,
        "assignments": collect_assignment_stats(dataset, catalog),
        "game_overrides": [],
        "_game_override_template": {
            "game_id": "G2026-000",
            "seat_order": 1,
            "target_deck_id": "owner--deck",
            "target_deck_name_normalized": "Deck",
            "target_assignment_confidence": "high",
            "target_notes": "Motivo opcional",
        },
    }


def export_review(args: argparse.Namespace) -> int:
    dataset = load_dataset()
    catalog = read_deck_catalog()
    review = build_review(dataset, catalog)
    if not args.fresh:
        review = merge_existing_edits(review, existing_review(args.path))

    text = json.dumps(review, ensure_ascii=False, indent=2) + "\n"
    if args.dry_run:
        print(text)
        return 0

    args.path.write_text(text, encoding="utf-8")
    print(f"Escrito {args.path}")
    print(f"- identities: {len(review['identities'])}")
    print(f"- assignments: {len(review['assignments'])}")
    return 0


def identity_map(review: dict[str, Any]) -> dict[str, dict[str, Any]]:
    identities = {}
    for row in review.get("identities", []):
        deck_id = str(row.get("deck_id", "")).strip()
        if not deck_id:
            raise ValueError("Hay una identidad sin deck_id")
        if not DECK_ID_RE.match(deck_id):
            raise ValueError(f"deck_id inválido: {deck_id}")
        if deck_id in identities:
            raise ValueError(f"Identidad duplicada: {deck_id}")
        identities[deck_id] = row
    return identities


def assignment_maps(review: dict[str, Any], identities: dict[str, dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    source_map = {}
    target_map = {}
    for row in review.get("assignments", []):
        source_key = row.get("assignment_key")
        target_deck_id = row.get("target_deck_id", "")
        target_name = row.get("target_deck_name_normalized", "")
        if not source_key:
            raise ValueError("Hay una assignment sin assignment_key")
        if target_deck_id not in identities:
            raise ValueError(f"{source_key}: target_deck_id no existe en identities: {target_deck_id}")
        if not is_known(target_name):
            raise ValueError(f"{source_key}: target_deck_name_normalized está vacío")
        source_map[source_key] = row
        target_key = assignment_key(row.get("player", ""), target_name)
        target_map.setdefault(target_key, row)
    return source_map, target_map


def apply_assignment(participant: dict[str, Any], assignment: dict[str, Any], identities: dict[str, dict[str, Any]]) -> dict[str, Any]:
    updated = deepcopy(participant)
    target_deck_id = assignment["target_deck_id"]
    identity = identities[target_deck_id]
    updated["deck_name_normalized"] = assignment["target_deck_name_normalized"]
    updated["deck_id"] = target_deck_id
    updated["deck_owner"] = identity.get("owner_player") or updated.get("player", "")
    if is_known(assignment.get("target_assignment_confidence")):
        updated["assignment_confidence"] = assignment["target_assignment_confidence"]
    if assignment.get("target_notes") is not None:
        updated["notes"] = assignment.get("target_notes", "")
    return updated


def apply_game_override(dataset: dict[str, Any], override: dict[str, Any], identities: dict[str, dict[str, Any]]) -> bool:
    game_id = str(override.get("game_id", "")).strip()
    if not game_id:
        return False
    seat_order = int(override.get("seat_order") or 0)
    target_deck_id = str(override.get("target_deck_id", "")).strip()
    if target_deck_id not in identities:
        raise ValueError(f"{game_id}/{seat_order}: target_deck_id no existe en identities: {target_deck_id}")

    for game in dataset["games"]:
        if game["game_id"] != game_id:
            continue
        for index, participant in enumerate(game.get("participants", [])):
            if participant.get("seat_order") != seat_order:
                continue
            assignment = {
                "target_deck_id": target_deck_id,
                "target_deck_name_normalized": override.get("target_deck_name_normalized") or identities[target_deck_id].get("display_name", ""),
                "target_assignment_confidence": override.get("target_assignment_confidence") or "high",
                "target_notes": override.get("target_notes"),
            }
            game["participants"][index] = apply_assignment(participant, assignment, identities)
            return True
        raise ValueError(f"{game_id}: no existe seat_order={seat_order}")

    raise ValueError(f"No existe game_id en game_overrides: {game_id}")


def apply_identity_metadata_to_catalog(rows: list[dict[str, Any]], identities: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    updated_rows = []
    for row in rows:
        updated = {field: row.get(field, "") for field in DECK_CATALOG_FIELDS}
        identity = identities.get(row.get("deck_id", ""))
        if identity:
            for field in IDENTITY_FIELDS:
                if field in identity:
                    updated[field] = identity.get(field, "")
        updated_rows.append(updated)
    return updated_rows


def write_generated_files(dataset: dict[str, Any]) -> None:
    generated = generate_exports(dataset, current_catalog=read_deck_catalog())
    for path, text in generated.items():
        path.write_text(text, encoding="utf-8")


def write_catalog_metadata(identities: dict[str, dict[str, Any]]) -> None:
    rows = read_deck_catalog()
    updated_rows = apply_identity_metadata_to_catalog(rows, identities)
    (DATA_DIR / "deck_catalog.csv").write_text(csv_text(DECK_CATALOG_FIELDS, updated_rows), encoding="utf-8")


def apply_review(args: argparse.Namespace) -> int:
    review = json.loads(args.path.read_text(encoding="utf-8"))
    identities = identity_map(review)
    source_map, target_map = assignment_maps(review, identities)
    dataset = load_dataset()
    changed = 0

    for game in dataset["games"]:
        for index, participant in enumerate(game.get("participants", [])):
            player = participant.get("player", "")
            deck_name = participant.get("deck_name_normalized", "")
            current_key = assignment_key(player, deck_name)
            assignment = source_map.get(current_key) or target_map.get(current_key)
            if not assignment:
                continue
            updated = apply_assignment(participant, assignment, identities)
            if updated != participant:
                game["participants"][index] = updated
                changed += 1

    for override in review.get("game_overrides", []):
        if apply_game_override(dataset, override, identities):
            changed += 1

    if args.dry_run:
        print(f"Dry run: {changed} participantes cambiarían.")
        return 0

    save_dataset(dataset)
    write_generated_files(dataset)
    write_catalog_metadata(identities)
    print(f"Aplicado {args.path}")
    print(f"- participantes actualizados: {changed}")
    print("- archivos derivados regenerados")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera y aplica un JSON editable para limpiar identidades de decks.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    export_parser = subparsers.add_parser("export", help="Genera data/deck_review.json desde los datos actuales.")
    export_parser.add_argument("--path", type=Path, default=REVIEW_PATH)
    export_parser.add_argument("--fresh", action="store_true", help="Ignora ediciones existentes en el review JSON.")
    export_parser.add_argument("--dry-run", action="store_true")

    apply_parser = subparsers.add_parser("apply", help="Aplica data/deck_review.json a games.json y derivados.")
    apply_parser.add_argument("--path", type=Path, default=REVIEW_PATH)
    apply_parser.add_argument("--dry-run", action="store_true")

    args = parser.parse_args()
    try:
        if args.command == "export":
            return export_review(args)
        if args.command == "apply":
            return apply_review(args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    return 1


if __name__ == "__main__":
    sys.exit(main())
