import {
  groupBy,
  isKnown,
  makeDeckKey,
  mean,
  median,
  monthLabel,
  safeRatio,
  sortByNumberDescThenName,
  splitDeckKey,
  uniqueSorted,
} from "./utils.js";

function emptyLocationCounts() {
  return { in_person: 0, virtual: 0 };
}

function ensurePlayerRecord(map, player) {
  if (!map.has(player)) {
    map.set(player, {
      player,
      participations: 0,
      wins: 0,
      winRate: 0,
      inPersonWins: 0,
      virtualWins: 0,
      decksUsed: new Set(),
      deckCounts: new Map(),
      deckWins: new Map(),
      durations: [],
    });
  }

  return map.get(player);
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function bestMapEntry(map) {
  const entries = [...map.entries()].sort((a, b) => {
    const countDifference = b[1] - a[1];
    if (countDifference !== 0) return countDifference;
    return a[0].localeCompare(b[0], "es", { sensitivity: "base" });
  });

  return entries[0] ?? null;
}

function buildPlayerStats(games) {
  const players = new Map();

  for (const game of games) {
    for (const participant of game.participants) {
      const record = ensurePlayerRecord(players, participant.player);
      record.participations += 1;

      if (isKnown(participant.deck_name_normalized)) {
        record.decksUsed.add(participant.deck_name_normalized);
        incrementMap(record.deckCounts, participant.deck_name_normalized);
      }

      if (isKnown(game.duration_minutes)) {
        record.durations.push(Number(game.duration_minutes));
      }

      const won = game.result_type === "win" && game.winner_player === participant.player;
      if (won) {
        record.wins += 1;
        if (game.location === "in_person") record.inPersonWins += 1;
        if (game.location === "virtual") record.virtualWins += 1;
        if (isKnown(participant.deck_name_normalized)) {
          incrementMap(record.deckWins, participant.deck_name_normalized);
        }
      }
    }
  }

  return [...players.values()]
    .map((record) => {
      const mostPlayedDeck = bestMapEntry(record.deckCounts);
      const winningDeck = bestMapEntry(record.deckWins);
      const durationAverage = mean(record.durations);

      return {
        player: record.player,
        participations: record.participations,
        wins: record.wins,
        winRate: safeRatio(record.wins, record.participations) ?? 0,
        inPersonWins: record.inPersonWins,
        virtualWins: record.virtualWins,
        decksUsed: record.decksUsed.size,
        mostPlayedDeck: mostPlayedDeck ? `${mostPlayedDeck[0]} (n=${mostPlayedDeck[1]})` : "",
        deckWithMostWins: winningDeck ? `${winningDeck[0]} (${winningDeck[1]} vict.)` : "",
        averageDuration: durationAverage,
        durationSample: record.durations.length,
      };
    })
    .sort((a, b) => {
      const winDifference = b.wins - a.wins;
      if (winDifference !== 0) return winDifference;
      return b.participations - a.participations;
    });
}

function createDeckRecord(game, participant) {
  const catalog = participant.deck_catalog;
  return {
    key: makeDeckKey(participant.player, participant.deck_name_normalized),
    player: participant.player,
    deckName: participant.deck_name_normalized,
    displayName: catalog?.display_name || participant.deck_name_normalized,
    commanderName: participant.commander_name || "",
    appearances: 0,
    wins: 0,
    firstDate: game.date,
    lastDate: game.date,
    variants: new Set(catalog?.variants_list ?? []),
    aliases: new Set(catalog?.aliases_list ?? []),
  };
}

function buildDeckStats(games) {
  const decks = new Map();

  for (const game of games) {
    for (const participant of game.participants) {
      if (!isKnown(participant.deck_name_normalized)) continue;

      const key = makeDeckKey(participant.player, participant.deck_name_normalized);
      if (!decks.has(key)) decks.set(key, createDeckRecord(game, participant));

      const record = decks.get(key);
      record.appearances += 1;
      record.firstDate = record.firstDate < game.date ? record.firstDate : game.date;
      record.lastDate = record.lastDate > game.date ? record.lastDate : game.date;

      if (isKnown(participant.deck_variant)) record.variants.add(participant.deck_variant);
      if (isKnown(participant.deck_name_raw)) record.aliases.add(participant.deck_name_raw);
      if (!isKnown(record.commanderName) && isKnown(participant.commander_name)) {
        record.commanderName = participant.commander_name;
      }

      if (game.result_type === "win" && game.winner_player === participant.player) {
        record.wins += 1;
      }
    }
  }

  return [...decks.values()]
    .map((record) => ({
      ...record,
      variants: uniqueSorted([...record.variants]),
      aliases: uniqueSorted([...record.aliases]),
      winRate: safeRatio(record.wins, record.appearances) ?? 0,
    }))
    .sort((a, b) => {
      const appearancesDifference = b.appearances - a.appearances;
      if (appearancesDifference !== 0) return appearancesDifference;
      return a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" });
    });
}

function buildGamesByMonth(games) {
  const grouped = groupBy(games, (game) => String(game.date).slice(0, 7));
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthGames]) => ({
      month,
      label: monthLabel(`${month}-01`),
      count: monthGames.length,
    }));
}

function buildDurationHistogram(durations) {
  const buckets = [
    { label: "0-29", min: 0, max: 29, count: 0 },
    { label: "30-44", min: 30, max: 44, count: 0 },
    { label: "45-59", min: 45, max: 59, count: 0 },
    { label: "60-74", min: 60, max: 74, count: 0 },
    { label: "75+", min: 75, max: Infinity, count: 0 },
  ];

  for (const duration of durations) {
    const bucket = buckets.find((item) => duration >= item.min && duration <= item.max);
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

function buildStarterAdvantage(games) {
  const eligibleGames = games.filter(
    (game) => game.result_type === "win" && isKnown(game.starting_player) && isKnown(game.winner_player),
  );
  const starterWins = eligibleGames.filter((game) => game.starting_player === game.winner_player).length;

  return {
    sample: eligibleGames.length,
    starterWins,
    starterLosses: eligibleGames.length - starterWins,
    winRate: safeRatio(starterWins, eligibleGames.length),
  };
}

function countKnown(games, fieldName) {
  return games.filter((game) => isKnown(game[fieldName])).length;
}

function buildQualityStats(games) {
  const confidenceCounts = {
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const game of games) {
    if (confidenceCounts[game.parse_confidence] !== undefined) {
      confidenceCounts[game.parse_confidence] += 1;
    }
  }

  const nukeKnown = games.filter((game) => game.nuke_recorded !== null && game.nuke_recorded !== undefined).length;
  const solRingKnown = games.filter(
    (game) => game.sol_ring_t1_recorded !== null && game.sol_ring_t1_recorded !== undefined,
  ).length;

  return {
    confidenceCounts,
    needsReviewGames: games.filter((game) => game.needs_review === true),
    durationCoverage: countKnown(games, "duration_minutes"),
    starterCoverage: countKnown(games, "starting_player"),
    winConditionCoverage: countKnown(games, "win_condition_category"),
    nukeKnown,
    nukeTrue: games.filter((game) => game.nuke_recorded === true).length,
    solRingKnown,
    solRingTrue: games.filter((game) => game.sol_ring_t1_recorded === true).length,
    eventRows: games.flatMap((game) => game.events).length,
  };
}

function buildCombatStats(games) {
  const eliminationEvents = games.flatMap((game) =>
    game.events
      .filter((event) => event.event_type === "elimination" && isKnown(event.actor) && isKnown(event.target))
      .map((event) => ({
        ...event,
        game_id: game.game_id,
        date: game.date,
      })),
  );
  const gamesWithEliminations = new Set(eliminationEvents.map((event) => event.game_id));
  const byActor = new Map();
  const byTarget = new Map();
  const byPair = new Map();
  const byMethod = new Map();
  const winConditions = new Map();

  for (const event of eliminationEvents) {
    incrementMap(byActor, event.actor);
    incrementMap(byTarget, event.target);
    incrementMap(byMethod, event.method || "unspecified");

    const pairKey = `${event.actor}||${event.target}`;
    if (!byPair.has(pairKey)) {
      byPair.set(pairKey, {
        actor: event.actor,
        target: event.target,
        count: 0,
        methods: new Map(),
        gameIds: [],
      });
    }

    const pair = byPair.get(pairKey);
    pair.count += 1;
    pair.gameIds.push(event.game_id);
    incrementMap(pair.methods, event.method || "unspecified");
  }

  for (const game of games) {
    if (!isKnown(game.win_condition_category)) continue;
    const key = game.win_condition_category;
    if (!winConditions.has(key)) {
      winConditions.set(key, {
        category: key,
        count: 0,
        winners: new Map(),
        gameIds: [],
      });
    }

    const condition = winConditions.get(key);
    condition.count += 1;
    condition.gameIds.push(game.game_id);
    if (isKnown(game.winner_player)) incrementMap(condition.winners, game.winner_player);
  }

  const mapToRows = (map, labelName) =>
    [...map.entries()]
      .map(([label, count]) => ({ [labelName]: label, count }))
      .sort((a, b) => {
        const countDifference = b.count - a.count;
        if (countDifference !== 0) return countDifference;
        return String(a[labelName]).localeCompare(String(b[labelName]), "es", { sensitivity: "base" });
      });

  const pairRows = [...byPair.values()]
    .map((pair) => ({
      ...pair,
      topMethod: bestMapEntry(pair.methods)?.[0] ?? "",
      methods: [...pair.methods.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([method, count]) => `${method} (${count})`),
    }))
    .sort((a, b) => {
      const countDifference = b.count - a.count;
      if (countDifference !== 0) return countDifference;
      return `${a.actor} ${a.target}`.localeCompare(`${b.actor} ${b.target}`, "es", { sensitivity: "base" });
    });

  const winConditionRows = [...winConditions.values()]
    .map((condition) => ({
      ...condition,
      topWinner: bestMapEntry(condition.winners)?.[0] ?? "",
    }))
    .sort((a, b) => {
      const countDifference = b.count - a.count;
      if (countDifference !== 0) return countDifference;
      return a.category.localeCompare(b.category, "es", { sensitivity: "base" });
    });

  return {
    eliminationEvents,
    eliminationEventCount: eliminationEvents.length,
    gamesWithEliminations: gamesWithEliminations.size,
    byActor: mapToRows(byActor, "actor"),
    byTarget: mapToRows(byTarget, "target"),
    byMethod: mapToRows(byMethod, "method"),
    pairs: pairRows,
    winConditions: winConditionRows,
    winConditionGameCount: winConditionRows.reduce((total, row) => total + row.count, 0),
  };
}

export function calculateStats(games) {
  const totalGames = games.length;
  const locations = emptyLocationCounts();
  for (const game of games) {
    if (locations[game.location] !== undefined) locations[game.location] += 1;
  }

  const participantRows = games.flatMap((game) => game.participants);
  const uniquePlayers = uniqueSorted(participantRows.map((participant) => participant.player));
  const draws = games.filter((game) => game.result_type === "draw").length;
  const durations = games
    .filter((game) => isKnown(game.duration_minutes))
    .map((game) => Number(game.duration_minutes))
    .filter((duration) => Number.isFinite(duration));
  const starterKnown = countKnown(games, "starting_player");
  const winConditionKnown = countKnown(games, "win_condition_category");
  const reviewGames = games.filter((game) => game.needs_review === true);
  const playerStats = buildPlayerStats(games);
  const deckStats = buildDeckStats(games);
  const quality = buildQualityStats(games);
  const combat = buildCombatStats(games);
  const starterAdvantage = buildStarterAdvantage(games);

  return {
    totalGames,
    locations,
    uniquePlayers,
    draws,
    duration: {
      sample: durations.length,
      average: mean(durations),
      median: median(durations),
      histogram: buildDurationHistogram(durations),
    },
    starterCoverage: {
      known: starterKnown,
      total: totalGames,
      rate: safeRatio(starterKnown, totalGames),
    },
    winConditionCoverage: {
      known: winConditionKnown,
      total: totalGames,
      rate: safeRatio(winConditionKnown, totalGames),
    },
    reviewGames,
    playerStats,
    deckStats,
    gamesByMonth: buildGamesByMonth(games),
    quality,
    combat,
    starterAdvantage,
    topDecks: sortByNumberDescThenName(deckStats, "appearances", "displayName").slice(0, 10),
  };
}

function participantLabel(participant) {
  const displayName = participant.deck_catalog?.display_name || participant.deck_name_normalized;
  return `${displayName} / ${participant.player}`;
}

function deckOptionLabel(deckKey, catalogRows) {
  const { player, deckName } = splitDeckKey(deckKey);
  const catalogRow = catalogRows?.find(
    (row) => row.player === player && row.deck_name_normalized === deckName,
  );
  return `${catalogRow?.display_name || deckName} / ${player}`;
}

function ensureMatchupRecord(records, subjectParticipant, opponentParticipant, catalogRows) {
  const opponentKey = makeDeckKey(opponentParticipant.player, opponentParticipant.deck_name_normalized);

  if (!records.has(opponentKey)) {
    records.set(opponentKey, {
      opponentKey,
      opponentLabel: participantLabel(opponentParticipant) || deckOptionLabel(opponentKey, catalogRows),
      appearances: 0,
      subjectWins: 0,
      opponentWins: 0,
      otherWins: 0,
      draws: 0,
      gameIds: [],
    });
  }

  return records.get(opponentKey);
}

export function calculateMatchupStats(games, options = {}) {
  const { subjectKey = "", rivalKey = "", minGames = 1, catalogRows = [] } = options;
  const subjectLabel = subjectKey ? deckOptionLabel(subjectKey, catalogRows) : "";
  const records = new Map();
  let subjectAppearances = 0;
  let eligibleGames = 0;

  if (!isKnown(subjectKey)) {
    return {
      subjectKey,
      subjectLabel,
      rivalKey,
      rivalLabel: "",
      minGames,
      subjectAppearances,
      eligibleGames,
      rows: [],
      direct: null,
    };
  }

  for (const game of games) {
    const subjectParticipant = game.participants.find(
      (participant) =>
        isKnown(participant.deck_name_normalized) &&
        makeDeckKey(participant.player, participant.deck_name_normalized) === subjectKey,
    );

    if (!subjectParticipant) continue;
    subjectAppearances += 1;

    const opponents = game.participants.filter((participant) => {
      if (participant === subjectParticipant || !isKnown(participant.deck_name_normalized)) return false;
      const opponentKey = makeDeckKey(participant.player, participant.deck_name_normalized);
      return !isKnown(rivalKey) || opponentKey === rivalKey;
    });

    if (opponents.length > 0) eligibleGames += 1;

    for (const opponent of opponents) {
      const record = ensureMatchupRecord(records, subjectParticipant, opponent, catalogRows);
      record.appearances += 1;
      record.gameIds.push(game.game_id);

      if (game.result_type === "draw") {
        record.draws += 1;
      } else if (game.winner_player === subjectParticipant.player) {
        record.subjectWins += 1;
      } else if (game.winner_player === opponent.player) {
        record.opponentWins += 1;
      } else {
        record.otherWins += 1;
      }
    }
  }

  const rows = [...records.values()]
    .map((record) => ({
      ...record,
      subjectWinRate: safeRatio(record.subjectWins, record.appearances) ?? 0,
      opponentWinRate: safeRatio(record.opponentWins, record.appearances) ?? 0,
      otherOrDrawCount: record.otherWins + record.draws,
    }))
    .filter((record) => record.appearances >= minGames)
    .sort((a, b) => {
      const rateDifference = b.subjectWinRate - a.subjectWinRate;
      if (rateDifference !== 0) return rateDifference;
      const sampleDifference = b.appearances - a.appearances;
      if (sampleDifference !== 0) return sampleDifference;
      return a.opponentLabel.localeCompare(b.opponentLabel, "es", { sensitivity: "base" });
    });

  const direct = isKnown(rivalKey) ? rows.find((row) => row.opponentKey === rivalKey) ?? null : null;

  return {
    subjectKey,
    subjectLabel,
    rivalKey,
    rivalLabel: isKnown(rivalKey) ? deckOptionLabel(rivalKey, catalogRows) : "",
    minGames,
    subjectAppearances,
    eligibleGames,
    rows,
    direct,
  };
}
