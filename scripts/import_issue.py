#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from mtg_data import (
    EVENT_METHOD_ALIASES,
    GAMES_JSON,
    DeckResolution,
    generate_exports,
    is_known,
    load_dataset,
    next_game_id,
    normalize_event_method,
    normalize_location,
    normalize_moxfield_url,
    normalize_player,
    normalize_text,
    normalize_win_condition,
    parse_bool_checkbox,
    parse_int_or_none,
    read_csv_rows,
    read_deck_catalog,
    read_player_aliases,
    resolve_deck,
    save_dataset,
    slugify,
    validate_iso_date,
    is_other_player_value,
)

NO_RESPONSE_VALUES = {
    "",
    "_no response_",
    "no response",
    "no player",
    "no registrado",
    "none",
    "n/a",
    "no winner / draw",
}

PLAYER_FIELD_LABELS = {
    1: ("Jugador 1", "Jugador 1 otro", "Deck 1", "Deck 1 Moxfield URL opcional"),
    2: ("Jugador 2", "Jugador 2 otro", "Deck 2", "Deck 2 Moxfield URL opcional"),
    3: ("Jugador 3 opcional", "Jugador 3 otro", "Deck 3 opcional", "Deck 3 Moxfield URL opcional"),
    4: ("Jugador 4 opcional", "Jugador 4 otro", "Deck 4 opcional", "Deck 4 Moxfield URL opcional"),
    5: ("Jugador 5 opcional", "Jugador 5 otro", "Deck 5 opcional", "Deck 5 Moxfield URL opcional"),
}

IMPORT_CONTEXT = {
    "new_player_aliases": {},
    "warnings": [],
}


def clean_response(value: str | None) -> str:
    if value is None:
        return ""
    text = value.strip()
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL).strip()
    return "" if normalize_text(text) in NO_RESPONSE_VALUES else text


def parse_issue_form(body: str) -> dict[str, str]:
    fields: dict[str, list[str]] = {}
    current_label: str | None = None

    for line in body.splitlines():
        line = line.lstrip("\ufeff")
        heading = re.match(r"^###\s+(.+?)\s*$", line)
        if heading:
            current_label = heading.group(1).strip()
            fields[current_label] = []
            continue
        if current_label:
            fields[current_label].append(line)

    return {label: clean_response("\n".join(lines)) for label, lines in fields.items()}


def require_field(fields: dict[str, str], label: str) -> str:
    value = clean_response(fields.get(label))
    if not value:
        raise ValueError(f"Campo requerido vacío: {label}")
    return value


def optional_field(fields: dict[str, str], label: str) -> str:
    return clean_response(fields.get(label))


def canonicalize_new_player(raw_player: str) -> str:
    text = clean_response(raw_player)
    if not text:
        raise ValueError("Seleccionaste Otro jugador pero no llenaste el campo de texto correspondiente")
    if any(char in text for char in "|/\\"):
        raise ValueError(f"Nombre de jugador inválido: {text}")
    return " ".join(part[:1].upper() + part[1:] for part in text.split())


def normalize_optional_player(raw_player: str, aliases: dict[str, str], other_player: str = "") -> str:
    value = clean_response(raw_player)
    if not value:
        return ""
    if is_other_player_value(value):
        canonical = canonicalize_new_player(other_player)
        for existing in IMPORT_CONTEXT["new_player_aliases"].values():
            if normalize_text(existing) == normalize_text(canonical):
                return existing
        IMPORT_CONTEXT["new_player_aliases"][canonical] = canonical
        IMPORT_CONTEXT["warnings"].append(f"Jugador nuevo para revisar: {canonical}")
        return canonical
    return normalize_player(value, aliases)


def parse_participants(fields: dict[str, str], aliases: dict[str, str], catalog: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    participants: list[dict[str, Any]] = []
    warnings: list[str] = []

    for seat_order, (player_label, other_player_label, deck_label, moxfield_label) in PLAYER_FIELD_LABELS.items():
        raw_player = require_field(fields, player_label) if seat_order <= 2 else optional_field(fields, player_label)
        player = normalize_optional_player(raw_player, aliases, optional_field(fields, other_player_label))
        raw_deck = require_field(fields, deck_label) if seat_order <= 2 else optional_field(fields, deck_label)
        moxfield_url = normalize_moxfield_url(optional_field(fields, moxfield_label))
        if optional_field(fields, moxfield_label) and not moxfield_url:
            raise ValueError(f"{moxfield_label} no parece ser un link válido de Moxfield")

        if not player and not raw_deck:
            continue
        if not player:
            raise ValueError(f"{deck_label} tiene deck pero falta jugador")
        if not raw_deck:
            raise ValueError(f"{player_label} tiene jugador pero falta deck")

        deck = resolve_deck(player, raw_deck, catalog)
        if deck.needs_review:
            warnings.append(f"{player} / {deck.normalized}: {deck.notes}")

        participants.append(
            {
                "game_id": "",
                "seat_order": len(participants) + 1,
                "player": player,
                "deck_name_raw": deck.raw,
                "deck_name_normalized": deck.normalized,
                "deck_id": deck.deck_id,
                "deck_owner": deck.owner_player,
                "moxfield_url": moxfield_url or deck.moxfield_url,
                "deck_variant": deck.variant,
                "commander_name": deck.commander_name,
                "result": "loser",
                "assignment_confidence": deck.assignment_confidence,
                "notes": deck.notes,
            }
        )

    if len(participants) < 2:
        raise ValueError("La partida debe tener al menos 2 participantes")

    players = [participant["player"] for participant in participants]
    if len(players) != len(set(players)):
        raise ValueError("Hay jugadores duplicados en la partida")

    return participants, warnings


def normalize_result(fields: dict[str, str], participants: list[dict[str, Any]], aliases: dict[str, str]) -> tuple[str, str | None, str]:
    raw_result = require_field(fields, "Resultado")
    if normalize_text(raw_result) in {"empate", "draw"}:
        for participant in participants:
            participant["result"] = "draw"
        return "draw", None, "draw"

    winner = normalize_optional_player(require_field(fields, "Ganador si aplica"), aliases, optional_field(fields, "Ganador otro"))
    player_set = {participant["player"] for participant in participants}
    if winner not in player_set:
        raise ValueError(f"El ganador no participa: {winner}")

    for participant in participants:
        participant["result"] = "winner" if participant["player"] == winner else "loser"
    return "win", winner, winner


def parse_turn_order(fields: dict[str, str], aliases: dict[str, str], participants: list[dict[str, Any]]) -> list[str] | None:
    raw_order = optional_field(fields, "Orden de turno opcional")
    if not raw_order:
        return None

    parts: list[str] = []
    for line in raw_order.splitlines():
        clean_line = clean_response(line)
        if not clean_line:
            continue
        parts.extend(part.strip() for part in re.split(r"\s*(?:\||>|,)\s*", clean_line) if part.strip())

    order = [normalize_event_player(part, aliases) for part in parts]
    if not order:
        return None

    player_set = {participant["player"] for participant in participants}
    if len(order) != len(player_set) or set(order) != player_set:
        expected = " | ".join(participant["player"] for participant in participants)
        received = " | ".join(order)
        raise ValueError(f"Orden de turno debe incluir exactamente los participantes. Esperado: {expected}. Recibido: {received}")
    if len(order) != len(set(order)):
        raise ValueError("Orden de turno contiene jugadores duplicados")

    return order


def parse_player_line(line: str, aliases: dict[str, str]) -> tuple[str, str]:
    parts = [part.strip() for part in line.split("|", 1)]
    player = normalize_event_player(parts[0], aliases)
    notes = parts[1] if len(parts) > 1 else ""
    return player, notes


def parse_elimination_line(line: str, aliases: dict[str, str]) -> dict[str, str]:
    if "|" in line:
        parts = [part.strip() for part in line.split("|")]
    else:
        normalized = re.sub(r"\s+(eliminated|elimino|eliminó|mata|mato|mató|->|>)\s+", "|", line, flags=re.IGNORECASE)
        parts = [part.strip() for part in normalized.split("|")]

    if len(parts) < 2:
        raise ValueError(f"Eliminación inválida: {line}")

    actor = normalize_event_player(parts[0], aliases)
    target = normalize_event_player(parts[1], aliases)
    method = normalize_event_method(parts[2]) if len(parts) >= 3 else "unspecified"
    if method not in EVENT_METHOD_ALIASES.values():
        IMPORT_CONTEXT["warnings"].append(f"Método de eliminación nuevo para revisar: {method}")
    notes = parts[3] if len(parts) >= 4 else ""
    return {"actor": actor, "target": target, "method": method, "notes": notes}


def normalize_player_with_context(raw_player: str, aliases: dict[str, str]) -> str:
    key = normalize_text(raw_player)
    for canonical in IMPORT_CONTEXT["new_player_aliases"].values():
        if normalize_text(canonical) == key:
            return canonical
    return normalize_player(raw_player, aliases)


def normalize_event_player(raw_player: str, aliases: dict[str, str]) -> str:
    value = clean_response(raw_player)
    if not value:
        return ""

    if ":" in value:
        prefix, new_player = [part.strip() for part in value.split(":", 1)]
        if normalize_text(prefix) in {"otro", "nuevo", "new"} or is_other_player_value(prefix):
            return normalize_optional_player("Otro jugador", aliases, new_player)

    return normalize_player_with_context(value, aliases)


def parse_repeated_player_events(raw_lines: str, aliases: dict[str, str]) -> list[tuple[str, str]]:
    events: list[tuple[str, str]] = []
    for line in raw_lines.splitlines():
        line = clean_response(line)
        if not line:
            continue
        player, notes = parse_player_line(line, aliases)
        if not player:
            raise ValueError(f"Evento especial sin jugador: {line}")
        events.append((player, notes))
    return events


def parse_events(fields: dict[str, str], aliases: dict[str, str], participants: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], str | None, str | None]:
    events: list[dict[str, Any]] = []
    player_set = {participant["player"] for participant in participants}

    def add_event(event_type: str, actor: str, target: str, method: str, notes: str, explicitness: str = "explicit") -> None:
        if actor and actor not in player_set:
            raise ValueError(f"Actor de evento no participa: {actor}")
        if target and target not in player_set:
            raise ValueError(f"Objetivo de evento no participa: {target}")
        events.append(
            {
                "game_id": "",
                "event_order": len(events) + 1,
                "event_type": event_type,
                "actor": actor,
                "target": target,
                "method": method,
                "notes": notes,
                "explicitness": explicitness,
            }
        )

    for line in optional_field(fields, "Eliminaciones").splitlines():
        line = clean_response(line)
        if not line:
            continue
        event = parse_elimination_line(line, aliases)
        add_event("elimination", event["actor"], event["target"], event["method"], event["notes"])

    for line in optional_field(fields, "Rendiciones").splitlines():
        line = clean_response(line)
        if not line:
            continue
        player, notes = parse_player_line(line, aliases)
        add_event("concession", player, player, "concession", notes or f"{player} se rindió.")

    for line in optional_field(fields, "Autoeliminaciones").splitlines():
        line = clean_response(line)
        if not line:
            continue
        player, notes = parse_player_line(line, aliases)
        add_event("self_elimination", player, player, "self_elimination", notes)

    nuke_players: list[str] = []
    for player, notes in parse_repeated_player_events(optional_field(fields, "Nukes registrados por"), aliases):
        add_event("nuke", player, "", "nuke", notes or f"Nuke registrado por {player}.")
        nuke_players.append(player)

    legacy_nuke_player = normalize_optional_player(
        optional_field(fields, "Nuke registrado por"),
        aliases,
        optional_field(fields, "Nuke otro jugador"),
    )
    if legacy_nuke_player and legacy_nuke_player not in nuke_players:
        add_event("nuke", legacy_nuke_player, "", "nuke", f"Nuke registrado por {legacy_nuke_player}.")
        nuke_players.append(legacy_nuke_player)

    sol_ring_players: list[str] = []
    for player, notes in parse_repeated_player_events(optional_field(fields, "Sol Ring turno 1 registrados por"), aliases):
        add_event("sol_ring_turn_1", player, "", "sol_ring_turn_1", notes or "Sol Ring turno 1.")
        sol_ring_players.append(player)

    legacy_sol_ring_player = normalize_optional_player(
        optional_field(fields, "Sol Ring turno 1 por"),
        aliases,
        optional_field(fields, "Sol Ring turno 1 otro jugador"),
    )
    if legacy_sol_ring_player and legacy_sol_ring_player not in sol_ring_players:
        add_event("sol_ring_turn_1", legacy_sol_ring_player, "", "sol_ring_turn_1", "Sol Ring turno 1.")
        sol_ring_players.append(legacy_sol_ring_player)

    for line in optional_field(fields, "Eventos especiales adicionales").splitlines():
        line = clean_response(line)
        if not line:
            continue
        parts = [part.strip() for part in line.split("|")]
        event_type = slugify(parts[0]) if parts else ""
        if not event_type:
            raise ValueError(f"Evento especial inválido: {line}")
        actor = normalize_event_player(parts[1], aliases) if len(parts) >= 2 and clean_response(parts[1]) else ""
        notes = parts[2] if len(parts) >= 3 else ""
        IMPORT_CONTEXT["warnings"].append(f"Evento especial nuevo para revisar: {event_type}")
        add_event(event_type, actor, "", event_type, notes)

    return events, (nuke_players[0] if nuke_players else None), (sol_ring_players[0] if sol_ring_players else None)


def generated_raw_line(fields: dict[str, str], participants: list[dict[str, Any]], winner: str | None, result_type: str) -> str:
    raw_note = optional_field(fields, "Nota original opcional")
    if raw_note:
        return raw_note
    participant_text = " ".join(
        f"{participant['deck_name_raw']} {participant['player']}" for participant in participants
    )
    result_text = "empate" if result_type == "draw" else f"gana {winner}"
    return f"{participant_text} / {result_text}"


def normalize_win_condition_from_fields(fields: dict[str, str]) -> str | None:
    raw_condition = optional_field(fields, "Condición de victoria")
    if normalize_text(raw_condition) in {"otra condicion", "otra condición", "other", "other condition"}:
        custom = require_field(fields, "Otra condición de victoria")
        normalized = slugify(custom).replace("-", "_")
        IMPORT_CONTEXT["warnings"].append(f"Condición de victoria nueva para revisar: {normalized}")
        return normalized
    return normalize_win_condition(raw_condition)


def build_game(fields: dict[str, str], issue_number: str, issue_url: str) -> dict[str, Any]:
    IMPORT_CONTEXT["new_player_aliases"] = {}
    IMPORT_CONTEXT["warnings"] = []
    dataset = load_dataset()
    aliases = read_player_aliases()
    catalog = read_deck_catalog()
    game_date = validate_iso_date(require_field(fields, "Fecha"))
    location = normalize_location(require_field(fields, "Ubicación"))
    participants, warnings = parse_participants(fields, aliases, catalog)
    result_type, winner, winner_raw = normalize_result(fields, participants, aliases)
    events, nuke_player, sol_ring_player = parse_events(fields, aliases, participants)
    game_id = next_game_id(dataset["games"], game_date)

    starting_player = normalize_optional_player(
        optional_field(fields, "Jugador inicial"),
        aliases,
        optional_field(fields, "Jugador inicial otro"),
    ) or None
    if starting_player and starting_player not in {participant["player"] for participant in participants}:
        raise ValueError(f"El jugador inicial no participa: {starting_player}")

    turn_order = parse_turn_order(fields, aliases, participants)
    if turn_order and starting_player and turn_order[0] != starting_player:
        raise ValueError(f"Orden de turno inicia con {turn_order[0]}, pero Jugador inicial es {starting_player}")

    duration_minutes = parse_int_or_none(optional_field(fields, "Duración minutos"))
    win_condition_category = normalize_win_condition_from_fields(fields)
    win_condition_text = optional_field(fields, "Detalle de victoria")
    user_notes = optional_field(fields, "Notas")
    force_review = parse_bool_checkbox(optional_field(fields, "Revisión manual"))
    warnings.extend(IMPORT_CONTEXT["warnings"])
    needs_review = force_review or bool(warnings)

    notes_parts = []
    if issue_number:
        notes_parts.append(f"Importado desde GitHub issue #{issue_number}.")
    if issue_url:
        notes_parts.append(issue_url)
    if user_notes:
        notes_parts.append(user_notes)
    notes_parts.extend(warnings)

    for participant in participants:
        participant["game_id"] = game_id
    for event in events:
        event["game_id"] = game_id

    parse_confidence = "medium" if needs_review else "high"

    return {
        "game_id": game_id,
        "date": game_date,
        "location": location,
        "player_count": len(participants),
        "result_type": result_type,
        "winner_player": winner,
        "winner_raw": winner_raw,
        "starting_player": starting_player,
        "turn_order": turn_order,
        "start_time": None,
        "end_time": None,
        "duration_minutes": duration_minutes,
        "win_condition_category": win_condition_category,
        "win_condition_text": win_condition_text or None,
        "nuke_recorded": True if nuke_player else None,
        "nuke_player": nuke_player,
        "sol_ring_t1_recorded": True if sol_ring_player else None,
        "sol_ring_t1_player": sol_ring_player,
        "parse_confidence": parse_confidence,
        "needs_review": needs_review,
        "notes": " ".join(notes_parts),
        "source_line": 0,
        "raw_line": generated_raw_line(fields, participants, winner, result_type),
        "participants": participants,
        "events": events,
    }


def append_game(game: dict[str, Any], rebuild: bool) -> None:
    dataset = load_dataset()
    if any(existing["game_id"] == game["game_id"] for existing in dataset["games"]):
        raise ValueError(f"game_id duplicado: {game['game_id']}")
    dataset["games"].append(game)
    dataset["games"].sort(key=lambda row: row["game_id"])
    dataset.setdefault("metadata", {})["total_games"] = len(dataset["games"])
    dataset["metadata"]["generated_on"] = str(__import__("datetime").date.today())
    save_dataset(dataset)
    append_new_player_aliases()

    if rebuild:
        generated = generate_exports(dataset, current_catalog=read_deck_catalog())
        for path, text in generated.items():
            path.write_text(text, encoding="utf-8")


def append_new_player_aliases() -> None:
    new_aliases = IMPORT_CONTEXT.get("new_player_aliases", {})
    if not new_aliases:
        return

    path = GAMES_JSON.parent / "player_aliases.csv"
    existing_rows = read_csv_rows(path)
    existing = {
        (normalize_text(row.get("canonical_player", "")), normalize_text(row.get("raw_alias", "")))
        for row in existing_rows
    }
    rows_to_add = []
    for canonical, raw_alias in sorted(new_aliases.items(), key=lambda item: normalize_text(item[0])):
        key = (normalize_text(canonical), normalize_text(raw_alias))
        if key not in existing:
            rows_to_add.append({"canonical_player": canonical, "raw_alias": raw_alias})

    if not rows_to_add:
        return

    import csv

    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["canonical_player", "raw_alias"], lineterminator="\n")
        for row in rows_to_add:
            writer.writerow(row)


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa una partida desde un GitHub Issue Form.")
    parser.add_argument("--issue-body", required=True, type=Path, help="Archivo con el body markdown del issue.")
    parser.add_argument("--issue-number", default="", help="Número del issue GitHub.")
    parser.add_argument("--issue-url", default="", help="URL del issue GitHub.")
    parser.add_argument("--dry-run", action="store_true", help="No escribe archivos; imprime la partida generada.")
    parser.add_argument("--rebuild", action="store_true", help="Regenera archivos derivados después de importar.")
    args = parser.parse_args()

    fields = parse_issue_form(args.issue_body.read_text(encoding="utf-8"))
    game = build_game(fields, args.issue_number, args.issue_url)

    if args.dry_run:
        print(json.dumps(game, ensure_ascii=False, indent=2))
        return 0

    append_game(game, rebuild=args.rebuild)
    print(f"Importada {game['game_id']}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
