# magicStats Project Overview

## What This Project Is

`magicStats` is a static website for exploring Magic: The Gathering Commander matches played in 2026. It is designed for GitHub Pages: no backend, no database, no build step.

The current app provides:

- filters by date, location, player, winner, deck, result, starter, win condition, confidence and review status;
- KPIs and coverage indicators;
- Chart.js visualizations;
- player and deck statistics;
- deck matchup analysis;
- elimination and win-condition analysis;
- match history with expandable details;
- filtered CSV export.

## Data Model

The canonical data file is:

```text
data/games.json
```

It contains:

- top-level `metadata`;
- `games[]`;
- `participants[]` inside each game;
- `events[]` inside each game.

Derived files:

```text
data/games.csv
data/game_players.csv
data/events.csv
data/deck_catalog.csv
data/quality_issues.csv
data/summary.json
```

Regenerate derived files with:

```bash
python scripts/rebuild_exports.py
```

Validate everything with:

```bash
python scripts/validate_data.py
```

## Dynamic Match Entry

The intended workflow for future matches is:

```text
GitHub Issue Form -> GitHub Action -> import script -> generated files -> validation -> pull request -> merge
```

Files involved:

```text
.github/ISSUE_TEMPLATE/record-match.yml
.github/workflows/import-match.yml
.github/workflows/validate-data.yml
scripts/import_issue.py
scripts/rebuild_exports.py
scripts/validate_data.py
scripts/mtg_data.py
```

The import workflow never writes directly to `main`. It creates or updates a branch like:

```text
import-match-123
```

Then it opens a PR for review.

The Issue Form intentionally supports `Otro jugador`, custom win conditions, custom elimination methods and additional special events. Repeated special events such as multiple nukes or multiple Sol Ring turn 1 plays are stored as separate rows in `events[]`. Those imports should be marked `needs_review: true` so a human or Codex can normalize aliases, event names or deck names before merge.

## Important Semantics

Unknown means unknown. It does not mean false or zero.

Examples:

- `duration_minutes: null` means duration was not recorded.
- `nuke_recorded: null` means no nuke information was recorded.
- `sol_ring_t1_recorded: null` means no Sol Ring T1 information was recorded.
- `nuke_player` and `sol_ring_t1_player` are compatibility summary fields. If multiple players are recorded, use the corresponding `events[]` rows for complete counts.

Do not calculate percentages over all games for sparse metadata unless the coverage is explicitly shown.

## Recommended Next Work

1. Push the repository to GitHub.
2. Configure GitHub Pages from `main` and `/root`.
3. Configure `MATCH_IMPORT_ALLOWED_USERS` if friends should submit matches.
4. Submit a fake test issue and verify that the Action opens a PR.
5. Review the generated PR, merge it if valid, then delete the fake match through a cleanup PR or test on a temporary branch/repo first.
6. Add aliases to `data/player_aliases.csv` and `data/deck_catalog.csv` as new spelling variants appear.

## Local Commands

Serve the site:

```bash
python -m http.server 8000
```

Check generated files:

```bash
python scripts/rebuild_exports.py --check
```

Run full validation:

```bash
python scripts/validate_data.py
```

Dry-run an issue import:

```bash
python scripts/import_issue.py --issue-body path/to/issue-body.md --dry-run
```
