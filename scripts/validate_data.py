#!/usr/bin/env python3
from pathlib import Path
import json
from collections import Counter

root = Path(__file__).resolve().parents[1]
dataset = json.loads((root / "data" / "games.json").read_text(encoding="utf-8"))
games = dataset["games"]

errors = []
ids = set()

for game in games:
    gid = game["game_id"]
    if gid in ids:
        errors.append(f"ID duplicado: {gid}")
    ids.add(gid)

    players = [p["player"] for p in game["participants"]]
    if len(players) != game["player_count"]:
        errors.append(f"{gid}: player_count no coincide")
    if len(players) != len(set(players)):
        errors.append(f"{gid}: jugador duplicado")
    if game["result_type"] == "win" and game["winner_player"] not in players:
        errors.append(f"{gid}: ganador no participa")
    if game["result_type"] == "draw" and game["winner_player"] is not None:
        errors.append(f"{gid}: empate con ganador")
    if game["starting_player"] is not None and game["starting_player"] not in players:
        errors.append(f"{gid}: jugador inicial no participa")
    if game["duration_minutes"] is not None and game["duration_minutes"] < 0:
        errors.append(f"{gid}: duración negativa")

    for event in game["events"]:
        if event["actor"] and event["actor"] not in players:
            errors.append(f"{gid}: actor de evento no participa")
        if event["target"] and event["target"] not in players:
            errors.append(f"{gid}: objetivo de evento no participa")

locations = Counter(g["location"] for g in games)
draws = sum(g["result_type"] == "draw" for g in games)
duration_coverage = sum(g["duration_minutes"] is not None for g in games)
starter_coverage = sum(g["starting_player"] is not None for g in games)
review_count = sum(g["needs_review"] for g in games)

expected = {
    "games": 74,
    "virtual": 44,
    "in_person": 30,
    "draws": 1,
    "duration_coverage": 27,
    "starter_coverage": 29,
    "review_count": 4,
}
actual = {
    "games": len(games),
    "virtual": locations["virtual"],
    "in_person": locations["in_person"],
    "draws": draws,
    "duration_coverage": duration_coverage,
    "starter_coverage": starter_coverage,
    "review_count": review_count,
}

for key, value in expected.items():
    if actual[key] != value:
        errors.append(f"{key}: esperado {value}, obtenido {actual[key]}")

if errors:
    print("VALIDACIÓN FALLIDA")
    for error in errors:
        print("-", error)
    raise SystemExit(1)

print("VALIDACIÓN OK")
for key, value in actual.items():
    print(f"- {key}: {value}")
