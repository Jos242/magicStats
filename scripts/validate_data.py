#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from mtg_data import (
    DATA_DIR,
    generate_exports,
    is_known,
    load_dataset,
    normalize_text,
    read_deck_catalog,
)

VALID_LOCATIONS = {"virtual", "in_person"}
VALID_RESULTS = {"win", "draw"}
VALID_CONFIDENCE = {"high", "medium", "low"}
VALID_PARTICIPANT_RESULTS = {"winner", "loser", "draw"}
VALID_EVENT_TYPES = {"elimination", "self_elimination", "concession", "nuke", "sol_ring_turn_1"}
GAME_ID_RE = re.compile(r"^G(\d{4})-(\d{3,})$")
CUSTOM_EVENT_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def add(errors: list[str], message: str) -> None:
    errors.append(message)


def validate_core(dataset: dict) -> list[str]:
    errors: list[str] = []
    games = dataset.get("games")
    if not isinstance(games, list):
        return ["games.json: la clave 'games' debe ser una lista"]

    metadata = dataset.get("metadata", {})
    if metadata.get("total_games") != len(games):
        add(errors, f"metadata.total_games no coincide: {metadata.get('total_games')} vs {len(games)}")

    ids: set[str] = set()
    deck_catalog = read_deck_catalog()
    catalog_pairs = {(row["player"], row["deck_name_normalized"]) for row in deck_catalog}
    catalog_deck_ids = {row["deck_id"] for row in deck_catalog if is_known(row.get("deck_id"))}

    for game in games:
        gid = game.get("game_id", "")
        if not GAME_ID_RE.match(gid):
            add(errors, f"{gid or '<sin id>'}: game_id inválido")
        if gid in ids:
            add(errors, f"ID duplicado: {gid}")
        ids.add(gid)

        if game.get("location") not in VALID_LOCATIONS:
            add(errors, f"{gid}: location inválida: {game.get('location')}")
        if game.get("result_type") not in VALID_RESULTS:
            add(errors, f"{gid}: result_type inválido: {game.get('result_type')}")
        if game.get("parse_confidence") not in VALID_CONFIDENCE:
            add(errors, f"{gid}: parse_confidence inválido: {game.get('parse_confidence')}")
        if not isinstance(game.get("needs_review"), bool):
            add(errors, f"{gid}: needs_review debe ser boolean")

        participants = game.get("participants", [])
        if not isinstance(participants, list) or len(participants) < 2:
            add(errors, f"{gid}: debe tener al menos 2 participantes")
            participants = []

        players = [participant.get("player") for participant in participants]
        known_players = [player for player in players if is_known(player)]
        if len(known_players) != game.get("player_count"):
            add(errors, f"{gid}: player_count no coincide")
        if len(known_players) != len(set(known_players)):
            add(errors, f"{gid}: jugador duplicado")

        player_set = set(known_players)
        result_type = game.get("result_type")
        winner = game.get("winner_player")
        if result_type == "win" and winner not in player_set:
            add(errors, f"{gid}: ganador no participa")
        if result_type == "draw" and winner is not None:
            add(errors, f"{gid}: empate con ganador")
        if is_known(game.get("starting_player")) and game["starting_player"] not in player_set:
            add(errors, f"{gid}: jugador inicial no participa")
        turn_order = game.get("turn_order")
        if turn_order is not None:
            if not isinstance(turn_order, list):
                add(errors, f"{gid}: turn_order debe ser lista o null")
            else:
                clean_turn_order = [player for player in turn_order if is_known(player)]
                if clean_turn_order != turn_order:
                    add(errors, f"{gid}: turn_order no debe contener valores vacios")
                if len(clean_turn_order) != len(player_set) or set(clean_turn_order) != player_set:
                    add(errors, f"{gid}: turn_order debe incluir exactamente los participantes")
                if len(clean_turn_order) != len(set(clean_turn_order)):
                    add(errors, f"{gid}: turn_order contiene jugadores duplicados")
        if game.get("duration_minutes") is not None and game["duration_minutes"] < 0:
            add(errors, f"{gid}: duración negativa")

        seat_orders = [participant.get("seat_order") for participant in participants]
        if seat_orders != list(range(1, len(participants) + 1)):
            add(errors, f"{gid}: seat_order debe ser consecutivo desde 1")

        for participant in participants:
            player = participant.get("player", "")
            deck = participant.get("deck_name_normalized", "")
            participant_deck_id = participant.get("deck_id", "")
            if is_known(deck) and (player, deck) not in catalog_pairs:
                add(errors, f"{gid}: falta en deck_catalog.csv la combinación {player} / {deck}")
            if is_known(deck) and not is_known(participant_deck_id):
                add(errors, f"{gid}: participante {player} / {deck} no tiene deck_id")
            if is_known(participant_deck_id) and participant_deck_id not in catalog_deck_ids:
                add(errors, f"{gid}: deck_id no existe en deck_catalog.csv: {participant_deck_id}")
            if participant.get("result") not in VALID_PARTICIPANT_RESULTS:
                add(errors, f"{gid}: resultado de participante inválido para {player}")
            if result_type == "draw" and participant.get("result") != "draw":
                add(errors, f"{gid}: participante {player} debe tener result=draw")
            if result_type == "win":
                expected = "winner" if player == winner else "loser"
                if participant.get("result") != expected:
                    add(errors, f"{gid}: participante {player} debe tener result={expected}")

        event_orders = [event.get("event_order") for event in game.get("events", [])]
        if event_orders != list(range(1, len(event_orders) + 1)):
            add(errors, f"{gid}: event_order debe ser consecutivo desde 1")
        for event in game.get("events", []):
            if event.get("event_type") not in VALID_EVENT_TYPES and not CUSTOM_EVENT_RE.match(str(event.get("event_type", ""))):
                add(errors, f"{gid}: event_type inválido: {event.get('event_type')}")
            if is_known(event.get("actor")) and event["actor"] not in player_set:
                add(errors, f"{gid}: actor de evento no participa ({event['actor']})")
            if is_known(event.get("target")) and event["target"] not in player_set:
                add(errors, f"{gid}: objetivo de evento no participa ({event['target']})")

    sorted_ids = sorted(ids)
    if sorted_ids != [game.get("game_id") for game in games]:
        add(errors, "games.json debe estar ordenado por game_id ascendente")

    duplicate_catalog = set()
    seen_catalog = set()
    for row in deck_catalog:
        key = (normalize_text(row["player"]), normalize_text(row["deck_name_normalized"]))
        if key in seen_catalog:
            duplicate_catalog.add(f"{row['player']} / {row['deck_name_normalized']}")
        seen_catalog.add(key)
    for duplicate in sorted(duplicate_catalog):
        add(errors, f"deck_catalog.csv duplicado: {duplicate}")

    return errors


def validate_generated_files(dataset: dict) -> list[str]:
    errors: list[str] = []
    generated = generate_exports(dataset)
    for path, expected_text in generated.items():
        if not path.exists():
            errors.append(f"Falta archivo generado: {path.relative_to(DATA_DIR.parent)}")
            continue
        actual_text = path.read_text(encoding="utf-8")
        if actual_text != expected_text:
            errors.append(f"{path.relative_to(DATA_DIR.parent)} no coincide con games.json; ejecuta scripts/rebuild_exports.py")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida el dataset MTG Commander.")
    parser.add_argument("--skip-generated", action="store_true", help="No compara CSVs/resumen generados.")
    args = parser.parse_args()

    dataset = load_dataset()
    errors = validate_core(dataset)
    if not args.skip_generated:
        errors.extend(validate_generated_files(dataset))

    if errors:
        print("VALIDACIÓN FALLIDA")
        for error in errors:
            print("-", error)
        return 1

    games = dataset["games"]
    locations = {location: sum(game["location"] == location for game in games) for location in sorted(VALID_LOCATIONS)}
    draws = sum(game["result_type"] == "draw" for game in games)
    duration_coverage = sum(game.get("duration_minutes") is not None for game in games)
    starter_coverage = sum(game.get("starting_player") is not None for game in games)
    review_count = sum(bool(game.get("needs_review")) for game in games)

    print("VALIDACIÓN OK")
    print(f"- games: {len(games)}")
    print(f"- virtual: {locations['virtual']}")
    print(f"- in_person: {locations['in_person']}")
    print(f"- draws: {draws}")
    print(f"- duration_coverage: {duration_coverage}")
    print(f"- starter_coverage: {starter_coverage}")
    print(f"- review_count: {review_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
