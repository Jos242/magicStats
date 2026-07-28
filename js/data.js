import {
  deckLabelForCatalog,
  isKnown,
  makeDeckKey,
  parseCsv,
  parseJsonArray,
  repairKnownText,
} from "./utils.js";

const DATA_PATHS = {
  games: "./data/games.json",
  deckCatalog: "./data/deck_catalog.csv",
  summary: "./data/summary.json",
  qualityIssues: "./data/quality_issues.csv",
};

const dataCacheVersion = Date.now();

function dataUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${dataCacheVersion}`;
}

async function fetchJson(path) {
  const response = await fetch(dataUrl(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return repairKnownTextValues(await response.json());
}

async function fetchText(path) {
  const response = await fetch(dataUrl(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return repairKnownText(await response.text());
}

function repairKnownTextValues(value) {
  if (typeof value === "string") return repairKnownText(value);
  if (Array.isArray(value)) return value.map(repairKnownTextValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairKnownTextValues(item)]));
  }
  return value;
}

function normalizeCatalogRow(row) {
  return {
    ...row,
    owner_player: row.owner_player || row.player || "",
    official_name: row.official_name || "",
    moxfield_url: row.moxfield_url || "",
    archidekt_url: row.archidekt_url || "",
    edhrec_url: row.edhrec_url || "",
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

function mergeParticipantCatalog(participant, catalogMap, identityMap) {
  const catalogEntry = catalogMap.get(makeDeckKey(participant.player, participant.deck_name_normalized));
  const deckId = participant.deck_id || catalogEntry?.deck_id || makeDeckKey(participant.player, participant.deck_name_normalized);
  const identityEntry = identityMap.get(deckId);
  const mergedCatalog = catalogEntry
    ? {
        ...identityEntry,
        ...catalogEntry,
        official_name: catalogEntry.official_name || identityEntry?.official_name || "",
        commander_name: catalogEntry.commander_name || identityEntry?.commander_name || "",
        moxfield_url: catalogEntry.moxfield_url || identityEntry?.moxfield_url || "",
        archidekt_url: catalogEntry.archidekt_url || identityEntry?.archidekt_url || "",
        edhrec_url: catalogEntry.edhrec_url || identityEntry?.edhrec_url || "",
      }
    : identityEntry ?? null;
  const commanderName = isKnown(mergedCatalog?.commander_name)
    ? mergedCatalog.commander_name
    : participant.commander_name;
  const deckOwner = participant.deck_owner || mergedCatalog?.owner_player || participant.player;

  return {
    ...participant,
    deck_id: deckId,
    deck_owner: deckOwner,
    deck_catalog: mergedCatalog,
    commander_name: commanderName ?? "",
  };
}

function preferredIdentityRow(current, candidate) {
  if (!current) return candidate;
  const currentIsOwner = current.player === current.owner_player;
  const candidateIsOwner = candidate.player === candidate.owner_player;
  if (!currentIsOwner && candidateIsOwner) return candidate;
  return current;
}

function buildDeckIdentityRows(catalogRows) {
  const identities = new Map();

  for (const row of catalogRows) {
    const deckId = row.deck_id || makeDeckKey(row.player, row.deck_name_normalized);
    const existing = identities.get(deckId);
    const preferred = preferredIdentityRow(existing, row);

    if (!existing) {
      identities.set(deckId, {
        ...row,
        deck_id: deckId,
        games_played: row.games_played,
        wins: row.wins,
        pilots: new Set([row.player].filter(isKnown)),
      });
      continue;
    }

    existing.games_played += row.games_played;
    existing.wins += row.wins;
    existing.pilots.add(row.player);
    Object.assign(existing, {
      ...preferred,
      games_played: existing.games_played,
      wins: existing.wins,
      pilots: existing.pilots,
    });
  }

  return [...identities.values()]
    .map((row) => ({
      ...row,
      pilots_list: [...row.pilots].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })),
      label: deckLabelForCatalog(row),
      win_rate: row.games_played > 0 ? row.wins / row.games_played : 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
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
  const deckIdentityRows = buildDeckIdentityRows(catalogRows);

  const catalogMap = new Map(
    catalogRows.map((row) => [makeDeckKey(row.player, row.deck_name_normalized), row]),
  );
  const identityMap = new Map(deckIdentityRows.map((row) => [row.deck_id, row]));
  const qualityMap = new Map(qualityIssues.map((row) => [row.game_id, row]));

  const games = (gamesDataset.games ?? []).map((game) => ({
    ...game,
    participants: (game.participants ?? []).map((participant) => mergeParticipantCatalog(participant, catalogMap, identityMap)),
    events: game.events ?? [],
    quality_issue: qualityMap.get(game.game_id) ?? null,
  }));

  return {
    metadata: gamesDataset.metadata ?? {},
    games,
    catalogRows,
    deckIdentityRows,
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
