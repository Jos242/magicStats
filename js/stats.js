import {
  deckIdForParticipant,
  deckLabelForCatalog,
  deckLabelForParticipant,
  deckNameForParticipant,
  deckOwnerForParticipant,
  groupBy,
  isKnown,
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
        const deckId = deckIdForParticipant(participant);
        const deckLabel = deckLabelForParticipant(participant);
        record.decksUsed.add(deckId);
        incrementMap(record.deckCounts, deckLabel);
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
          incrementMap(record.deckWins, deckLabelForParticipant(participant));
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
  const displayName = deckNameForParticipant(participant);
  const ownerPlayer = deckOwnerForParticipant(participant);
  return {
    key: deckIdForParticipant(participant),
    deckId: deckIdForParticipant(participant),
    ownerPlayer,
    player: ownerPlayer,
    deckName: participant.deck_name_normalized,
    displayName,
    officialName: catalog?.official_name || "",
    commanderName: participant.commander_name || "",
    moxfieldUrl: catalog?.moxfield_url || "",
    archidektUrl: catalog?.archidekt_url || "",
    edhrecUrl: catalog?.edhrec_url || "",
    archetype: catalog?.archetype || "",
    powerLevel: catalog?.power_level || "",
    tags: new Set(catalog?.tags_list ?? []),
    colors: new Set(catalog?.colors_list ?? []),
    appearances: 0,
    wins: 0,
    firstDate: game.date,
    lastDate: game.date,
    pilots: new Map(),
    variants: new Set(catalog?.variants_list ?? []),
    aliases: new Set(catalog?.aliases_list ?? []),
  };
}

function buildDeckStats(games) {
  const decks = new Map();

  for (const game of games) {
    for (const participant of game.participants) {
      if (!isKnown(participant.deck_name_normalized)) continue;

      const key = deckIdForParticipant(participant);
      if (!decks.has(key)) decks.set(key, createDeckRecord(game, participant));

      const record = decks.get(key);
      record.appearances += 1;
      record.firstDate = record.firstDate < game.date ? record.firstDate : game.date;
      record.lastDate = record.lastDate > game.date ? record.lastDate : game.date;
      incrementMap(record.pilots, participant.player);

      if (isKnown(participant.deck_variant)) record.variants.add(participant.deck_variant);
      if (isKnown(participant.deck_name_raw)) record.aliases.add(participant.deck_name_raw);
      if (!isKnown(record.commanderName) && isKnown(participant.commander_name)) {
        record.commanderName = participant.commander_name;
      }
      if (!isKnown(record.officialName) && isKnown(participant.deck_catalog?.official_name)) {
        record.officialName = participant.deck_catalog.official_name;
      }
      if (!isKnown(record.moxfieldUrl) && isKnown(participant.deck_catalog?.moxfield_url)) {
        record.moxfieldUrl = participant.deck_catalog.moxfield_url;
      }
      if (!isKnown(record.archidektUrl) && isKnown(participant.deck_catalog?.archidekt_url)) {
        record.archidektUrl = participant.deck_catalog.archidekt_url;
      }
      if (!isKnown(record.edhrecUrl) && isKnown(participant.deck_catalog?.edhrec_url)) {
        record.edhrecUrl = participant.deck_catalog.edhrec_url;
      }
      if (!isKnown(record.archetype) && isKnown(participant.deck_catalog?.archetype)) {
        record.archetype = participant.deck_catalog.archetype;
      }
      if (!isKnown(record.powerLevel) && isKnown(participant.deck_catalog?.power_level)) {
        record.powerLevel = participant.deck_catalog.power_level;
      }
      for (const tag of participant.deck_catalog?.tags_list ?? []) record.tags.add(tag);
      for (const color of participant.deck_catalog?.colors_list ?? []) record.colors.add(color);

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
      tags: uniqueSorted([...record.tags]),
      colors: uniqueSorted([...record.colors]),
      pilots: [...record.pilots.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es", { sensitivity: "base" }))
        .map(([pilot, count]) => `${pilot} (n=${count})`),
      winRate: safeRatio(record.wins, record.appearances) ?? 0,
    }))
    .sort((a, b) => {
      const appearancesDifference = b.appearances - a.appearances;
      if (appearancesDifference !== 0) return appearancesDifference;
      return a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" });
    });
}


function createPlayerDeckRecord(game, participant) {
  const catalog = participant.deck_catalog;
  const displayName = deckNameForParticipant(participant);
  const ownerPlayer = deckOwnerForParticipant(participant);
  return {
    key: deckIdForParticipant(participant),
    deckId: deckIdForParticipant(participant),
    displayName,
    officialName: catalog?.official_name || "",
    commanderName: participant.commander_name || "",
    ownerPlayer,
    appearances: 0,
    wins: 0,
    draws: 0,
    inPerson: 0,
    virtual: 0,
    firstDate: game.date,
    lastDate: game.date,
    variants: new Set(catalog?.variants_list ?? []),
    aliases: new Set(catalog?.aliases_list ?? []),
    moxfieldUrl: catalog?.moxfield_url || "",
    archidektUrl: catalog?.archidekt_url || "",
    edhrecUrl: catalog?.edhrec_url || "",
    archetype: catalog?.archetype || "",
    powerLevel: catalog?.power_level || "",
    tags: new Set(catalog?.tags_list ?? []),
    colors: new Set(catalog?.colors_list ?? []),  };
}

export function calculatePlayerDeckStats(games, player) {
  const playerGames = games.filter((game) => game.participants.some((participant) => participant.player === player));
  const decks = new Map();

  if (!isKnown(player)) {
    return {
      player: "",
      totalGames: 0,
      deckGames: 0,
      wins: 0,
      winRate: null,
      deckCount: 0,
      mostPlayed: null,
      bestWinRate: null,
      rows: [],
    };
  }

  for (const game of playerGames) {
    const participant = game.participants.find((candidate) => candidate.player === player);
    if (!participant || !isKnown(participant.deck_name_normalized)) continue;

    const key = deckIdForParticipant(participant);
    if (!decks.has(key)) decks.set(key, createPlayerDeckRecord(game, participant));

    const record = decks.get(key);
    record.appearances += 1;
    record.firstDate = record.firstDate < game.date ? record.firstDate : game.date;
    record.lastDate = record.lastDate > game.date ? record.lastDate : game.date;
    if (game.location === "in_person") record.inPerson += 1;
    if (game.location === "virtual") record.virtual += 1;
    if (game.result_type === "draw") record.draws += 1;
    if (isKnown(participant.deck_variant)) record.variants.add(participant.deck_variant);
    if (isKnown(participant.deck_name_raw)) record.aliases.add(participant.deck_name_raw);
    if (!isKnown(record.commanderName) && isKnown(participant.commander_name)) {
      record.commanderName = participant.commander_name;
    }

    if (game.result_type === "win" && game.winner_player === player) {
      record.wins += 1;
    }
  }

  const rows = [...decks.values()]
    .map((record) => ({
      ...record,
      variants: uniqueSorted([...record.variants]),
      aliases: uniqueSorted([...record.aliases]),
      winRate: safeRatio(record.wins, record.appearances) ?? 0,
    }))
    .sort((a, b) => {
      const appearancesDifference = b.appearances - a.appearances;
      if (appearancesDifference !== 0) return appearancesDifference;
      const rateDifference = b.winRate - a.winRate;
      if (rateDifference !== 0) return rateDifference;
      return a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" });
    });

  const deckGames = rows.reduce((total, row) => total + row.appearances, 0);
  const wins = rows.reduce((total, row) => total + row.wins, 0);
  const mostPlayed = rows[0] ?? null;
  const bestWinRate = [...rows].sort((a, b) => {
    const rateDifference = b.winRate - a.winRate;
    if (rateDifference !== 0) return rateDifference;
    const winsDifference = b.wins - a.wins;
    if (winsDifference !== 0) return winsDifference;
    return b.appearances - a.appearances;
  })[0] ?? null;

  return {
    player,
    totalGames: playerGames.length,
    deckGames,
    wins,
    winRate: safeRatio(wins, deckGames),
    deckCount: rows.length,
    mostPlayed,
    bestWinRate,
    rows,
  };
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
  return deckLabelForParticipant(participant);
}

function deckOptionLabel(deckKey, catalogRows) {
  const catalogRow = catalogRows?.find((row) => row.deck_id === deckKey);
  if (catalogRow) return deckLabelForCatalog(catalogRow);
  const { player, deckName } = splitDeckKey(deckKey);
  return deckName ? `${deckName} / ${player}` : deckKey;
}

function ensureMatchupRecord(records, subjectParticipant, opponentParticipant, catalogRows) {
  const opponentKey = deckIdForParticipant(opponentParticipant);

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
        deckIdForParticipant(participant) === subjectKey,
    );

    if (!subjectParticipant) continue;
    subjectAppearances += 1;

    const opponents = game.participants.filter((participant) => {
      if (participant === subjectParticipant || !isKnown(participant.deck_name_normalized)) return false;
      const opponentKey = deckIdForParticipant(participant);
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

function compareGamesByDateAsc(a, b) {
  const dateComparison = String(a.date ?? "").localeCompare(String(b.date ?? ""));
  if (dateComparison !== 0) return dateComparison;
  return String(a.game_id ?? "").localeCompare(String(b.game_id ?? ""));
}

function compareGamesByDateDesc(a, b) {
  return -compareGamesByDateAsc(a, b);
}

function participantForPlayer(game, player) {
  return game.participants.find((participant) => participant.player === player) ?? null;
}

function participantForDeck(game, deckKey) {
  return (
    game.participants.find(
      (participant) => isKnown(participant.deck_name_normalized) && deckIdForParticipant(participant) === deckKey,
    ) ?? null
  );
}

function resultForPlayer(game, player) {
  if (game.result_type === "draw") return "draw";
  if (game.result_type === "win" && game.winner_player === player) return "win";
  if (game.result_type === "win" && isKnown(game.winner_player)) return "not_win";
  return "unknown";
}

function gameOutcomeCounts(games, player) {
  const counts = { wins: 0, draws: 0, notWins: 0, unknown: 0 };
  for (const game of games) {
    const result = resultForPlayer(game, player);
    if (result === "win") counts.wins += 1;
    else if (result === "draw") counts.draws += 1;
    else if (result === "not_win") counts.notWins += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function buildStreaks(games, player) {
  let currentType = "";
  let currentCount = 0;
  let longestWin = 0;
  let longestNotWin = 0;

  for (const game of [...games].sort(compareGamesByDateAsc)) {
    const result = resultForPlayer(game, player);
    const streakType = result === "win" ? "win" : result === "not_win" ? "not_win" : result;
    if (streakType === currentType) {
      currentCount += 1;
    } else {
      currentType = streakType;
      currentCount = 1;
    }

    if (streakType === "win") longestWin = Math.max(longestWin, currentCount);
    if (streakType === "not_win") longestNotWin = Math.max(longestNotWin, currentCount);
  }

  return {
    currentType,
    currentCount: games.length > 0 ? currentCount : 0,
    longestWin,
    longestNotWin,
  };
}

function ensureNamedCountRecord(map, key, defaults = {}) {
  if (!map.has(key)) {
    map.set(key, { key, count: 0, ...defaults });
  }
  return map.get(key);
}

function mapEntriesByCount(map) {
  return [...map.values()].sort((a, b) => {
    const countDifference = (b.count ?? 0) - (a.count ?? 0);
    if (countDifference !== 0) return countDifference;
    return String(a.label ?? a.key ?? "").localeCompare(String(b.label ?? b.key ?? ""), "es", { sensitivity: "base" });
  });
}

function eventBelongsToPlayer(game, event, player, eventType) {
  if (event.event_type !== eventType || event.actor !== player) return false;
  return Boolean(participantForPlayer(game, player));
}

function countSpecialEventsForPlayer(games, player, eventType, legacyField, legacyPlayerField) {
  let count = 0;
  for (const game of games) {
    const explicitEvents = game.events.filter((event) => eventBelongsToPlayer(game, event, player, eventType));
    if (explicitEvents.length > 0) {
      count += explicitEvents.length;
    } else if (game[legacyField] === true && game[legacyPlayerField] === player) {
      count += 1;
    }
  }
  return count;
}

function buildRecentRows(games, getSubjectParticipant, subjectPlayer = "") {
  return [...games]
    .sort(compareGamesByDateDesc)
    .slice(0, 10)
    .map((game) => {
      const participant = getSubjectParticipant(game);
      const player = subjectPlayer || participant?.player || "";
      return {
        gameId: game.game_id,
        date: game.date,
        location: game.location,
        deckLabel: participant ? deckLabelForParticipant(participant) : "",
        result: isKnown(player) ? resultForPlayer(game, player) : "unknown",
        winner: game.winner_player,
        winCondition: game.win_condition_category,
      };
    });
}

function buildRecentTrend(games, player) {
  let wins = 0;
  return [...games]
    .sort(compareGamesByDateDesc)
    .slice(0, 12)
    .reverse()
    .map((game, index) => {
      if (resultForPlayer(game, player) === "win") wins += 1;
      return {
        label: `${game.date} ${game.game_id}`,
        wins,
        games: index + 1,
        winRate: safeRatio(wins, index + 1) ?? 0,
        result: resultForPlayer(game, player),
      };
    });
}

function playerDeckLabel(participant) {
  return participant ? deckLabelForParticipant(participant) : "";
}

export function calculatePlayerProfile(games, player) {
  if (!isKnown(player)) {
    return {
      player: "",
      games: [],
      totalGames: 0,
      wins: 0,
      draws: 0,
      notWins: 0,
      winRate: null,
      averageDuration: null,
      durationSample: 0,
      deckRows: [],
      rivalRows: [],
      killedRows: [],
      killedByRows: [],
      nukeCount: 0,
      solRingCount: 0,
      streaks: buildStreaks([], player),
      recentRows: [],
      recentTrend: [],
    };
  }

  const playerGames = games.filter((game) => participantForPlayer(game, player));
  const outcomes = gameOutcomeCounts(playerGames, player);
  const durations = [];
  const deckMap = new Map();
  const rivals = new Map();
  const killed = new Map();
  const killedBy = new Map();

  for (const game of playerGames) {
    if (isKnown(game.duration_minutes)) durations.push(Number(game.duration_minutes));

    const participant = participantForPlayer(game, player);
    if (participant && isKnown(participant.deck_name_normalized)) {
      const deckKey = deckIdForParticipant(participant);
      const deckRecord = ensureNamedCountRecord(deckMap, deckKey, {
        deckKey,
        label: deckLabelForParticipant(participant),
        wins: 0,
        draws: 0,
        firstDate: game.date,
        lastDate: game.date,
      });
      deckRecord.count += 1;
      deckRecord.firstDate = deckRecord.firstDate < game.date ? deckRecord.firstDate : game.date;
      deckRecord.lastDate = deckRecord.lastDate > game.date ? deckRecord.lastDate : game.date;
      if (game.result_type === "draw") deckRecord.draws += 1;
      if (game.result_type === "win" && game.winner_player === player) deckRecord.wins += 1;
    }

    for (const opponent of game.participants) {
      if (opponent.player === player) continue;
      const record = ensureNamedCountRecord(rivals, opponent.player, {
        player: opponent.player,
        label: opponent.player,
        playerWins: 0,
        opponentWins: 0,
        otherWins: 0,
        draws: 0,
      });
      record.count += 1;
      if (game.result_type === "draw") record.draws += 1;
      else if (game.winner_player === player) record.playerWins += 1;
      else if (game.winner_player === opponent.player) record.opponentWins += 1;
      else record.otherWins += 1;
    }

    for (const event of game.events) {
      if (event.event_type === "elimination" && event.actor === player && isKnown(event.target)) {
        const record = ensureNamedCountRecord(killed, event.target, { player: event.target, label: event.target, methods: new Map() });
        record.count += 1;
        incrementMap(record.methods, event.method || "unspecified");
      }
      if (event.event_type === "elimination" && event.target === player && isKnown(event.actor)) {
        const record = ensureNamedCountRecord(killedBy, event.actor, { player: event.actor, label: event.actor, methods: new Map() });
        record.count += 1;
        incrementMap(record.methods, event.method || "unspecified");
      }
    }
  }

  const deckRows = [...deckMap.values()]
    .map((record) => ({
      ...record,
      appearances: record.count,
      winRate: safeRatio(record.wins, record.count) ?? 0,
    }))
    .sort((a, b) => b.appearances - a.appearances || b.winRate - a.winRate || a.label.localeCompare(b.label, "es"));

  const rivalRows = [...rivals.values()]
    .map((record) => ({
      ...record,
      meetings: record.count,
      playerWinRate: safeRatio(record.playerWins, record.count) ?? 0,
      opponentWinRate: safeRatio(record.opponentWins, record.count) ?? 0,
    }))
    .sort((a, b) => b.meetings - a.meetings || b.opponentWins - a.opponentWins || a.player.localeCompare(b.player, "es"));

  const normalizeKillRows = (map) =>
    mapEntriesByCount(map).map((record) => ({
      ...record,
      methods: [...record.methods.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([method, count]) => `${method} (${count})`),
    }));

  return {
    player,
    games: playerGames,
    totalGames: playerGames.length,
    wins: outcomes.wins,
    draws: outcomes.draws,
    notWins: outcomes.notWins,
    winRate: safeRatio(outcomes.wins, playerGames.length),
    averageDuration: mean(durations),
    durationSample: durations.length,
    deckRows,
    rivalRows,
    killedRows: normalizeKillRows(killed),
    killedByRows: normalizeKillRows(killedBy),
    nukeCount: countSpecialEventsForPlayer(playerGames, player, "nuke", "nuke_recorded", "nuke_player"),
    solRingCount: countSpecialEventsForPlayer(playerGames, player, "sol_ring_turn_1", "sol_ring_t1_recorded", "sol_ring_t1_player"),
    streaks: buildStreaks(playerGames, player),
    recentRows: buildRecentRows(playerGames, (game) => participantForPlayer(game, player), player),
    recentTrend: buildRecentTrend(playerGames, player),
  };
}

function deckIdentityFromGames(games, deckKey, catalogRows = []) {
  const catalogRow = catalogRows.find((row) => row.deck_id === deckKey) ?? null;
  const participant = games
    .flatMap((game) => game.participants)
    .find((candidate) => isKnown(candidate.deck_name_normalized) && deckIdForParticipant(candidate) === deckKey);

  return {
    deckKey,
    label: catalogRow ? deckLabelForCatalog(catalogRow) : participant ? deckLabelForParticipant(participant) : deckOptionLabel(deckKey, catalogRows),
    displayName: catalogRow ? deckLabelForCatalog(catalogRow) : participant ? deckLabelForParticipant(participant) : "",
    ownerPlayer: catalogRow?.owner_player || participant?.deck_owner || "",
    commanderName: catalogRow?.commander_name || participant?.commander_name || "",
    officialName: catalogRow?.official_name || participant?.deck_catalog?.official_name || "",
    moxfieldUrl: catalogRow?.moxfield_url || participant?.deck_catalog?.moxfield_url || participant?.moxfield_url || "",
    archidektUrl: catalogRow?.archidekt_url || participant?.deck_catalog?.archidekt_url || "",
    edhrecUrl: catalogRow?.edhrec_url || participant?.deck_catalog?.edhrec_url || "",
    archetype: catalogRow?.archetype || participant?.deck_catalog?.archetype || "",
    powerLevel: catalogRow?.power_level || participant?.deck_catalog?.power_level || "",
    tags: catalogRow?.tags_list || participant?.deck_catalog?.tags_list || [],
    colors: catalogRow?.colors_list || participant?.deck_catalog?.colors_list || [],
  };
}

export function calculateDeckProfile(games, deckKey, catalogRows = []) {
  if (!isKnown(deckKey)) {
    return {
      deckKey: "",
      identity: deckIdentityFromGames([], "", catalogRows),
      totalGames: 0,
      wins: 0,
      draws: 0,
      winRate: null,
      byLocation: emptyLocationCounts(),
      locationRows: [],
      pilotRows: [],
      opponentRows: [],
      winConditionRows: [],
      killRows: [],
      deathRows: [],
      recentRows: [],
    };
  }

  const identity = deckIdentityFromGames(games, deckKey, catalogRows);
  const deckAppearances = [];
  const byLocation = emptyLocationCounts();
  const locationWins = emptyLocationCounts();
  const pilots = new Map();
  const opponents = new Map();
  const winConditions = new Map();
  const kills = new Map();
  const deaths = new Map();
  let wins = 0;
  let draws = 0;

  for (const game of games) {
    const subject = participantForDeck(game, deckKey);
    if (!subject) continue;
    deckAppearances.push({ game, participant: subject });
    if (byLocation[game.location] !== undefined) byLocation[game.location] += 1;

    const pilotRecord = ensureNamedCountRecord(pilots, subject.player, {
      player: subject.player,
      label: subject.player,
      wins: 0,
      draws: 0,
    });
    pilotRecord.count += 1;

    if (game.result_type === "draw") {
      draws += 1;
      pilotRecord.draws += 1;
    } else if (game.result_type === "win" && game.winner_player === subject.player) {
      wins += 1;
      pilotRecord.wins += 1;
      if (locationWins[game.location] !== undefined) locationWins[game.location] += 1;
      if (isKnown(game.win_condition_category)) {
        const conditionRecord = ensureNamedCountRecord(winConditions, game.win_condition_category, {
          category: game.win_condition_category,
          label: game.win_condition_category,
        });
        conditionRecord.count += 1;
      }
    }

    for (const opponent of game.participants) {
      if (opponent === subject || !isKnown(opponent.deck_name_normalized)) continue;
      const opponentKey = deckIdForParticipant(opponent);
      const record = ensureNamedCountRecord(opponents, opponentKey, {
        opponentKey,
        label: playerDeckLabel(opponent),
        deckWins: 0,
        opponentWins: 0,
        otherWins: 0,
        draws: 0,
      });
      record.count += 1;
      if (game.result_type === "draw") record.draws += 1;
      else if (game.winner_player === subject.player) record.deckWins += 1;
      else if (game.winner_player === opponent.player) record.opponentWins += 1;
      else record.otherWins += 1;
    }

    for (const event of game.events) {
      if (event.event_type !== "elimination") continue;
      const actorParticipant = isKnown(event.actor) ? participantForPlayer(game, event.actor) : null;
      const targetParticipant = isKnown(event.target) ? participantForPlayer(game, event.target) : null;
      if (actorParticipant && deckIdForParticipant(actorParticipant) === deckKey && isKnown(event.target)) {
        const record = ensureNamedCountRecord(kills, event.target, { label: event.target, methods: new Map() });
        record.count += 1;
        incrementMap(record.methods, event.method || "unspecified");
      }
      if (targetParticipant && deckIdForParticipant(targetParticipant) === deckKey && isKnown(event.actor)) {
        const record = ensureNamedCountRecord(deaths, event.actor, { label: event.actor, methods: new Map() });
        record.count += 1;
        incrementMap(record.methods, event.method || "unspecified");
      }
    }
  }

  const locationRows = Object.entries(byLocation).map(([location, appearances]) => ({
    location,
    appearances,
    wins: locationWins[location] ?? 0,
    winRate: safeRatio(locationWins[location] ?? 0, appearances),
  }));

  const pilotRows = [...pilots.values()]
    .map((record) => ({
      ...record,
      appearances: record.count,
      winRate: safeRatio(record.wins, record.count) ?? 0,
    }))
    .sort((a, b) => b.appearances - a.appearances || b.wins - a.wins || a.player.localeCompare(b.player, "es"));

  const opponentRows = [...opponents.values()]
    .map((record) => ({
      ...record,
      appearances: record.count,
      deckWinRate: safeRatio(record.deckWins, record.count) ?? 0,
      opponentWinRate: safeRatio(record.opponentWins, record.count) ?? 0,
    }))
    .sort((a, b) => b.appearances - a.appearances || b.deckWinRate - a.deckWinRate || a.label.localeCompare(b.label, "es"));

  const normalizeEventRows = (map) =>
    mapEntriesByCount(map).map((record) => ({
      ...record,
      methods: [...record.methods.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([method, count]) => `${method} (${count})`),
    }));

  return {
    deckKey,
    identity,
    totalGames: deckAppearances.length,
    wins,
    draws,
    winRate: safeRatio(wins, deckAppearances.length),
    byLocation,
    locationRows,
    pilotRows,
    opponentRows,
    winConditionRows: mapEntriesByCount(winConditions),
    killRows: normalizeEventRows(kills),
    deathRows: normalizeEventRows(deaths),
    recentRows: buildRecentRows(
      deckAppearances.map((row) => row.game),
      (game) => participantForDeck(game, deckKey),
    ),
  };
}

export function calculatePlayerHeadToHead(games, playerA, playerB) {
  if (!isKnown(playerA) || !isKnown(playerB) || playerA === playerB) {
    return {
      playerA,
      playerB,
      totalGames: 0,
      aWins: 0,
      bWins: 0,
      otherWins: 0,
      draws: 0,
      aWinRate: null,
      bWinRate: null,
      aEliminatedB: 0,
      bEliminatedA: 0,
      deckPairRows: [],
      rows: [],
    };
  }

  const togetherGames = games.filter((game) => participantForPlayer(game, playerA) && participantForPlayer(game, playerB));
  let aWins = 0;
  let bWins = 0;
  let otherWins = 0;
  let draws = 0;
  let aEliminatedB = 0;
  let bEliminatedA = 0;
  const deckPairs = new Map();

  for (const game of togetherGames) {
    const participantA = participantForPlayer(game, playerA);
    const participantB = participantForPlayer(game, playerB);
    const pairKey = `${playerDeckLabel(participantA)}||${playerDeckLabel(participantB)}`;
    const pair = ensureNamedCountRecord(deckPairs, pairKey, {
      deckA: playerDeckLabel(participantA),
      deckB: playerDeckLabel(participantB),
      aWins: 0,
      bWins: 0,
      otherWins: 0,
      draws: 0,
    });
    pair.count += 1;

    if (game.result_type === "draw") {
      draws += 1;
      pair.draws += 1;
    } else if (game.winner_player === playerA) {
      aWins += 1;
      pair.aWins += 1;
    } else if (game.winner_player === playerB) {
      bWins += 1;
      pair.bWins += 1;
    } else {
      otherWins += 1;
      pair.otherWins += 1;
    }

    for (const event of game.events) {
      if (event.event_type !== "elimination") continue;
      if (event.actor === playerA && event.target === playerB) aEliminatedB += 1;
      if (event.actor === playerB && event.target === playerA) bEliminatedA += 1;
    }
  }

  return {
    playerA,
    playerB,
    totalGames: togetherGames.length,
    aWins,
    bWins,
    otherWins,
    draws,
    aWinRate: safeRatio(aWins, togetherGames.length),
    bWinRate: safeRatio(bWins, togetherGames.length),
    aEliminatedB,
    bEliminatedA,
    deckPairRows: mapEntriesByCount(deckPairs).map((record) => ({
      ...record,
      appearances: record.count,
      aWinRate: safeRatio(record.aWins, record.count) ?? 0,
      bWinRate: safeRatio(record.bWins, record.count) ?? 0,
    })),
    rows: [...togetherGames].sort(compareGamesByDateDesc).map((game) => {
      const participantA = participantForPlayer(game, playerA);
      const participantB = participantForPlayer(game, playerB);
      return {
        gameId: game.game_id,
        date: game.date,
        location: game.location,
        deckA: playerDeckLabel(participantA),
        deckB: playerDeckLabel(participantB),
        winner: game.winner_player,
        resultType: game.result_type,
        winCondition: game.win_condition_category,
      };
    }),
  };
}

export function calculateDeckMatchupMatrix(games, options = {}) {
  const { minAppearances = 2, minGames = 1, topN = 12, catalogRows = [] } = options;
  const deckMap = new Map();

  for (const game of games) {
    const seenInGame = new Set();
    for (const participant of game.participants) {
      if (!isKnown(participant.deck_name_normalized)) continue;
      const deckKey = deckIdForParticipant(participant);
      if (seenInGame.has(deckKey)) continue;
      seenInGame.add(deckKey);
      const record = ensureNamedCountRecord(deckMap, deckKey, {
        deckKey,
        label: deckLabelForParticipant(participant) || deckOptionLabel(deckKey, catalogRows),
        wins: 0,
      });
      record.count += 1;
      if (game.result_type === "win" && game.winner_player === participant.player) record.wins += 1;
    }
  }

  const decks = [...deckMap.values()]
    .map((record) => ({
      deckKey: record.deckKey,
      label: record.label,
      appearances: record.count,
      wins: record.wins,
      winRate: safeRatio(record.wins, record.count) ?? 0,
    }))
    .filter((record) => record.appearances >= minAppearances)
    .sort((a, b) => b.appearances - a.appearances || b.wins - a.wins || a.label.localeCompare(b.label, "es"))
    .slice(0, topN);

  const selectedKeys = new Set(decks.map((deck) => deck.deckKey));
  const pairRecords = new Map();

  function ensurePair(subject, opponent) {
    const key = `${subject.deckKey}||${opponent.deckKey}`;
    if (!pairRecords.has(key)) {
      pairRecords.set(key, {
        subjectKey: subject.deckKey,
        opponentKey: opponent.deckKey,
        appearances: 0,
        subjectWins: 0,
        opponentWins: 0,
        otherWins: 0,
        draws: 0,
      });
    }
    return pairRecords.get(key);
  }

  for (const game of games) {
    const selectedParticipants = game.participants
      .filter((participant) => {
        if (!isKnown(participant.deck_name_normalized)) return false;
        return selectedKeys.has(deckIdForParticipant(participant));
      })
      .map((participant) => ({
        participant,
        deckKey: deckIdForParticipant(participant),
        label: deckLabelForParticipant(participant),
      }));

    for (let subjectIndex = 0; subjectIndex < selectedParticipants.length; subjectIndex += 1) {
      for (let opponentIndex = 0; opponentIndex < selectedParticipants.length; opponentIndex += 1) {
        if (subjectIndex === opponentIndex) continue;
        const subject = selectedParticipants[subjectIndex];
        const opponent = selectedParticipants[opponentIndex];
        if (subject.deckKey === opponent.deckKey) continue;
        const record = ensurePair(subject, opponent);
        record.appearances += 1;
        if (game.result_type === "draw") record.draws += 1;
        else if (game.winner_player === subject.participant.player) record.subjectWins += 1;
        else if (game.winner_player === opponent.participant.player) record.opponentWins += 1;
        else record.otherWins += 1;
      }
    }
  }

  return {
    decks,
    minAppearances,
    minGames,
    topN,
    rows: decks.map((deck) => ({
      ...deck,
      cells: decks.map((opponent) => {
        if (deck.deckKey === opponent.deckKey) return null;
        const record = pairRecords.get(`${deck.deckKey}||${opponent.deckKey}`) ?? {
          appearances: 0,
          subjectWins: 0,
          opponentWins: 0,
          otherWins: 0,
          draws: 0,
        };
        return {
          ...record,
          subjectWinRate: safeRatio(record.subjectWins, record.appearances),
          visible: record.appearances >= minGames,
        };
      }),
    })),
  };
}

function topRecord(rows, scoreGetter, minimumGetter = () => true) {
  return [...rows].filter(minimumGetter).sort((a, b) => {
    const scoreDifference = scoreGetter(b) - scoreGetter(a);
    if (scoreDifference !== 0) return scoreDifference;
    return String(a.player ?? a.displayName ?? a.label ?? "").localeCompare(
      String(b.player ?? b.displayName ?? b.label ?? ""),
      "es",
      { sensitivity: "base" },
    );
  })[0] ?? null;
}

function countSpecialEvents(games, eventType, legacyField, legacyPlayerField) {
  const counts = new Map();
  for (const game of games) {
    const explicitEvents = game.events.filter((event) => event.event_type === eventType && isKnown(event.actor));
    if (explicitEvents.length > 0) {
      for (const event of explicitEvents) incrementMap(counts, event.actor);
    } else if (game[legacyField] === true && isKnown(game[legacyPlayerField])) {
      incrementMap(counts, game[legacyPlayerField]);
    }
  }
  return [...counts.entries()]
    .map(([player, count]) => ({ player, count }))
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player, "es"));
}

export function calculateBadges(games, stats) {
  const badges = [];
  const addBadge = (title, winner, value, sample, note = "") => {
    badges.push({
      title,
      winner: winner || "",
      value: value || "",
      sample: sample || "",
      note,
    });
  };

  const mostWins = topRecord(stats.playerStats, (row) => row.wins);
  if (mostWins) addBadge("Mas victorias", mostWins.player, `${mostWins.wins} victorias`, `n=${mostWins.participations}`);

  const bestWinRate = topRecord(
    stats.playerStats,
    (row) => row.winRate,
    (row) => row.participations >= Math.min(3, Math.max(1, stats.totalGames)),
  );
  if (bestWinRate) {
    addBadge("Mejor tasa jugador", bestWinRate.player, `${(bestWinRate.winRate * 100).toFixed(1)}%`, `n=${bestWinRate.participations}`);
  }

  const mostDecks = topRecord(stats.playerStats, (row) => row.decksUsed);
  if (mostDecks) addBadge("Mayor variedad", mostDecks.player, `${mostDecks.decksUsed} decks`, `n=${mostDecks.participations}`);

  const mostPlayedDeck = topRecord(stats.deckStats, (row) => row.appearances);
  if (mostPlayedDeck) {
    addBadge("Deck mas jugado", `${mostPlayedDeck.displayName} / ${mostPlayedDeck.ownerPlayer}`, `${mostPlayedDeck.appearances} partidas`, "");
  }

  const bestDeck = topRecord(
    stats.deckStats,
    (row) => row.winRate,
    (row) => row.appearances >= Math.min(2, Math.max(1, stats.totalGames)),
  );
  if (bestDeck) {
    addBadge("Mejor tasa deck", `${bestDeck.displayName} / ${bestDeck.ownerPlayer}`, `${(bestDeck.winRate * 100).toFixed(1)}%`, `n=${bestDeck.appearances}`);
  }

  const topKiller = stats.combat.byActor[0];
  if (topKiller) addBadge("Mas eliminaciones", topKiller.actor, `${topKiller.count} eliminaciones`, "Solo eventos registrados");

  const topTarget = stats.combat.byTarget[0];
  if (topTarget) addBadge("Mas veces eliminado", topTarget.target, `${topTarget.count} veces`, "Solo eventos registrados");

  const topNuke = countSpecialEvents(games, "nuke", "nuke_recorded", "nuke_player")[0];
  if (topNuke) addBadge("Mas nukes", topNuke.player, `${topNuke.count} nukes`, "Solo registros explicitos");

  const topSolRing = countSpecialEvents(games, "sol_ring_turn_1", "sol_ring_t1_recorded", "sol_ring_t1_player")[0];
  if (topSolRing) addBadge("Sol Ring T1", topSolRing.player, `${topSolRing.count} veces`, "Solo registros explicitos");

  const longestGame = [...games]
    .filter((game) => isKnown(game.duration_minutes))
    .sort((a, b) => Number(b.duration_minutes) - Number(a.duration_minutes))[0];
  if (longestGame) {
    addBadge("Partida mas larga", longestGame.game_id, `${longestGame.duration_minutes} min`, longestGame.date);
  }

  const streakRows = stats.uniquePlayers
    .map((player) => ({
      player,
      streaks: buildStreaks(
        games.filter((game) => participantForPlayer(game, player)),
        player,
      ),
    }))
    .sort((a, b) => b.streaks.longestWin - a.streaks.longestWin || a.player.localeCompare(b.player, "es"));
  const topStreak = streakRows[0];
  if (topStreak && topStreak.streaks.longestWin > 0) {
    addBadge("Mejor racha", topStreak.player, `${topStreak.streaks.longestWin} victorias seguidas`, "En el subconjunto filtrado");
  }

  return badges;
}