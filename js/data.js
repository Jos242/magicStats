import { isKnown, makeDeckKey, parseCsv, parseJsonArray } from "./utils.js";

const DATA_PATHS = {
  games: "./data/games.json",
  deckCatalog: "./data/deck_catalog.csv",
  summary: "./data/summary.json",
  qualityIssues: "./data/quality_issues.csv",
};

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return response.text();
}

function normalizeCatalogRow(row) {
  return {
    ...row,
    games_played: Number(row.games_played) || 0,
    wins: Number(row.wins) || 0,
    win_rate: Number(row.win_rate) || 0,
    aliases_list: parseJsonArray(row.aliases),
    variants_list: parseJsonArray(row.variants),
  };
}

function normalizeQualityIssue(row) {
  return {
    ...row,
    needs_review: String(row.needs_review).toLowerCase() === "true",
  };
}

function mergeParticipantCatalog(participant, catalogMap) {
  const catalogEntry = catalogMap.get(makeDeckKey(participant.player, participant.deck_name_normalized));
  const commanderName = isKnown(catalogEntry?.commander_name)
    ? catalogEntry.commander_name
    : participant.commander_name;

  return {
    ...participant,
    deck_catalog: catalogEntry ?? null,
    commander_name: commanderName ?? "",
  };
}

export async function loadDataset() {
  const [gamesDataset, deckCatalogText, summary, qualityIssuesText] = await Promise.all([
    fetchJson(DATA_PATHS.games),
    fetchText(DATA_PATHS.deckCatalog),
    fetchJson(DATA_PATHS.summary),
    fetchText(DATA_PATHS.qualityIssues),
  ]);

  const catalogRows = parseCsv(deckCatalogText).map(normalizeCatalogRow);
  const qualityIssues = parseCsv(qualityIssuesText).map(normalizeQualityIssue);

  const catalogMap = new Map(
    catalogRows.map((row) => [makeDeckKey(row.player, row.deck_name_normalized), row]),
  );
  const qualityMap = new Map(qualityIssues.map((row) => [row.game_id, row]));

  const games = (gamesDataset.games ?? []).map((game) => ({
    ...game,
    participants: (game.participants ?? []).map((participant) => mergeParticipantCatalog(participant, catalogMap)),
    events: game.events ?? [],
    quality_issue: qualityMap.get(game.game_id) ?? null,
  }));

  return {
    metadata: gamesDataset.metadata ?? {},
    games,
    catalogRows,
    catalogMap,
    summary,
    qualityIssues,
  };
}

export function collectDataWarnings(games) {
  const warnings = [];

  for (const game of games) {
    const players = new Set(game.participants.map((participant) => participant.player));

    if (game.result_type === "win" && isKnown(game.winner_player) && !players.has(game.winner_player)) {
      warnings.push(`${game.game_id}: el ganador no participa`);
    }

    if (game.result_type === "draw" && isKnown(game.winner_player)) {
      warnings.push(`${game.game_id}: empate con ganador registrado`);
    }

    if (isKnown(game.starting_player) && !players.has(game.starting_player)) {
      warnings.push(`${game.game_id}: jugador inicial no participa`);
    }

    for (const event of game.events) {
      if (isKnown(event.actor) && !players.has(event.actor)) {
        warnings.push(`${game.game_id}: actor de evento no participa (${event.actor})`);
      }

      if (isKnown(event.target) && !players.has(event.target)) {
        warnings.push(`${game.game_id}: objetivo de evento no participa (${event.target})`);
      }
    }
  }

  return warnings;
}
