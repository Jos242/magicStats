#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
GAMES_JSON = DATA_DIR / "games.json"

GAME_FIELDS = [
    "game_id",
    "date",
    "location",
    "player_count",
    "result_type",
    "winner_player",
    "winner_raw",
    "starting_player",
    "turn_order",
    "start_time",
    "end_time",
    "duration_minutes",
    "win_condition_category",
    "win_condition_text",
    "nuke_recorded",
    "nuke_player",
    "sol_ring_t1_recorded",
    "sol_ring_t1_player",
    "parse_confidence",
    "needs_review",
    "notes",
    "source_line",
    "raw_line",
]

PARTICIPANT_FIELDS = [
    "game_id",
    "seat_order",
    "player",
    "deck_name_raw",
    "deck_name_normalized",
    "deck_id",
    "deck_owner",
    "moxfield_url",
    "deck_variant",
    "commander_name",
    "result",
    "assignment_confidence",
    "notes",
]

EVENT_FIELDS = [
    "game_id",
    "event_order",
    "event_type",
    "actor",
    "target",
    "method",
    "notes",
    "explicitness",
]

DECK_CATALOG_FIELDS = [
    "deck_id",
    "owner_player",
    "player",
    "deck_name_normalized",
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
    "first_played",
    "last_played",
    "games_played",
    "wins",
    "notes",
    "aliases",
    "variants",
    "win_rate",
]

QUALITY_FIELDS = ["game_id", "date", "parse_confidence", "needs_review", "notes", "raw_line"]

WIN_CONDITION_ALIASES = {
    "combat": "combat_damage",
    "combat damage": "combat_damage",
    "combat_damage": "combat_damage",
    "commander": "commander_damage",
    "commander damage": "commander_damage",
    "commander_damage": "commander_damage",
    "direct": "direct_damage",
    "direct damage": "direct_damage",
    "direct_damage": "direct_damage",
    "damage": "damage_unspecified",
    "damage unspecified": "damage_unspecified",
    "damage_unspecified": "damage_unspecified",
    "tokens": "tokens",
    "token": "tokens",
    "token damage": "tokens",
    "mill": "mill",
    "concessions": "concessions",
    "concession": "concessions",
    "last player standing": "last_player_standing",
    "last_player_standing": "last_player_standing",
    "eliminated all": "eliminated_all",
    "eliminated_all": "eliminated_all",
}

EVENT_METHOD_ALIASES = {
    "combat": "combat_damage",
    "combat damage": "combat_damage",
    "combat_damage": "combat_damage",
    "commander": "commander_damage",
    "commander damage": "commander_damage",
    "commander_damage": "commander_damage",
    "direct": "direct_damage",
    "direct damage": "direct_damage",
    "direct_damage": "direct_damage",
    "token": "token_damage",
    "tokens": "token_damage",
    "token damage": "token_damage",
    "token_damage": "token_damage",
    "mill": "mill",
    "concession": "concession",
    "unspecified": "unspecified",
    "unknown": "unspecified",
}

OTHER_PLAYER_VALUES = {"otro jugador", "other", "other player", "nuevo jugador", "new player"}
MOXFIELD_DECK_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


@dataclass
class DeckResolution:
    raw: str
    normalized: str
    deck_id: str
    owner_player: str
    official_name: str
    variant: str
    commander_name: str
    moxfield_url: str
    archidekt_url: str
    edhrec_url: str
    assignment_confidence: str
    notes: str
    is_new_deck: bool
    needs_review: bool


def normalize_text(value: Any) -> str:
    text = str(value or "").strip()
    text = re.sub("andr(?:\\?|\\ufffd|\\u00e9)s", "Andres", text, flags=re.IGNORECASE)
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", text).casefold()


def slugify(value: str) -> str:
    text = normalize_text(value)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "unknown"


def is_known(value: Any) -> bool:
    return value is not None and str(value).strip() != ""


def moxfield_public_id(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    parsed = urlparse(text)
    if parsed.scheme and parsed.netloc:
        host = parsed.netloc.casefold()
        if host not in {"moxfield.com", "www.moxfield.com"}:
            return ""
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2 and parts[0] == "decks" and MOXFIELD_DECK_ID_RE.match(parts[1]):
            return parts[1]
        return ""

    return text if MOXFIELD_DECK_ID_RE.match(text) else ""


def normalize_moxfield_url(value: str) -> str:
    public_id = moxfield_public_id(value)
    return f"https://moxfield.com/decks/{public_id}" if public_id else ""


def load_dataset(path: Path = GAMES_JSON) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def save_dataset(dataset: dict[str, Any], path: Path = GAMES_JSON) -> None:
    path.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def csv_text(fieldnames: list[str], rows: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({field: csv_cell(row.get(field)) for field in fieldnames})
    return buffer.getvalue()


def csv_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return value


def parse_json_list(value: str) -> list[str]:
    if not is_known(value):
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [str(item) for item in parsed if is_known(item)] if isinstance(parsed, list) else []


def json_list(values: list[str]) -> str:
    clean = sorted({value for value in values if is_known(value)}, key=lambda value: (normalize_text(value), value))
    return json.dumps(clean, ensure_ascii=False)


def json_color_list(values: list[str]) -> str:
    order = {color: index for index, color in enumerate(("W", "U", "B", "R", "G"))}
    clean = {str(value).strip().upper() for value in values if is_known(value)}
    sorted_colors = [color for color in ("W", "U", "B", "R", "G") if color in clean]
    extra = sorted((color for color in clean if color not in order), key=lambda value: (normalize_text(value), value))
    return json.dumps(sorted_colors + extra, ensure_ascii=False)


def read_player_aliases(path: Path = DATA_DIR / "player_aliases.csv") -> dict[str, str]:
    aliases: dict[str, str] = {}
    for row in read_csv_rows(path):
        canonical = row.get("canonical_player", "").strip()
        raw = row.get("raw_alias", "").strip()
        if canonical:
            aliases[normalize_text(canonical)] = canonical
        if canonical and raw:
            aliases[normalize_text(raw)] = canonical
    return aliases


def normalize_player(raw_player: str, aliases: dict[str, str]) -> str:
    key = normalize_text(raw_player)
    if not key:
        return ""
    if key not in aliases:
        raise ValueError(f"Jugador desconocido: {raw_player}")
    return aliases[key]


def read_deck_catalog(path: Path = DATA_DIR / "deck_catalog.csv") -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in read_csv_rows(path):
        player = row.get("player", "").strip()
        owner_player = row.get("owner_player", "").strip() or player
        rows.append(
            {
                **row,
                "player": player,
                "owner_player": owner_player,
                "official_name": row.get("official_name", "").strip(),
                "moxfield_url": row.get("moxfield_url", "").strip(),
                "archidekt_url": row.get("archidekt_url", "").strip(),
                "edhrec_url": row.get("edhrec_url", "").strip(),
                "archetype": row.get("archetype", "").strip(),
                "power_level": row.get("power_level", "").strip(),
                "tags": row.get("tags", "").strip(),
                "colors": row.get("colors", "").strip(),
                "games_played": int(row.get("games_played") or 0),
                "wins": int(row.get("wins") or 0),
                "win_rate": float(row.get("win_rate") or 0),
                "aliases_list": parse_json_list(row.get("aliases", "")),
                "variants_list": parse_json_list(row.get("variants", "")),
                "tags_list": parse_json_list(row.get("tags", "")),
                "colors_list": parse_json_list(row.get("colors", "")),
            }
        )
    return rows


def deck_catalog_lookup(catalog_rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    lookup: dict[tuple[str, str], dict[str, Any]] = {}
    for row in catalog_rows:
        player = row.get("player", "")
        candidates = [
            row.get("deck_name_normalized", ""),
            row.get("display_name", ""),
            row.get("official_name", ""),
            *row.get("aliases_list", []),
        ]
        for candidate in candidates:
            if is_known(candidate):
                lookup[(player, normalize_text(candidate))] = row
    return lookup


def deck_identity_lookup(catalog_rows: list[dict[str, Any]]) -> dict[str, dict[str, dict[str, Any]]]:
    lookup: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in catalog_rows:
        row_deck_id = row.get("deck_id", "")
        if not is_known(row_deck_id):
            continue
        candidates = [
            row.get("deck_name_normalized", ""),
            row.get("display_name", ""),
            row.get("official_name", ""),
            *row.get("aliases_list", []),
        ]
        for candidate in candidates:
            if is_known(candidate):
                lookup[normalize_text(candidate)][row_deck_id] = row
    return lookup


def preferred_catalog_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    for row in rows:
        if row.get("owner_player") and row.get("player") == row.get("owner_player"):
            return row
    return rows[0]


def catalog_deck_id(row: dict[str, Any]) -> str:
    return row.get("deck_id") or deck_id(row.get("owner_player") or row.get("player", ""), row.get("deck_name_normalized", ""))


def extract_variant(raw_deck: str) -> tuple[str, str]:
    match = re.search(r"\(([^)]+)\)", raw_deck)
    if not match:
        return raw_deck.strip(), ""
    deck_without_variant = re.sub(r"\s*\([^)]+\)\s*", " ", raw_deck).strip()
    variant = match.group(1).strip()
    return deck_without_variant or raw_deck.strip(), variant[:1].upper() + variant[1:]


def title_deck_name(raw_deck: str) -> str:
    words = re.split(r"(\s+|[-/])", raw_deck.strip())
    return "".join(word[:1].upper() + word[1:] if word and word[0].isalpha() else word for word in words)


def resolve_deck(player: str, raw_deck: str, catalog_rows: list[dict[str, Any]]) -> DeckResolution:
    cleaned_deck, variant = extract_variant(raw_deck)
    lookup = deck_catalog_lookup(catalog_rows)
    identity_lookup = deck_identity_lookup(catalog_rows)
    candidates = [raw_deck, cleaned_deck]

    for candidate in candidates:
        row = lookup.get((player, normalize_text(candidate)))
        if row:
            return DeckResolution(
                raw=raw_deck,
                normalized=row["deck_name_normalized"],
                deck_id=catalog_deck_id(row),
                owner_player=row.get("owner_player") or row["player"],
                official_name=row.get("official_name", ""),
                variant=variant,
                commander_name=row.get("commander_name", ""),
                moxfield_url=row.get("moxfield_url", ""),
                archidekt_url=row.get("archidekt_url", ""),
                edhrec_url=row.get("edhrec_url", ""),
                assignment_confidence="high",
                notes="",
                is_new_deck=False,
                needs_review=False,
            )

    for candidate in candidates:
        matches_by_id = identity_lookup.get(normalize_text(candidate), {})
        if len(matches_by_id) == 1:
            row = preferred_catalog_row(list(matches_by_id.values()))
            owner_player = row.get("owner_player") or row["player"]
            return DeckResolution(
                raw=raw_deck,
                normalized=row["deck_name_normalized"],
                deck_id=catalog_deck_id(row),
                owner_player=owner_player,
                official_name=row.get("official_name", ""),
                variant=variant,
                commander_name=row.get("commander_name", ""),
                moxfield_url=row.get("moxfield_url", ""),
                archidekt_url=row.get("archidekt_url", ""),
                edhrec_url=row.get("edhrec_url", ""),
                assignment_confidence="medium",
                notes=f"Deck resuelto por nombre único del catálogo; revisar si {player} estaba usando un deck de {owner_player}.",
                is_new_deck=False,
                needs_review=True,
            )

        if len(matches_by_id) > 1:
            normalized = title_deck_name(cleaned_deck)
            return DeckResolution(
                raw=raw_deck,
                normalized=normalized,
                deck_id=deck_id(player, normalized),
                owner_player=player,
                official_name="",
                variant=variant,
                commander_name="",
                moxfield_url="",
                archidekt_url="",
                edhrec_url="",
                assignment_confidence="medium",
                notes="Nombre de deck ambiguo en deck_catalog.csv; revisar identidad antes de merge.",
                is_new_deck=True,
                needs_review=True,
            )

    normalized = title_deck_name(cleaned_deck)
    return DeckResolution(
        raw=raw_deck,
        normalized=normalized,
        deck_id=deck_id(player, normalized),
        owner_player=player,
        official_name="",
        variant=variant,
        commander_name="",
        moxfield_url="",
        archidekt_url="",
        edhrec_url="",
        assignment_confidence="medium",
        notes="Deck nuevo o alias no encontrado en deck_catalog.csv; revisar antes de merge.",
        is_new_deck=True,
        needs_review=True,
    )


def next_game_id(games: list[dict[str, Any]], game_date: str) -> str:
    year = int(game_date[:4])
    max_number = 0
    pattern = re.compile(rf"^G{year}-(\d+)$")
    for game in games:
        match = pattern.match(game.get("game_id", ""))
        if match:
            max_number = max(max_number, int(match.group(1)))
    return f"G{year}-{max_number + 1:03d}"


def parse_int_or_none(value: str) -> int | None:
    if not is_known(value):
        return None
    return int(str(value).strip())


def parse_bool_checkbox(value: str) -> bool:
    return "[x]" in str(value).lower() or "true" in str(value).lower()


def normalize_location(value: str) -> str:
    key = normalize_text(value)
    if key in {"virtual", "online"}:
        return "virtual"
    if key in {"in person", "presencial", "in_person"}:
        return "in_person"
    raise ValueError(f"Ubicación inválida: {value}")


def normalize_win_condition(value: str) -> str | None:
    key = normalize_text(value)
    if not key or key in {"none", "no registrado", "_no response_"}:
        return None
    if key not in WIN_CONDITION_ALIASES:
        raise ValueError(f"Condición de victoria desconocida: {value}")
    return WIN_CONDITION_ALIASES[key]


def normalize_event_method(value: str) -> str:
    key = normalize_text(value)
    if not key:
        return "unspecified"
    return EVENT_METHOD_ALIASES.get(key, slugify(value))


def is_other_player_value(value: str) -> bool:
    return normalize_text(value) in OTHER_PLAYER_VALUES


def validate_iso_date(value: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"Fecha inválida, usa YYYY-MM-DD: {value}") from exc
    return value


def sorted_games(games: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(games, key=lambda game: (game.get("date", ""), game.get("game_id", "")))


def deck_id(player: str, deck_name: str) -> str:
    return f"{slugify(player)}--{slugify(deck_name)}"


def build_summary(dataset: dict[str, Any]) -> dict[str, Any]:
    games = dataset["games"]
    locations = Counter(game["location"] for game in games)
    players = sorted(
        {participant["player"] for game in games for participant in game["participants"]},
        key=normalize_text,
    )
    games_played_by_player = Counter(
        participant["player"] for game in games for participant in game["participants"]
    )
    wins_by_player = Counter(
        game["winner_player"]
        for game in games
        if game.get("result_type") == "win" and is_known(game.get("winner_player"))
    )
    durations = [game["duration_minutes"] for game in games if game.get("duration_minutes") is not None]
    sorted_durations = sorted(durations)
    if sorted_durations:
      mid = len(sorted_durations) // 2
      median_duration = (
          sorted_durations[mid]
          if len(sorted_durations) % 2
          else (sorted_durations[mid - 1] + sorted_durations[mid]) / 2
      )
    else:
      median_duration = None

    return {
        "season_year": dataset.get("metadata", {}).get("season_year", 2026),
        "total_games": len(games),
        "decisive_games": sum(game["result_type"] == "win" for game in games),
        "draws": sum(game["result_type"] == "draw" for game in games),
        "locations": {
            "in_person": locations["in_person"],
            "virtual": locations["virtual"],
        },
        "players": players,
        "games_played_by_player": dict(games_played_by_player),
        "wins_by_player": dict(wins_by_player),
        "win_rate_by_player": {
            player: round(wins_by_player[player] / games_played_by_player[player], 4)
            for player in players
            if games_played_by_player[player]
        },
        "duration_coverage_games": len(durations),
        "average_duration_minutes": round(sum(durations) / len(durations), 1) if durations else None,
        "median_duration_minutes": median_duration,
        "starting_player_coverage_games": sum(game.get("starting_player") is not None for game in games),
        "win_condition_coverage_games": sum(game.get("win_condition_category") is not None for game in games),
        "parse_confidence": dict(Counter(game["parse_confidence"] for game in games)),
        "needs_review_game_ids": [game["game_id"] for game in games if game.get("needs_review")],
        "sparse_metadata_warning": "Los valores vacíos de nukes, Sol Ring turno 1, duración, inicio y condición significan «no registrado», no «no ocurrió».",
    }


def generate_exports(dataset: dict[str, Any], current_catalog: list[dict[str, Any]] | None = None) -> dict[Path, str]:
    games = sorted_games(dataset["games"])
    current_catalog = current_catalog if current_catalog is not None else read_deck_catalog()
    current_by_key = {
        (row["player"], row["deck_name_normalized"]): row
        for row in current_catalog
    }

    game_rows = [{field: game.get(field) for field in GAME_FIELDS} for game in games]
    participant_rows = [
        {field: participant.get(field) for field in PARTICIPANT_FIELDS}
        for game in games
        for participant in sorted(game["participants"], key=lambda row: row["seat_order"])
    ]
    event_rows = [
        {field: event.get(field) for field in EVENT_FIELDS}
        for game in games
        for event in sorted(game.get("events", []), key=lambda row: row["event_order"])
    ]

    deck_stats: dict[tuple[str, str], dict[str, Any]] = {}
    for game in games:
        for participant in game["participants"]:
            player = participant["player"]
            deck_name = participant["deck_name_normalized"]
            if not is_known(deck_name):
                continue
            key = (player, deck_name)
            current = current_by_key.get(key, {})
            participant_deck_id = participant.get("deck_id") or current.get("deck_id") or deck_id(player, deck_name)
            owner_player = participant.get("deck_owner") or current.get("owner_player") or player
            if key not in deck_stats:
                deck_stats[key] = {
                    "deck_id": participant_deck_id,
                    "owner_player": owner_player,
                    "player": player,
                    "deck_name_normalized": deck_name,
                    "display_name": current.get("display_name") or deck_name,
                    "official_name": current.get("official_name", ""),
                    "commander_name": current.get("commander_name") or participant.get("commander_name", ""),
                    "moxfield_url": current.get("moxfield_url") or participant.get("moxfield_url", ""),
                    "archidekt_url": current.get("archidekt_url", ""),
                    "edhrec_url": current.get("edhrec_url", ""),
                    "archetype": current.get("archetype", ""),
                    "power_level": current.get("power_level", ""),
                    "tags": list(current.get("tags_list", [])),
                    "colors": list(current.get("colors_list", [])),
                    "first_played": game["date"],
                    "last_played": game["date"],
                    "games_played": 0,
                    "wins": 0,
                    "notes": current.get("notes", ""),
                    "aliases": list(current.get("aliases_list", [])),
                    "variants": list(current.get("variants_list", [])),
                }
            stat = deck_stats[key]
            stat["deck_id"] = participant_deck_id
            stat["owner_player"] = owner_player
            stat["first_played"] = min(stat["first_played"], game["date"])
            stat["last_played"] = max(stat["last_played"], game["date"])
            stat["games_played"] += 1
            if game["result_type"] == "win" and game.get("winner_player") == player:
                stat["wins"] += 1
            if is_known(participant.get("deck_name_raw")):
                stat["aliases"].append(participant["deck_name_raw"])
            if is_known(participant.get("deck_variant")):
                stat["variants"].append(participant["deck_variant"])

    catalog_rows = []
    for stat in sorted(deck_stats.values(), key=lambda row: (row["deck_id"], normalize_text(row["player"]))):
        games_played = stat["games_played"]
        catalog_rows.append(
            {
                **stat,
                "aliases": json_list(stat["aliases"]),
                "variants": json_list(stat["variants"]),
                "tags": json_list(stat["tags"]),
                "colors": json_color_list(stat["colors"]),
                "win_rate": round(stat["wins"] / games_played, 4) if games_played else 0,
            }
        )

    quality_rows = [
        {
            "game_id": game["game_id"],
            "date": game["date"],
            "parse_confidence": game["parse_confidence"],
            "needs_review": game["needs_review"],
            "notes": game.get("notes", ""),
            "raw_line": game.get("raw_line", ""),
        }
        for game in games
        if game.get("needs_review") or game.get("parse_confidence") != "high" or is_known(game.get("notes"))
    ]

    summary = build_summary({**dataset, "games": games})

    return {
        DATA_DIR / "games.csv": csv_text(GAME_FIELDS, game_rows),
        DATA_DIR / "game_players.csv": csv_text(PARTICIPANT_FIELDS, participant_rows),
        DATA_DIR / "events.csv": csv_text(EVENT_FIELDS, event_rows),
        DATA_DIR / "deck_catalog.csv": csv_text(DECK_CATALOG_FIELDS, catalog_rows),
        DATA_DIR / "quality_issues.csv": csv_text(QUALITY_FIELDS, quality_rows),
        DATA_DIR / "summary.json": json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
    }
