# Codex Instructions For magicStats

## Project

This repository is a static GitHub Pages site for MTG Commander 2026 statistics. It has no backend. The web app reads local files from `data/` using relative paths.

## Source Of Truth

- `data/games.json` is the primary source of truth.
- `source/magicpartidas.txt` is the original historical source and must not be edited.
- CSV files, `data/summary.json`, `data/deck_catalog.csv`, and `data/quality_issues.csv` are derived from `data/games.json` by `python scripts/rebuild_exports.py`.
- `commander_name` in `data/deck_catalog.csv` may be manually completed and must be preserved by rebuilds.

## Data Rules

- Unknown optional information remains `null` in JSON or empty in CSV. Never convert unknown to `false` or `0`.
- A winner must appear in the participant list.
- A draw must not have a winner.
- Elimination actors and targets must appear in the participant list.
- Deck statistics are for `player + deck_name_normalized`; do not merge decks across players only because they share a name.
- Empty deck names are allowed only for historical ambiguous records, but they must not be included in deck rankings or catalog rows.
- New issue-imported decks may be added with `needs_review: true` and medium assignment confidence.
- New issue-imported players, custom win conditions, custom elimination methods or custom special events may be accepted only when they come from explicit "Other" fields; they must be marked for review.
- Multiple nukes or Sol Ring turn 1 records in one game must be represented as repeated `events[]` rows. The top-level `nuke_player` and `sol_ring_t1_player` fields are compatibility summaries and may contain only the first recorded player.
- Canonical player names come from `data/player_aliases.csv`.
- Known deck aliases come from `data/deck_catalog.csv`.

## Required Commands

Before completing data or automation work, run:

```bash
python scripts/rebuild_exports.py --check
python scripts/validate_data.py
```

For script changes, also run:

```bash
python -m py_compile scripts/mtg_data.py scripts/import_issue.py scripts/rebuild_exports.py scripts/validate_data.py
```

For web changes, serve locally:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Dynamic Match Import

New matches are intended to flow through:

```text
GitHub Issue Form -> GitHub Action -> scripts/import_issue.py -> scripts/rebuild_exports.py -> scripts/validate_data.py -> pull request -> merge
```

The import workflow must open or update a PR. It must not commit directly to `main`.

## GitHub Pages

All site paths must remain relative, for example:

```js
fetch("./data/games.json")
import "./js/data.js"
```

Do not introduce a build step unless the project explicitly changes direction.
