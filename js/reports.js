import {
  deckIdForParticipant,
  deckLabelForCatalog,
  deckLabelForParticipant,
  formatLocation,
  formatPercent,
  formatWinCondition,
  groupBy,
  isKnown,
  mean,
  median,
  monthLabel,
  safeRatio,
  uniqueSorted,
} from "./utils.js";

const VIRTUAL_CLOCKWISE_ORDER = ["Jairo", "Andres", "Cris", "Chepe"];
const ELO_START = 1000;
const ELO_K = 24;

function compareDateAsc(a, b) {
  const dateCompare = String(a.date).localeCompare(String(b.date));
  if (dateCompare !== 0) return dateCompare;
  return String(a.game_id).localeCompare(String(b.game_id));
}

function compareDateDesc(a, b) {
  return -compareDateAsc(a, b);
}

function monthKey(game) {
  return isKnown(game.date) ? String(game.date).slice(0, 7) : "";
}

export function listReportMonths(games) {
  return uniqueSorted(games.map(monthKey)).sort((a, b) => b.localeCompare(a));
}

function rankRows(rows, scoreKeys) {
  return rows
    .sort((a, b) => {
      for (const key of scoreKeys) {
        const difference = (b[key] ?? 0) - (a[key] ?? 0);
        if (difference !== 0) return difference;
      }
      return String(a.label ?? a.player ?? a.deckLabel ?? "").localeCompare(
        String(b.label ?? b.player ?? b.deckLabel ?? ""),
        "es",
        { sensitivity: "base" },
      );
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function withPreviousRank(rows, previousRows, keyName) {
  const previousRankByKey = new Map(previousRows.map((row) => [row[keyName], row.rank]));
  return rows.map((row) => {
    const previousRank = previousRankByKey.get(row[keyName]) ?? null;
    return {
      ...row,
      previousRank,
      rankChange: previousRank === null ? null : previousRank - row.rank,
    };
  });
}

function participantForPlayer(game, player) {
  return game.participants.find((participant) => participant.player === player) ?? null;
}

function participantForDeck(game, deckKey) {
  return game.participants.find((participant) => isKnown(participant.deck_name_normalized) && deckIdForParticipant(participant) === deckKey) ?? null;
}

function deckLabel(participant, catalogRows = []) {
  const deckKey = deckIdForParticipant(participant);
  const catalog = catalogRows.find((row) => row.deck_id === deckKey);
  return catalog ? deckLabelForCatalog(catalog) : deckLabelForParticipant(participant);
}

function countMapToRows(map, keyName, labelName = keyName) {
  return [...map.entries()]
    .map(([key, record]) => ({
      [keyName]: key,
      [labelName]: record.label ?? key,
      count: record.count,
      wins: record.wins ?? 0,
      sample: record.sample ?? record.count,
      winRate: safeRatio(record.wins ?? 0, record.count),
      ...record,
    }))
    .sort((a, b) => b.count - a.count || String(a[labelName]).localeCompare(String(b[labelName]), "es", { sensitivity: "base" }));
}

function buildPlayerRanking(games) {
  const players = new Map();

  for (const game of games) {
    for (const participant of game.participants) {
      if (!players.has(participant.player)) {
        players.set(participant.player, {
          player: participant.player,
          label: participant.player,
          games: 0,
          wins: 0,
          draws: 0,
          inPerson: 0,
          virtual: 0,
          decks: new Set(),
        });
      }

      const record = players.get(participant.player);
      record.games += 1;
      if (game.location === "in_person") record.inPerson += 1;
      if (game.location === "virtual") record.virtual += 1;
      if (game.result_type === "draw") record.draws += 1;
      if (game.result_type === "win" && game.winner_player === participant.player) record.wins += 1;
      if (isKnown(participant.deck_name_normalized)) record.decks.add(deckIdForParticipant(participant));
    }
  }

  return rankRows(
    [...players.values()].map((record) => ({
      ...record,
      decksUsed: record.decks.size,
      winRate: safeRatio(record.wins, record.games),
    })),
    ["wins", "winRate", "games"],
  );
}

function buildDeckRanking(games, catalogRows = []) {
  const decks = new Map();

  for (const game of games) {
    for (const participant of game.participants) {
      if (!isKnown(participant.deck_name_normalized)) continue;
      const key = deckIdForParticipant(participant);
      if (!decks.has(key)) {
        decks.set(key, {
          deckKey: key,
          label: deckLabel(participant, catalogRows),
          appearances: 0,
          wins: 0,
          pilots: new Set(),
          firstDate: game.date,
          lastDate: game.date,
        });
      }

      const record = decks.get(key);
      record.appearances += 1;
      record.pilots.add(participant.player);
      record.firstDate = record.firstDate < game.date ? record.firstDate : game.date;
      record.lastDate = record.lastDate > game.date ? record.lastDate : game.date;
      if (game.result_type === "win" && game.winner_player === participant.player) record.wins += 1;
    }
  }

  return rankRows(
    [...decks.values()].map((record) => ({
      ...record,
      pilotsList: uniqueSorted([...record.pilots]),
      winRate: safeRatio(record.wins, record.appearances),
    })),
    ["wins", "winRate", "appearances"],
  );
}

function selectedPeriodGames(games, selectedMonth) {
  if (!isKnown(selectedMonth)) return games;
  return games.filter((game) => monthKey(game) === selectedMonth);
}

function previousMonthKey(monthsAsc, selectedMonth) {
  const index = monthsAsc.indexOf(selectedMonth);
  return index > 0 ? monthsAsc[index - 1] : "";
}

function buildPeriodReport(games, selectedMonth, catalogRows = []) {
  const months = listReportMonths(games);
  const monthsAsc = [...months].sort((a, b) => a.localeCompare(b));
  const activeMonth = months.includes(selectedMonth) ? selectedMonth : "";
  const periodGames = selectedPeriodGames(games, activeMonth);
  const previousMonth = activeMonth ? previousMonthKey(monthsAsc, activeMonth) : "";
  const previousGames = previousMonth ? selectedPeriodGames(games, previousMonth) : [];
  const playerRows = buildPlayerRanking(periodGames);
  const deckRows = buildDeckRanking(periodGames, catalogRows);
  const previousPlayerRows = buildPlayerRanking(previousGames);
  const previousDeckRows = buildDeckRanking(previousGames, catalogRows);

  return {
    selectedMonth: activeMonth,
    label: activeMonth ? monthLabel(`${activeMonth}-01`) : "Subconjunto filtrado",
    months,
    games: periodGames.length,
    previousMonth,
    previousLabel: previousMonth ? monthLabel(`${previousMonth}-01`) : "",
    playerRows: withPreviousRank(playerRows, previousPlayerRows, "player"),
    deckRows: withPreviousRank(deckRows, previousDeckRows, "deckKey"),
  };
}

function playerOutcome(game, player) {
  if (game.result_type === "draw") return "draw";
  if (game.result_type === "win" && game.winner_player === player) return "win";
  return "not_win";
}

function buildPlayerStreak(games, player) {
  const playerGames = [...games].filter((game) => participantForPlayer(game, player)).sort(compareDateAsc);
  let currentType = "";
  let currentCount = 0;
  let longestWin = 0;
  let longestNotWin = 0;
  let activeWin = 0;
  let activeNotWin = 0;
  let gamesSinceWin = 0;

  for (const game of playerGames) {
    const outcome = playerOutcome(game, player);
    if (outcome === currentType) currentCount += 1;
    else {
      currentType = outcome;
      currentCount = 1;
    }

    if (outcome === "win") {
      activeWin += 1;
      activeNotWin = 0;
      gamesSinceWin = 0;
    } else {
      activeNotWin += 1;
      activeWin = 0;
      gamesSinceWin += 1;
    }

    longestWin = Math.max(longestWin, activeWin);
    longestNotWin = Math.max(longestNotWin, activeNotWin);
  }

  return {
    player,
    games: playerGames.length,
    currentType,
    currentCount,
    longestWin,
    longestNotWin,
    gamesSinceWin: playerGames.some((game) => playerOutcome(game, player) === "win") ? gamesSinceWin : null,
  };
}

function buildRecentForm(games) {
  const players = uniqueSorted(games.flatMap((game) => game.participants.map((participant) => participant.player)));
  const playerRows = players
    .map((player) => {
      const recentGames = games
        .filter((game) => participantForPlayer(game, player))
        .sort(compareDateDesc)
        .slice(0, 10);
      const wins = recentGames.filter((game) => game.result_type === "win" && game.winner_player === player).length;
      const draws = recentGames.filter((game) => game.result_type === "draw").length;
      return {
        player,
        games: recentGames.length,
        wins,
        draws,
        winRate: safeRatio(wins, recentGames.length),
        recentGameIds: recentGames.map((game) => game.game_id),
      };
    })
    .filter((row) => row.games > 0)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.games - a.games || a.player.localeCompare(b.player, "es"));

  return {
    windowSize: 10,
    playerRows,
    streakRows: players.map((player) => buildPlayerStreak(games, player)).sort((a, b) => b.longestWin - a.longestWin || a.player.localeCompare(b.player, "es")),
    lastGames: [...games].sort(compareDateDesc).slice(0, 12),
  };
}

function catalogMetadataForParticipant(participant, catalogById) {
  return participant.deck_catalog || catalogById.get(deckIdForParticipant(participant)) || {};
}

function incrementCategorical(map, key, label, won) {
  if (!isKnown(key)) return;
  if (!map.has(key)) {
    map.set(key, { key, label: label || key, count: 0, wins: 0 });
  }
  const record = map.get(key);
  record.count += 1;
  if (won) record.wins += 1;
}

function buildMetaReport(games, catalogRows = []) {
  const catalogById = new Map(catalogRows.map((row) => [row.deck_id, row]));
  const deckRows = buildDeckRanking(games, catalogRows);
  const deckAppearances = deckRows.reduce((total, row) => total + row.appearances, 0);
  const archetypes = new Map();
  const tags = new Map();
  const colors = new Map();
  const powerLevels = new Map();
  const podSizes = new Map();
  const locations = new Map();

  for (const game of games) {
    incrementCategorical(podSizes, String(game.player_count), `${game.player_count} jugadores`, game.result_type === "win");
    incrementCategorical(locations, game.location, formatLocation(game.location), game.result_type === "win");

    for (const participant of game.participants) {
      if (!isKnown(participant.deck_name_normalized)) continue;
      const metadata = catalogMetadataForParticipant(participant, catalogById);
      const won = game.result_type === "win" && game.winner_player === participant.player;
      incrementCategorical(archetypes, metadata.archetype, metadata.archetype, won);
      for (const tag of metadata.tags_list ?? []) incrementCategorical(tags, tag, tag, won);
      for (const color of metadata.colors_list ?? []) incrementCategorical(colors, color, color, won);
      incrementCategorical(powerLevels, metadata.power_level, metadata.power_level, won);
    }
  }

  const sortedGames = [...games].sort(compareDateAsc);
  const recentWindowSize = Math.min(12, Math.ceil(sortedGames.length / 2));
  const recentWindow = recentWindowSize > 0 ? sortedGames.slice(-recentWindowSize) : [];
  const previousWindow = recentWindowSize > 0 ? sortedGames.slice(-recentWindowSize * 2, -recentWindowSize) : [];
  const recentDecks = buildDeckRanking(recentWindow, catalogRows);
  const previousByDeck = new Map(buildDeckRanking(previousWindow, catalogRows).map((row) => [row.deckKey, row.appearances]));
  const emergingDecks = recentDecks
    .map((row) => ({
      ...row,
      previousAppearances: previousByDeck.get(row.deckKey) ?? 0,
      appearanceDelta: row.appearances - (previousByDeck.get(row.deckKey) ?? 0),
    }))
    .filter((row) => row.appearances > 0 && row.appearanceDelta > 0)
    .sort((a, b) => b.appearanceDelta - a.appearanceDelta || b.appearances - a.appearances || a.label.localeCompare(b.label, "es"));

  const latestDate = sortedGames.at(-1)?.date ?? "";
  const inactiveDecks = latestDate
    ? deckRows
        .map((row) => ({
          ...row,
          daysSinceLastPlayed: Math.round((Date.parse(latestDate) - Date.parse(row.lastDate)) / 86400000),
        }))
        .filter((row) => Number.isFinite(row.daysSinceLastPlayed) && row.daysSinceLastPlayed > 0)
        .sort((a, b) => b.daysSinceLastPlayed - a.daysSinceLastPlayed || b.appearances - a.appearances)
        .slice(0, 10)
    : [];

  return {
    deckAppearances,
    uniqueDecks: deckRows.length,
    diversityRate: safeRatio(deckRows.length, deckAppearances),
    topDecks: deckRows.slice(0, 12),
    emergingDecks: emergingDecks.slice(0, 10),
    inactiveDecks,
    archetypeRows: countMapToRows(archetypes, "archetype", "label"),
    tagRows: countMapToRows(tags, "tag", "label"),
    colorRows: countMapToRows(colors, "color", "label"),
    powerRows: countMapToRows(powerLevels, "powerLevel", "label"),
    podSizeRows: countMapToRows(podSizes, "podSize", "label"),
    locationRows: countMapToRows(locations, "location", "label"),
    recentWindowSize,
    previousWindowSize: previousWindow.length,
  };
}

function explicitTurnOrder(game) {
  if (!Array.isArray(game.turn_order) || game.turn_order.length === 0) return null;
  const order = game.turn_order.filter(isKnown).map(String);
  const playerSet = new Set(game.participants.map((participant) => participant.player));
  if (order.length !== playerSet.size) return null;
  if (new Set(order).size !== order.length) return null;
  if (!order.every((player) => playerSet.has(player))) return null;
  return { source: "explicit", order };
}

function inferredVirtualTurnOrder(game) {
  if (game.location !== "virtual") return null;
  const participantsBySeat = [...game.participants].sort((a, b) => a.seat_order - b.seat_order);
  const playerSet = new Set(participantsBySeat.map((participant) => participant.player));
  const ordered = VIRTUAL_CLOCKWISE_ORDER.filter((player) => playerSet.has(player));
  const remaining = participantsBySeat.map((participant) => participant.player).filter((player) => !ordered.includes(player));
  const order = [...ordered, ...remaining];
  return order.length === participantsBySeat.length ? { source: "inferred_virtual", order } : null;
}

function turnOrderForGame(game) {
  return explicitTurnOrder(game) ?? inferredVirtualTurnOrder(game);
}

function buildPositionRows(games, getOrder) {
  const positions = new Map();
  const players = new Map();
  let eligibleGames = 0;

  for (const game of games) {
    const orderData = getOrder(game);
    if (!orderData) continue;
    eligibleGames += 1;
    orderData.order.forEach((player, index) => {
      const position = index + 1;
      const key = String(position);
      const won = game.result_type === "win" && game.winner_player === player;
      if (!positions.has(key)) positions.set(key, { position, count: 0, wins: 0 });
      const positionRecord = positions.get(key);
      positionRecord.count += 1;
      if (won) positionRecord.wins += 1;

      if (!players.has(player)) players.set(player, { player, count: 0, wins: 0, positions: [] });
      const playerRecord = players.get(player);
      playerRecord.count += 1;
      playerRecord.positions.push(position);
      if (won) playerRecord.wins += 1;
    });
  }

  return {
    eligibleGames,
    positionRows: [...positions.values()]
      .map((row) => ({ ...row, winRate: safeRatio(row.wins, row.count) }))
      .sort((a, b) => a.position - b.position),
    playerRows: [...players.values()]
      .map((row) => ({
        ...row,
        appearances: row.count,
        averagePosition: mean(row.positions),
        winRate: safeRatio(row.wins, row.count),
      }))
      .sort((a, b) => b.appearances - a.appearances || (a.averagePosition ?? 99) - (b.averagePosition ?? 99)),
  };
}

function buildTurnOrderReport(games) {
  const sources = new Map();
  for (const game of games) {
    const order = turnOrderForGame(game);
    if (order) incrementCategorical(sources, order.source, order.source === "explicit" ? "Orden registrado" : "Virtual inferido", false);
  }

  const turnRows = buildPositionRows(games, turnOrderForGame);
  const seatRows = buildPositionRows(games, (game) => ({
    source: "seat_order",
    order: [...game.participants].sort((a, b) => a.seat_order - b.seat_order).map((participant) => participant.player),
  }));

  return {
    totalGames: games.length,
    eligibleGames: turnRows.eligibleGames,
    coverageRate: safeRatio(turnRows.eligibleGames, games.length),
    sourceRows: countMapToRows(sources, "source", "label"),
    positionRows: turnRows.positionRows,
    playerRows: turnRows.playerRows,
    seatPositionRows: seatRows.positionRows,
    seatPlayerRows: seatRows.playerRows,
    virtualRule: "Jairo > Andres > Cris > Chepe cuando Cris participa; si no, Jairo > Andres > Chepe.",
  };
}

function buildDurationReport(games, catalogRows = []) {
  const durations = games
    .filter((game) => isKnown(game.duration_minutes))
    .map((game) => Number(game.duration_minutes))
    .filter(Number.isFinite);
  const playerDurations = new Map();
  const deckDurations = new Map();

  for (const game of games) {
    const duration = Number(game.duration_minutes);
    if (!Number.isFinite(duration)) continue;
    for (const participant of game.participants) {
      if (!playerDurations.has(participant.player)) playerDurations.set(participant.player, []);
      playerDurations.get(participant.player).push(duration);

      if (!isKnown(participant.deck_name_normalized)) continue;
      const key = deckIdForParticipant(participant);
      if (!deckDurations.has(key)) deckDurations.set(key, { label: deckLabel(participant, catalogRows), durations: [] });
      deckDurations.get(key).durations.push(duration);
    }
  }

  const toRows = (entries, keyName) =>
    entries
      .map(([key, value]) => {
        const values = Array.isArray(value) ? value : value.durations;
        return {
          [keyName]: key,
          label: value.label ?? key,
          sample: values.length,
          average: mean(values),
          median: median(values),
          min: Math.min(...values),
          max: Math.max(...values),
        };
      })
      .filter((row) => row.sample > 0)
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || b.sample - a.sample || String(a.label).localeCompare(String(b.label), "es"));

  return {
    knownGames: durations.length,
    totalGames: games.length,
    coverageRate: safeRatio(durations.length, games.length),
    average: mean(durations),
    median: median(durations),
    byPlayer: toRows([...playerDurations.entries()], "player"),
    byDeck: toRows([...deckDurations.entries()], "deckKey"),
  };
}

function buildDeckEventReport(games, catalogRows = []) {
  const winConditions = new Map();
  const kills = new Map();
  const deaths = new Map();
  let winConditionSample = 0;
  let eliminationSample = 0;

  function ensureDeckMap(map, key, label, extra = {}) {
    if (!map.has(key)) map.set(key, { deckKey: key, label, count: 0, games: new Set(), ...extra });
    return map.get(key);
  }

  for (const game of games) {
    if (isKnown(game.win_condition_category) && game.result_type === "win" && isKnown(game.winner_player)) {
      const winner = participantForPlayer(game, game.winner_player);
      if (winner && isKnown(winner.deck_name_normalized)) {
        winConditionSample += 1;
        const key = `${deckIdForParticipant(winner)}||${game.win_condition_category}`;
        const record = ensureDeckMap(winConditions, key, deckLabel(winner, catalogRows), {
          condition: game.win_condition_category,
        });
        record.count += 1;
        record.games.add(game.game_id);
      }
    }

    for (const event of game.events ?? []) {
      if (event.event_type !== "elimination") continue;
      const actor = isKnown(event.actor) ? participantForPlayer(game, event.actor) : null;
      const target = isKnown(event.target) ? participantForPlayer(game, event.target) : null;
      if (actor && isKnown(actor.deck_name_normalized)) {
        eliminationSample += 1;
        const key = deckIdForParticipant(actor);
        const record = ensureDeckMap(kills, key, deckLabel(actor, catalogRows), { methods: new Map() });
        record.count += 1;
        record.games.add(game.game_id);
        incrementCategorical(record.methods, event.method || "unspecified", event.method || "unspecified", false);
      }
      if (target && isKnown(target.deck_name_normalized)) {
        const key = deckIdForParticipant(target);
        const record = ensureDeckMap(deaths, key, deckLabel(target, catalogRows), { byActor: new Map() });
        record.count += 1;
        record.games.add(game.game_id);
        incrementCategorical(record.byActor, event.actor || "No registrado", event.actor || "No registrado", false);
      }
    }
  }

  const methodLabels = (map) =>
    countMapToRows(map, "method", "label").map((row) => `${row.label} (${row.count})`);

  return {
    winConditionSample,
    eliminationSample,
    winConditionRows: [...winConditions.values()]
      .map((row) => ({ ...row, gameIds: [...row.games], count: row.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")),
    killRows: [...kills.values()]
      .map((row) => ({ ...row, gameIds: [...row.games], methods: methodLabels(row.methods) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")),
    deathRows: [...deaths.values()]
      .map((row) => ({ ...row, gameIds: [...row.games], byActor: methodLabels(row.byActor) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")),
  };
}

function buildMonthlyAwards(games, catalogRows = []) {
  const grouped = groupBy(games, monthKey);
  return [...grouped.entries()]
    .filter(([month]) => isKnown(month))
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthGames]) => {
      const players = buildPlayerRanking(monthGames);
      const decks = buildDeckRanking(monthGames, catalogRows);
      const bestRatePlayer = [...players].filter((row) => row.games >= 2).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)[0] ?? null;
      const mostVariety = [...players].sort((a, b) => b.decksUsed - a.decksUsed || b.games - a.games)[0] ?? null;
      const longestGame = [...monthGames].filter((game) => isKnown(game.duration_minutes)).sort((a, b) => Number(b.duration_minutes) - Number(a.duration_minutes))[0] ?? null;
      const nukeCount = monthGames.flatMap((game) => game.events ?? []).filter((event) => event.event_type === "nuke").length;
      const solRingCount = monthGames.flatMap((game) => game.events ?? []).filter((event) => event.event_type === "sol_ring_turn_1").length;

      return {
        month,
        label: monthLabel(`${month}-01`),
        games: monthGames.length,
        topWinner: players[0] ?? null,
        bestRatePlayer,
        mostVariety,
        topDeck: decks[0] ?? null,
        longestGame,
        nukeCount,
        solRingCount,
      };
    });
}

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function buildEloReport(games) {
  const players = uniqueSorted(games.flatMap((game) => game.participants.map((participant) => participant.player)));
  const ratings = new Map(players.map((player) => [player, ELO_START]));
  const stats = new Map(players.map((player) => [player, { player, games: 0, wins: 0, draws: 0 }]));

  for (const game of [...games].sort(compareDateAsc)) {
    const participants = game.participants.map((participant) => participant.player);
    if (participants.length < 2) continue;
    for (const player of participants) {
      const record = stats.get(player);
      record.games += 1;
      if (game.result_type === "win" && game.winner_player === player) record.wins += 1;
      if (game.result_type === "draw") record.draws += 1;
    }

    const deltas = new Map(participants.map((player) => [player, 0]));
    const k = ELO_K / Math.max(1, participants.length - 1);

    for (let indexA = 0; indexA < participants.length; indexA += 1) {
      for (let indexB = indexA + 1; indexB < participants.length; indexB += 1) {
        const playerA = participants[indexA];
        const playerB = participants[indexB];
        const ratingA = ratings.get(playerA) ?? ELO_START;
        const ratingB = ratings.get(playerB) ?? ELO_START;
        let actualA = 0.5;
        if (game.result_type === "win") {
          if (game.winner_player === playerA) actualA = 1;
          else if (game.winner_player === playerB) actualA = 0;
        }
        const expectedA = expectedScore(ratingA, ratingB);
        const deltaA = k * (actualA - expectedA);
        deltas.set(playerA, deltas.get(playerA) + deltaA);
        deltas.set(playerB, deltas.get(playerB) - deltaA);
      }
    }

    for (const [player, delta] of deltas.entries()) {
      ratings.set(player, (ratings.get(player) ?? ELO_START) + delta);
    }
  }

  return {
    startRating: ELO_START,
    kFactor: ELO_K,
    rows: [...ratings.entries()]
      .map(([player, rating]) => ({
        ...stats.get(player),
        rating,
        change: rating - ELO_START,
        winRate: safeRatio(stats.get(player).wins, stats.get(player).games),
      }))
      .sort((a, b) => b.rating - a.rating || b.games - a.games || a.player.localeCompare(b.player, "es")),
  };
}

function eventSummary(game) {
  const events = game.events ?? [];
  if (events.length === 0) return "";
  const grouped = groupBy(events, (event) => event.event_type);
  return [...grouped.entries()]
    .map(([type, rows]) => `${type} (${rows.length})`)
    .join(", ");
}

function buildTimeline(games, catalogRows = []) {
  return [...games].sort(compareDateDesc).slice(0, 30).map((game) => ({
    gameId: game.game_id,
    date: game.date,
    location: game.location,
    result: game.result_type === "draw" ? "Empate" : game.winner_player,
    winCondition: game.win_condition_category,
    duration: game.duration_minutes,
    participants: game.participants.map((participant) => `${participant.player}: ${deckLabel(participant, catalogRows)}`),
    events: eventSummary(game),
  }));
}

function buildFunFacts(games, reports) {
  const facts = [];
  const add = (title, value, sample) => facts.push({ title, value, sample });
  const topElo = reports.elo.rows[0];
  const topRecent = reports.recentForm.playerRows[0];
  const mostInactive = reports.meta.inactiveDecks[0];
  const longestDuration = reports.duration.byPlayer[0];
  const bestTurnPosition = [...reports.turnOrder.positionRows]
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.winRate - a.winRate || b.count - a.count)[0];
  const topDeckKill = reports.deckEvents.killRows[0];

  if (topElo) add("Rating experimental", topElo.player, `${Math.round(topElo.rating)} Elo; n=${topElo.games}`);
  if (topRecent) add("Forma reciente", topRecent.player, `${formatPercent(topRecent.winRate)} en sus ultimas ${topRecent.games}`);
  if (mostInactive) add("Deck en pausa", mostInactive.label, `${mostInactive.daysSinceLastPlayed} dias sin aparecer`);
  if (longestDuration) add("Promedio mas largo", longestDuration.label, `${longestDuration.average.toFixed(1)} min; n=${longestDuration.sample}`);
  if (bestTurnPosition) add("Mejor posicion", `Posicion ${bestTurnPosition.position}`, `${formatPercent(bestTurnPosition.winRate)}; n=${bestTurnPosition.count}`);
  if (topDeckKill) add("Deck mas letal", topDeckKill.label, `${topDeckKill.count} eliminaciones registradas`);
  add("Muestra", `${games.length} partidas`, `${reports.meta.uniqueDecks} decks unicos en ${reports.meta.deckAppearances} apariciones`);

  return facts.slice(0, 8);
}

function buildDiscordSummary(games, reports) {
  const lines = [];
  const topPlayers = reports.period.playerRows.slice(0, 3).map((row) => `${row.rank}. ${row.player} ${row.wins}/${row.games} (${formatPercent(row.winRate)})`);
  const topDecks = reports.period.deckRows.slice(0, 3).map((row) => `${row.rank}. ${row.label} ${row.wins}/${row.appearances} (${formatPercent(row.winRate)})`);
  const topEvents = reports.deckEvents.killRows.slice(0, 3).map((row) => `${row.label}: ${row.count}`);

  lines.push(`MTG Commander - ${reports.period.label}`);
  lines.push(`Partidas: ${reports.period.games} de ${games.length} filtradas`);
  lines.push(`Meta: ${reports.meta.uniqueDecks} decks unicos / ${reports.meta.deckAppearances} apariciones`);
  lines.push(`Duracion: ${reports.duration.average === null ? "No registrado" : `${reports.duration.average.toFixed(1)} min`} (n=${reports.duration.knownGames}/${reports.duration.totalGames})`);
  lines.push("");
  lines.push("Top jugadores");
  lines.push(...(topPlayers.length > 0 ? topPlayers : ["No registrado"]));
  lines.push("");
  lines.push("Top decks");
  lines.push(...(topDecks.length > 0 ? topDecks : ["No registrado"]));
  lines.push("");
  lines.push("Eliminaciones por deck");
  lines.push(...(topEvents.length > 0 ? topEvents : ["No registrado"]));
  return lines.join("\n");
}

export function calculateAdvancedReports(games, options = {}) {
  const { periodMonth = "", catalogRows = [] } = options;
  const period = buildPeriodReport(games, periodMonth, catalogRows);
  const recentForm = buildRecentForm(games);
  const meta = buildMetaReport(games, catalogRows);
  const turnOrder = buildTurnOrderReport(games);
  const duration = buildDurationReport(games, catalogRows);
  const deckEvents = buildDeckEventReport(games, catalogRows);
  const awards = buildMonthlyAwards(games, catalogRows);
  const elo = buildEloReport(games);
  const timeline = buildTimeline(games, catalogRows);
  const reports = { period, recentForm, meta, turnOrder, duration, deckEvents, awards, elo, timeline };
  return {
    ...reports,
    funFacts: buildFunFacts(games, reports),
    discordSummary: buildDiscordSummary(games, reports),
  };
}
