import {
  createElement,
  deckLabelForParticipant,
  deckNameForParticipant,
  deckOwnerForParticipant,
  displayValue,
  formatAverage,
  formatConfidence,
  formatDuration,
  formatLocation,
  formatNumber,
  formatPercent,
  formatResult,
  formatWinCondition,
  isKnown,
  removeChildren,
  safeRatio,
  UNKNOWN_LABEL,
} from "./utils.js";

let gameSort = { key: "date", direction: "desc" };

function appendChildren(parent, children) {
  for (const child of children) parent.append(child);
  return parent;
}

function renderEmpty(container, message) {
  removeChildren(container);
  container.append(createElement("p", { className: "empty-state", text: message }));
}

function makeKpi(label, value, hint = "") {
  return appendChildren(createElement("article", { className: "kpi" }), [
    createElement("p", { className: "kpi__label", text: label }),
    createElement("p", { className: "kpi__value", text: value }),
    createElement("p", { className: "kpi__hint", text: hint }),
  ]);
}

function makeCoverage(label, known, total, hint) {
  const rate = safeRatio(known, total);
  const width = Number.isFinite(rate) ? `${Math.max(0, Math.min(100, rate * 100)).toFixed(1)}%` : "0%";

  return appendChildren(createElement("article", { className: "coverage-item" }), [
    createElement("p", { className: "coverage-item__label", text: label }),
    createElement("div", { className: "coverage-meter", role: "img", ariaLabel: `${known} de ${total}` }, [
      createElement("span", { style: `width: ${width}` }),
    ]),
    createElement("p", { className: "coverage-item__hint", text: hint }),
  ]);
}

export function renderSummary(stats) {
  const container = document.getElementById("kpiGrid");
  removeChildren(container);

  const durationText = stats.duration.sample > 0
    ? `${stats.duration.average.toFixed(1)} min`
    : UNKNOWN_LABEL;
  const starterRate = stats.starterCoverage.rate === null ? UNKNOWN_LABEL : formatPercent(stats.starterCoverage.rate);

  const items = [
    makeKpi("Total de partidas", formatNumber(stats.totalGames), "Subconjunto filtrado"),
    makeKpi("Presenciales", formatNumber(stats.locations.in_person), "location = in_person"),
    makeKpi("Virtuales", formatNumber(stats.locations.virtual), "location = virtual"),
    makeKpi("Jugadores", formatNumber(stats.uniquePlayers.length), "Participantes únicos"),
    makeKpi("Empates", formatNumber(stats.draws), "No suman victoria"),
    makeKpi("Duración promedio", durationText, `Solo partidas con duración (n=${stats.duration.sample})`),
    makeKpi("Jugador inicial", starterRate, `Cobertura ${stats.starterCoverage.known}/${stats.starterCoverage.total}`),
    makeKpi("Revisión prioritaria", formatNumber(stats.reviewGames.length), "needs_review = true"),
  ];

  container.append(...items);
}

export function renderCoverage(stats) {
  const container = document.getElementById("coverageGrid");
  removeChildren(container);

  const sparseKnown = stats.quality.nukeKnown + stats.quality.solRingKnown;
  const sparseTotal = stats.totalGames * 2;

  container.append(
    makeCoverage(
      "Cobertura de duración",
      stats.duration.sample,
      stats.totalGames,
      `${stats.duration.sample}/${stats.totalGames} partidas con minutos registrados`,
    ),
    makeCoverage(
      "Cobertura de jugador inicial",
      stats.starterCoverage.known,
      stats.totalGames,
      `${stats.starterCoverage.known}/${stats.totalGames} partidas con jugador inicial`,
    ),
    makeCoverage(
      "Cobertura de condición",
      stats.winConditionCoverage.known,
      stats.totalGames,
      `${stats.winConditionCoverage.known}/${stats.totalGames} partidas con condición de victoria`,
    ),
    makeCoverage(
      "Cobertura de eventos especiales",
      sparseKnown,
      sparseTotal,
      `${sparseKnown}/${sparseTotal} campos nuke/Sol Ring con dato explícito`,
    ),
  );
}

function createTable(headers, rows) {
  const table = createElement("table");
  const thead = createElement("thead");
  const tbody = createElement("tbody");
  const headerRow = createElement("tr");

  for (const header of headers) {
    headerRow.append(createElement("th", { scope: "col" }, header));
  }

  thead.append(headerRow);
  tbody.append(...rows);
  table.append(thead, tbody);
  return table;
}

function tag(text, type = "") {
  const className = type ? `tag tag--${type}` : "tag";
  return createElement("span", { className, text });
}

function tagList(values, emptyText = UNKNOWN_LABEL) {
  const list = createElement("div", { className: "tag-list" });
  const cleanValues = values.filter(isKnown);
  if (cleanValues.length === 0) {
    list.append(tag(emptyText));
    return list;
  }

  for (const value of cleanValues) list.append(tag(value));
  return list;
}

function deckLinks(deck) {
  const links = [
    ["Moxfield", deck.moxfieldUrl],
    ["Archidekt", deck.archidektUrl],
    ["EDHREC", deck.edhrecUrl],
  ].filter(([, url]) => isKnown(url));

  if (links.length === 0) return tagList([], "Sin links");

  const list = createElement("div", { className: "tag-list" });
  for (const [label, url] of links) {
    list.append(
      createElement("a", {
        className: "tag tag--link",
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        text: label,
      }),
    );
  }
  return list;
}

export function renderPlayerTable(playerStats) {
  const container = document.getElementById("playersTable");
  if (playerStats.length === 0) {
    renderEmpty(container, "No hay jugadores en el subconjunto filtrado.");
    return;
  }

  removeChildren(container);
  const rows = playerStats.map((player) => {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: player.player }),
      createElement("td", { text: String(player.participations) }),
      createElement("td", { text: String(player.wins) }),
      createElement("td", { text: `${formatPercent(player.winRate)} (n=${player.participations})` }),
      createElement("td", { text: `${player.inPersonWins} presencial / ${player.virtualWins} virtual` }),
      createElement("td", { text: String(player.decksUsed) }),
      createElement("td", { text: displayValue(player.mostPlayedDeck) }),
      createElement("td", { text: displayValue(player.deckWithMostWins) }),
      createElement("td", { text: formatAverage(player.averageDuration, player.durationSample, "min") }),
    );
    return row;
  });

  container.append(
    createTable(
      [
        "Jugador",
        "Partidas",
        "Victorias",
        "Tasa",
        "Victorias por ubicación",
        "Decks",
        "Deck más jugado",
        "Deck con más victorias",
        "Duración promedio",
      ],
      rows,
    ),
  );
}


function playerDeckDisplayName(deck) {
  return deck?.officialName || deck?.displayName || UNKNOWN_LABEL;
}

function playerDeckSummaryText(deck) {
  if (!deck) return UNKNOWN_LABEL;
  return `${playerDeckDisplayName(deck)} (${formatPercent(deck.winRate)}, n=${deck.appearances})`;
}

export function renderPlayerDeckBreakdown(playerDeckStats) {
  const summaryContainer = document.getElementById("playerDeckSummary");
  const tableContainer = document.getElementById("playerDeckTable");
  removeChildren(summaryContainer);

  if (!playerDeckStats.player) {
    renderEmpty(tableContainer, "Selecciona un jugador para ver sus decks.");
    return;
  }

  summaryContainer.append(
    makeKpi(
      "Partidas del jugador",
      formatNumber(playerDeckStats.totalGames),
      `${playerDeckStats.deckGames}/${playerDeckStats.totalGames} con deck registrado`,
    ),
    makeKpi("Decks usados", formatNumber(playerDeckStats.deckCount), "Identidades canonicas distintas"),
    makeKpi(
      "Winrate",
      playerDeckStats.winRate === null ? UNKNOWN_LABEL : formatPercent(playerDeckStats.winRate),
      `Victorias con deck registrado: ${playerDeckStats.wins}/${playerDeckStats.deckGames}`,
    ),
    makeKpi("Mas jugado", playerDeckSummaryText(playerDeckStats.mostPlayed), "Ordenado por apariciones"),
    makeKpi("Mejor tasa", playerDeckSummaryText(playerDeckStats.bestWinRate), "Desempata por victorias y muestra"),
  );

  if (playerDeckStats.rows.length === 0) {
    renderEmpty(tableContainer, `${playerDeckStats.player} no tiene decks registrados en el subconjunto filtrado.`);
    return;
  }

  removeChildren(tableContainer);
  const rows = playerDeckStats.rows.map((deck) => {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: playerDeckDisplayName(deck) }),
      createElement("td", { text: displayValue(deck.ownerPlayer) }),
      createElement("td", { text: isKnown(deck.commanderName) ? deck.commanderName : "Comandante pendiente" }),
      createElement("td", { text: String(deck.appearances) }),
      createElement("td", { text: String(deck.wins) }),
      createElement("td", { text: `${formatPercent(deck.winRate)} (n=${deck.appearances})` }),
      createElement("td", { text: `${deck.inPerson} presencial / ${deck.virtual} virtual` }),
      createElement("td", { text: String(deck.draws) }),
      createElement("td", { text: `${deck.firstDate} a ${deck.lastDate}` }),
      createElement("td", {}, deckLinks(deck)),
      createElement("td", {}, tagList(deck.variants, "Sin variantes")),
      createElement("td", {}, tagList(deck.aliases, "Sin aliases")),
    );
    return row;
  });

  tableContainer.append(
    createTable(
      [
        "Deck",
        "Dueno",
        "Comandante",
        "Partidas",
        "Victorias",
        "Tasa",
        "Ubicacion",
        "Empates",
        "Fechas",
        "Links",
        "Variantes",
        "Aliases",
      ],
      rows,
    ),
  );
}

function deckMetadataList(deck) {
  return [...(deck?.colors ?? []), ...(deck?.tags ?? [])].filter(isKnown);
}

function deckMetadataSummary(deck) {
  const parts = [deck?.archetype, deck?.powerLevel ? `Power ${deck.powerLevel}` : ""].filter(isKnown);
  return parts.length > 0 ? parts.join(" / ") : UNKNOWN_LABEL;
}

export function renderDeckTable(deckStats, minAppearances = 1) {
  const container = document.getElementById("decksTable");
  const visibleDeckStats = deckStats.filter((deck) => deck.appearances >= minAppearances);

  if (visibleDeckStats.length === 0) {
    renderEmpty(container, `No hay decks con al menos ${minAppearances} apariciones en el subconjunto filtrado.`);
    return;
  }

  removeChildren(container);
  const rows = visibleDeckStats.map((deck) => {
    const commander = isKnown(deck.commanderName) ? deck.commanderName : "Comandante pendiente";
    const displayName = deck.officialName || deck.displayName;
    const row = createElement("tr");
    row.append(
      createElement("td", { text: displayName }),
      createElement("td", { text: deck.ownerPlayer }),
      createElement("td", { text: commander }),
      createElement("td", { text: displayValue(deck.archetype) }),
      createElement("td", { text: displayValue(deck.powerLevel) }),
      createElement("td", {}, tagList(deckMetadataList(deck), "Sin metadata")),
      createElement("td", {}, tagList(deck.pilots, "Sin pilotos")),
      createElement("td", { text: String(deck.appearances) }),
      createElement("td", { text: String(deck.wins) }),
      createElement("td", { text: `${formatPercent(deck.winRate)} (n=${deck.appearances})` }),
      createElement("td", {}, deckLinks(deck)),
      createElement("td", { text: `${deck.firstDate} a ${deck.lastDate}` }),
      createElement("td", {}, tagList(deck.variants, "Sin variantes")),
      createElement("td", {}, tagList(deck.aliases, "Sin aliases")),
    );
    return row;
  });

  container.append(
    createTable(
      [
        "Deck",
        "Dueno",
        "Comandante",
        "Arquetipo",
        "Power",
        "Tags/colores",
        "Pilotos",
        "Apariciones",
        "Victorias",
        "Tasa",
        "Links",
        "Fechas",
        "Variantes",
        "Aliases",
      ],
      rows,
    ),
  );
}

export function renderMatchupTable(matchupStats) {
  const container = document.getElementById("matchupTable");
  if (!matchupStats.subjectKey) {
    renderEmpty(container, "Selecciona un deck para ver sus matchups.");
    return;
  }

  if (matchupStats.rows.length === 0) {
    renderEmpty(
      container,
      `No hay matchups para ${matchupStats.subjectLabel} con mínimo ${matchupStats.minGames} partidas en el subconjunto filtrado.`,
    );
    return;
  }

  removeChildren(container);
  const rows = matchupStats.rows.map((matchup) => {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: matchup.opponentLabel }),
      createElement("td", { text: String(matchup.appearances) }),
      createElement("td", { text: String(matchup.subjectWins) }),
      createElement("td", { text: String(matchup.opponentWins) }),
      createElement("td", { text: String(matchup.otherOrDrawCount) }),
      createElement("td", { text: `${formatPercent(matchup.subjectWinRate)} (n=${matchup.appearances})` }),
      createElement("td", {}, tagList(matchup.gameIds)),
    );
    return row;
  });

  container.append(
    createTable(
      [
        "Rival",
        "Partidas juntos",
        "Victorias deck",
        "Victorias rival",
        "Otros/empates",
        "Tasa del deck",
        "Partidas",
      ],
      rows,
    ),
  );
}

export function renderKillPairsTable(combatStats) {
  const container = document.getElementById("killPairsTable");
  if (combatStats.pairs.length === 0) {
    renderEmpty(container, "No hay eliminaciones registradas en el subconjunto filtrado.");
    return;
  }

  removeChildren(container);
  const rows = combatStats.pairs.map((pair) => {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: pair.actor }),
      createElement("td", { text: pair.target }),
      createElement("td", { text: String(pair.count) }),
      createElement("td", { text: displayValue(pair.topMethod) }),
      createElement("td", {}, tagList(pair.methods)),
      createElement("td", {}, tagList(pair.gameIds)),
    );
    return row;
  });

  container.append(
    createTable(
      ["Eliminador", "Eliminado", "Veces", "Método más común", "Métodos", "Partidas"],
      rows,
    ),
  );
}

function sortValue(game, key) {
  const values = {
    date: game.date,
    location: formatLocation(game.location),
    result: game.result_type === "draw" ? "Empate" : game.winner_player,
    duration: game.duration_minutes,
    starter: game.starting_player,
    condition: game.win_condition_category,
    confidence: game.parse_confidence,
    review: game.needs_review ? 1 : 0,
  };

  return values[key];
}

function compareGames(a, b) {
  const aValue = sortValue(a, gameSort.key);
  const bValue = sortValue(b, gameSort.key);
  const aKnown = isKnown(aValue);
  const bKnown = isKnown(bValue);

  if (!aKnown && !bKnown) return 0;
  if (!aKnown) return 1;
  if (!bKnown) return -1;

  let result;
  if (typeof aValue === "number" && typeof bValue === "number") {
    result = aValue - bValue;
  } else {
    result = String(aValue).localeCompare(String(bValue), "es", { sensitivity: "base" });
  }

  return gameSort.direction === "asc" ? result : -result;
}

function participantSummary(game) {
  return game.participants
    .map((participant) => `${participant.player}: ${deckLabelForParticipant(participant)}`)
    .join(" / ");
}

function makeSortableHeader(label, key) {
  const marker = gameSort.key === key ? (gameSort.direction === "asc" ? " ↑" : " ↓") : "";
  return createElement("button", {
    className: "sortable-button",
    type: "button",
    dataset: { sortKey: key },
    text: `${label}${marker}`,
  });
}

export function renderGameTable(games, onOpenDetail) {
  const container = document.getElementById("gamesTable");
  if (games.length === 0) {
    renderEmpty(container, "No hay partidas que coincidan con los filtros.");
    return;
  }

  removeChildren(container);
  const sortedGames = [...games].sort(compareGames);
  const rows = sortedGames.map((game) => {
    const reviewTag = game.needs_review ? tag("Revisar", "review") : tag("OK", "known");
    const confidenceType = game.parse_confidence === "low" ? "low" : "";
    const detailButton = createElement("button", {
      className: "button button--secondary",
      type: "button",
      dataset: { gameId: game.game_id },
      text: "Detalle",
    });
    const row = createElement("tr");

    row.append(
      createElement("td", { text: game.date }),
      createElement("td", { text: formatLocation(game.location) }),
      createElement("td", { text: participantSummary(game) }),
      createElement("td", { text: formatResult(game.result_type, game.winner_player) }),
      createElement("td", { text: formatDuration(game.duration_minutes) }),
      createElement("td", { text: displayValue(game.starting_player) }),
      createElement("td", { text: formatWinCondition(game.win_condition_category) }),
      createElement("td", {}, tagList([formatConfidence(game.parse_confidence)], confidenceType ? "Baja" : UNKNOWN_LABEL)),
      createElement("td", {}, reviewTag),
      createElement("td", {}, detailButton),
    );

    return row;
  });

  const table = createTable(
    [
      makeSortableHeader("Fecha", "date"),
      makeSortableHeader("Ubicación", "location"),
      "Participantes y decks",
      makeSortableHeader("Resultado", "result"),
      makeSortableHeader("Duración", "duration"),
      makeSortableHeader("Comenzó", "starter"),
      makeSortableHeader("Condición", "condition"),
      makeSortableHeader("Confianza", "confidence"),
      makeSortableHeader("Revisión", "review"),
      "Abrir",
    ],
    rows,
  );

  table.addEventListener("click", (event) => {
    const sortButton = event.target.closest("[data-sort-key]");
    if (sortButton) {
      const nextKey = sortButton.dataset.sortKey;
      if (gameSort.key === nextKey) {
        gameSort.direction = gameSort.direction === "asc" ? "desc" : "asc";
      } else {
        gameSort = { key: nextKey, direction: "asc" };
      }
      renderGameTable(games, onOpenDetail);
      return;
    }

    const detailButton = event.target.closest("[data-game-id]");
    if (detailButton) {
      const game = games.find((candidate) => candidate.game_id === detailButton.dataset.gameId);
      if (game) onOpenDetail(game);
    }
  });

  container.append(table);
}

function nullableBooleanLabel(value) {
  if (value === true) return "Registrado";
  if (value === false) return "Registrado: no";
  return UNKNOWN_LABEL;
}

function turnOrderText(game) {
  const order = Array.isArray(game.turn_order) ? game.turn_order.filter(isKnown) : [];
  return order.length > 0 ? order.join(" > ") : "";
}

function missingFields(game) {
  const fields = [
    ["Hora inicial", game.start_time],
    ["Hora final", game.end_time],
    ["Duración", game.duration_minutes],
    ["Jugador inicial", game.starting_player],
    ["Orden de turno", game.turn_order],
    ["Condicion de victoria", game.win_condition_category],
    ["Nuke", game.nuke_recorded],
    ["Sol Ring turno 1", game.sol_ring_t1_recorded],
  ];

  return fields.filter(([, value]) => !isKnown(value)).map(([label]) => label);
}

function renderParticipantsDetail(game) {
  const rows = game.participants.map((participant) => {
    const commander = isKnown(participant.commander_name) ? participant.commander_name : "Comandante pendiente";
    const row = createElement("tr");
    row.append(
      createElement("td", { text: String(participant.seat_order) }),
      createElement("td", { text: participant.player }),
      createElement("td", { text: displayValue(participant.deck_name_raw) }),
      createElement("td", { text: displayValue(deckNameForParticipant(participant)) }),
      createElement("td", { text: displayValue(participant.deck_id) }),
      createElement("td", { text: displayValue(deckOwnerForParticipant(participant)) }),
      createElement("td", { text: displayValue(participant.deck_variant) }),
      createElement("td", { text: commander }),
      createElement("td", { text: displayValue(participant.result) }),
      createElement("td", { text: formatConfidence(participant.assignment_confidence) }),
    );
    return row;
  });

  return createTable(
    [
      "Orden",
      "Jugador",
      "Deck original",
      "Deck canónico",
      "Deck ID",
      "Dueño",
      "Variante",
      "Comandante",
      "Resultado",
      "Confianza",
    ],
    rows,
  );
}

function renderEventsDetail(game) {
  if (game.events.length === 0) {
    return createElement("p", { className: "muted", text: "No hay eventos registrados para esta partida." });
  }

  const rows = game.events.map((event) => {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: String(event.event_order) }),
      createElement("td", { text: displayValue(event.event_type) }),
      createElement("td", { text: displayValue(event.actor) }),
      createElement("td", { text: displayValue(event.target) }),
      createElement("td", { text: displayValue(event.method) }),
      createElement("td", { text: displayValue(event.explicitness) }),
      createElement("td", { text: displayValue(event.notes) }),
    );
    return row;
  });

  return createTable(["Orden", "Tipo", "Actor", "Objetivo", "Método", "Registro", "Notas"], rows);
}

function detailBlock(title, children) {
  return appendChildren(createElement("section", { className: "detail-block" }), [
    createElement("h3", { text: title }),
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

export function renderGameDetail(game) {
  const title = document.getElementById("dialogTitle");
  const content = document.getElementById("dialogContent");
  title.textContent = `${game.game_id} - ${game.date}`;
  removeChildren(content);

  const missing = missingFields(game);
  const summary = createElement("div", { className: "detail-grid" }, [
    detailBlock("Resultado", [
      createElement("p", { text: formatResult(game.result_type, game.winner_player) }),
      createElement("p", { className: "muted", text: `Ubicación: ${formatLocation(game.location)}` }),
      createElement("p", { className: "muted", text: `Confianza: ${formatConfidence(game.parse_confidence)}` }),
    ]),
    detailBlock("Tiempo e inicio", [
      createElement("p", { text: `Inicio: ${displayValue(game.start_time)}` }),
      createElement("p", { text: `Fin: ${displayValue(game.end_time)}` }),
      createElement("p", { text: `Duración: ${formatDuration(game.duration_minutes)}` }),
      createElement("p", { text: `Comenzo: ${displayValue(game.starting_player)}` }),
      createElement("p", { text: `Orden de turno: ${displayValue(turnOrderText(game))}` }),
    ]),
    detailBlock("Metadata escasa", [
      createElement("p", { text: `Condicion: ${formatWinCondition(game.win_condition_category)}` }),
      createElement("p", { text: `Nuke: ${nullableBooleanLabel(game.nuke_recorded)}` }),
      createElement("p", { text: `Sol Ring turno 1: ${nullableBooleanLabel(game.sol_ring_t1_recorded)}` }),
    ]),
  ]);

  const rawLine = detailBlock("Línea original", createElement("p", { className: "raw-line", text: game.raw_line }));
  const notes = detailBlock("Notas", [
    createElement("p", { text: displayValue(game.notes) }),
    createElement("p", { className: "muted", text: game.quality_issue?.notes ? `Calidad: ${game.quality_issue.notes}` : "" }),
  ]);
  const assignments = detailBlock("Asignaciones de deck", renderParticipantsDetail(game));
  const events = detailBlock("Eventos", renderEventsDetail(game));
  const missingBlock = detailBlock(
    "Campos faltantes",
    missing.length > 0 ? tagList(missing) : createElement("p", { text: "Sin campos faltantes en la metadata revisada." }),
  );

  content.append(summary, rawLine, notes, assignments, events, missingBlock);
}

export function renderQualityPanel(stats) {
  const container = document.getElementById("qualityPanel");
  removeChildren(container);

  const metricList = createElement("div", { className: "metric-list" });
  const rows = [
    ["Confianza alta", `${stats.quality.confidenceCounts.high} partidas`],
    ["Confianza media", `${stats.quality.confidenceCounts.medium} partidas`],
    ["Confianza baja", `${stats.quality.confidenceCounts.low} partidas`],
    ["Duración", `${stats.quality.durationCoverage}/${stats.totalGames} con dato`],
    ["Jugador inicial", `${stats.quality.starterCoverage}/${stats.totalGames} con dato`],
    ["Condición de victoria", `${stats.quality.winConditionCoverage}/${stats.totalGames} con dato`],
    ["Nuke", `${stats.quality.nukeTrue} registrado; ${stats.quality.nukeKnown}/${stats.totalGames} con campo conocido`],
    [
      "Sol Ring turno 1",
      `${stats.quality.solRingTrue} registrado; ${stats.quality.solRingKnown}/${stats.totalGames} con campo conocido`,
    ],
    ["Eventos anidados", `${stats.quality.eventRows} eventos registrados`],
  ];

  for (const [label, value] of rows) {
    metricList.append(
      createElement("div", { className: "metric-row" }, [
        createElement("div", { className: "metric-row__head" }, [
          createElement("span", { text: label }),
          createElement("strong", { text: value }),
        ]),
      ]),
    );
  }

  container.append(
    createElement("h3", { text: "Cobertura" }),
    createElement("p", {
      text:
        "No registrado no equivale a no ocurrió. Los campos nulos de duración, inicio, nuke, Sol Ring y condición solo indican ausencia de registro.",
    }),
    metricList,
  );
}

export function renderReviewList(reviewGames) {
  const container = document.getElementById("reviewList");
  removeChildren(container);
  container.append(createElement("h3", { text: "Partidas para revisión" }));

  if (reviewGames.length === 0) {
    container.append(createElement("p", { className: "muted", text: "No hay partidas prioritarias en el subconjunto filtrado." }));
    return;
  }

  const list = createElement("ul");
  for (const game of reviewGames) {
    list.append(
      createElement("li", {
        text: `${game.game_id} (${game.date}) - ${displayValue(game.quality_issue?.notes || game.notes)}`,
      }),
    );
  }
  container.append(list);
}

function resultLabel(result, winner = "") {
  if (result === "win") return "Victoria";
  if (result === "draw") return "Empate";
  if (result === "not_win") return isKnown(winner) ? `No gano; gano ${winner}` : "No gano";
  return UNKNOWN_LABEL;
}

function streakLabel(streaks) {
  if (!streaks || streaks.currentCount === 0) return UNKNOWN_LABEL;
  const labels = {
    win: "victorias seguidas",
    not_win: "partidas sin ganar",
    draw: "empates seguidos",
    unknown: "partidas sin resultado claro",
  };
  return `${streaks.currentCount} ${labels[streaks.currentType] ?? "partidas"}`;
}

function appendTableOrEmpty(container, headers, rows, emptyMessage) {
  if (rows.length === 0) {
    renderEmpty(container, emptyMessage);
    return;
  }
  removeChildren(container);
  container.append(createTable(headers, rows));
}

function recentRowsTableRows(rows) {
  return rows.map((item) => {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: item.date }),
      createElement("td", { text: item.gameId }),
      createElement("td", { text: formatLocation(item.location) }),
      createElement("td", { text: displayValue(item.deckLabel) }),
      createElement("td", { text: resultLabel(item.result, item.winner) }),
      createElement("td", { text: formatWinCondition(item.winCondition) }),
    );
    return row;
  });
}

export function renderPlayerProfile(profile) {
  const summary = document.getElementById("playerProfileSummary");
  const decks = document.getElementById("playerProfileDecks");
  const rivals = document.getElementById("playerProfileRivals");
  const combat = document.getElementById("playerProfileCombat");
  const recent = document.getElementById("playerProfileRecent");
  removeChildren(summary);

  if (!profile.player) {
    renderEmpty(decks, "Selecciona un jugador para ver su perfil.");
    renderEmpty(rivals, "Selecciona un jugador para ver rivales.");
    renderEmpty(combat, "Selecciona un jugador para ver eliminaciones.");
    renderEmpty(recent, "Selecciona un jugador para ver partidas recientes.");
    return;
  }

  summary.append(
    makeKpi("Partidas", formatNumber(profile.totalGames), "Subconjunto filtrado"),
    makeKpi("Winrate", profile.winRate === null ? UNKNOWN_LABEL : formatPercent(profile.winRate), `${profile.wins}/${profile.totalGames} victorias`),
    makeKpi("No gano", formatNumber(profile.notWins), `${profile.draws} empates registrados`),
    makeKpi("Duracion de partidas", formatAverage(profile.averageDuration, profile.durationSample, "min"), "Solo partidas con minutos"),
    makeKpi("Racha actual", streakLabel(profile.streaks), `Mejor racha: ${profile.streaks.longestWin} victorias`),
    makeKpi("Eventos", profile.nukeCount + profile.solRingCount > 0 ? `Nuke: ${profile.nukeCount || UNKNOWN_LABEL} / Sol Ring T1: ${profile.solRingCount || UNKNOWN_LABEL}` : UNKNOWN_LABEL, "Solo registros explicitos"),
  );

  appendTableOrEmpty(
    decks,
    ["Deck", "Partidas", "Victorias", "Tasa", "Empates", "Fechas"],
    profile.deckRows.slice(0, 12).map((deck) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: deck.label }),
        createElement("td", { text: String(deck.appearances) }),
        createElement("td", { text: String(deck.wins) }),
        createElement("td", { text: `${formatPercent(deck.winRate)} (n=${deck.appearances})` }),
        createElement("td", { text: String(deck.draws) }),
        createElement("td", { text: `${deck.firstDate} a ${deck.lastDate}` }),
      );
      return row;
    }),
    `${profile.player} no tiene decks registrados en el subconjunto filtrado.`,
  );

  appendTableOrEmpty(
    rivals,
    ["Rival", "Juntos", `${profile.player} gana`, "Rival gana", "Otros/empates", "Tasa"],
    profile.rivalRows.slice(0, 12).map((rival) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: rival.player }),
        createElement("td", { text: String(rival.meetings) }),
        createElement("td", { text: String(rival.playerWins) }),
        createElement("td", { text: String(rival.opponentWins) }),
        createElement("td", { text: String(rival.otherWins + rival.draws) }),
        createElement("td", { text: `${formatPercent(rival.playerWinRate)} (n=${rival.meetings})` }),
      );
      return row;
    }),
    `${profile.player} no tiene rivales en el subconjunto filtrado.`,
  );

  const combatRows = [
    ...profile.killedRows.slice(0, 6).map((item) => ({ type: "Elimina a", ...item })),
    ...profile.killedByRows.slice(0, 6).map((item) => ({ type: "Eliminado por", ...item })),
  ].map((item) => {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: item.type }),
      createElement("td", { text: item.player }),
      createElement("td", { text: String(item.count) }),
      createElement("td", {}, tagList(item.methods)),
    );
    return row;
  });
  appendTableOrEmpty(combat, ["Tipo", "Jugador", "Veces", "Metodos"], combatRows, "No hay eliminaciones registradas para este jugador.");

  appendTableOrEmpty(
    recent,
    ["Fecha", "Partida", "Ubicacion", "Deck", "Resultado", "Condicion"],
    recentRowsTableRows(profile.recentRows),
    "No hay partidas recientes para este jugador.",
  );
}

export function renderDeckProfile(profile) {
  const summary = document.getElementById("deckProfileSummary");
  const pilots = document.getElementById("deckProfilePilots");
  const opponents = document.getElementById("deckProfileOpponents");
  const events = document.getElementById("deckProfileEvents");
  const recent = document.getElementById("deckProfileRecent");
  removeChildren(summary);

  if (!profile.deckKey) {
    renderEmpty(pilots, "Selecciona un deck para ver su perfil.");
    renderEmpty(opponents, "Selecciona un deck para ver rivales.");
    renderEmpty(events, "Selecciona un deck para ver eventos.");
    renderEmpty(recent, "Selecciona un deck para ver partidas recientes.");
    return;
  }

  summary.append(
    makeKpi("Deck", profile.identity.label, "Identidad canonica"),
    makeKpi("Comandante", displayValue(profile.identity.commanderName), "Desde deck_catalog/Moxfield"),
    makeKpi("Partidas", formatNumber(profile.totalGames), `Pilotos: ${profile.pilotRows.length}`),
    makeKpi("Winrate", profile.winRate === null ? UNKNOWN_LABEL : formatPercent(profile.winRate), `${profile.wins}/${profile.totalGames} victorias`),
    makeKpi("Ubicacion", `${profile.byLocation.in_person} presencial / ${profile.byLocation.virtual} virtual`, "Apariciones"),
    makeKpi("Metadata", deckMetadataSummary(profile.identity), deckMetadataList(profile.identity).length > 0 ? deckMetadataList(profile.identity).join(" / ") : "Sin tags/colores"),
  );

  appendTableOrEmpty(
    pilots,
    ["Piloto", "Partidas", "Victorias", "Tasa", "Empates", "Links"],
    profile.pilotRows.map((pilot, index) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: pilot.player }),
        createElement("td", { text: String(pilot.appearances) }),
        createElement("td", { text: String(pilot.wins) }),
        createElement("td", { text: `${formatPercent(pilot.winRate)} (n=${pilot.appearances})` }),
        createElement("td", { text: String(pilot.draws) }),
        createElement("td", {}, index === 0 ? deckLinks(profile.identity) : tagList([], "Ver arriba")),
      );
      return row;
    }),
    "No hay pilotos registrados para este deck.",
  );

  appendTableOrEmpty(
    opponents,
    ["Rival", "Juntos", "Victorias deck", "Victorias rival", "Otros/empates", "Tasa deck"],
    profile.opponentRows.slice(0, 12).map((opponent) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: opponent.label }),
        createElement("td", { text: String(opponent.appearances) }),
        createElement("td", { text: String(opponent.deckWins) }),
        createElement("td", { text: String(opponent.opponentWins) }),
        createElement("td", { text: String(opponent.otherWins + opponent.draws) }),
        createElement("td", { text: `${formatPercent(opponent.deckWinRate)} (n=${opponent.appearances})` }),
      );
      return row;
    }),
    "No hay rivales registrados para este deck.",
  );

  const eventRows = [
    ...profile.winConditionRows.map((item) => ({ type: "Forma de victoria", label: formatWinCondition(item.category), count: item.count, methods: [] })),
    ...profile.killRows.map((item) => ({ type: "Elimina a", label: item.label, count: item.count, methods: item.methods })),
    ...profile.deathRows.map((item) => ({ type: "Eliminado por", label: item.label, count: item.count, methods: item.methods })),
  ].map((item) => {
    const row = createElement("tr");
    row.append(
      createElement("td", { text: item.type }),
      createElement("td", { text: item.label }),
      createElement("td", { text: String(item.count) }),
      createElement("td", {}, tagList(item.methods, "Sin metodo")),
    );
    return row;
  });
  appendTableOrEmpty(events, ["Tipo", "Detalle", "Veces", "Metodos"], eventRows, "No hay eventos o condiciones registradas para este deck.");

  appendTableOrEmpty(
    recent,
    ["Fecha", "Partida", "Ubicacion", "Piloto/deck", "Resultado", "Condicion"],
    recentRowsTableRows(profile.recentRows),
    "No hay partidas recientes para este deck.",
  );
}

export function renderHeadToHead(headToHead) {
  const summary = document.getElementById("headToHeadSummary");
  const deckPairs = document.getElementById("headToHeadDeckPairs");
  const games = document.getElementById("headToHeadGames");
  removeChildren(summary);

  if (!headToHead.playerA || !headToHead.playerB || headToHead.playerA === headToHead.playerB) {
    renderEmpty(deckPairs, "Selecciona dos jugadores distintos para comparar.");
    renderEmpty(games, "Selecciona dos jugadores distintos para ver partidas compartidas.");
    return;
  }

  summary.append(
    makeKpi("Partidas juntos", formatNumber(headToHead.totalGames), "Subconjunto filtrado"),
    makeKpi(headToHead.playerA, headToHead.aWinRate === null ? UNKNOWN_LABEL : formatPercent(headToHead.aWinRate), `${headToHead.aWins} victorias`),
    makeKpi(headToHead.playerB, headToHead.bWinRate === null ? UNKNOWN_LABEL : formatPercent(headToHead.bWinRate), `${headToHead.bWins} victorias`),
    makeKpi("Otros/empates", String(headToHead.otherWins + headToHead.draws), `${headToHead.otherWins} terceros / ${headToHead.draws} empates`),
    makeKpi("Eliminaciones", headToHead.aEliminatedB + headToHead.bEliminatedA > 0 ? `${headToHead.aEliminatedB} / ${headToHead.bEliminatedA}` : UNKNOWN_LABEL, `${headToHead.playerA}->${headToHead.playerB} / ${headToHead.playerB}->${headToHead.playerA}; solo registros explicitos`),
  );

  appendTableOrEmpty(
    deckPairs,
    ["Deck A", "Deck B", "Partidas", `${headToHead.playerA} gana`, `${headToHead.playerB} gana`, "Otros/empates"],
    headToHead.deckPairRows.slice(0, 12).map((pair) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: displayValue(pair.deckA) }),
        createElement("td", { text: displayValue(pair.deckB) }),
        createElement("td", { text: String(pair.appearances) }),
        createElement("td", { text: `${pair.aWins} (${formatPercent(pair.aWinRate)})` }),
        createElement("td", { text: `${pair.bWins} (${formatPercent(pair.bWinRate)})` }),
        createElement("td", { text: String(pair.otherWins + pair.draws) }),
      );
      return row;
    }),
    "No hay pares de decks para estos jugadores.",
  );

  appendTableOrEmpty(
    games,
    ["Fecha", "Partida", "Ubicacion", `Deck ${headToHead.playerA}`, `Deck ${headToHead.playerB}`, "Resultado", "Condicion"],
    headToHead.rows.map((item) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: item.date }),
        createElement("td", { text: item.gameId }),
        createElement("td", { text: formatLocation(item.location) }),
        createElement("td", { text: displayValue(item.deckA) }),
        createElement("td", { text: displayValue(item.deckB) }),
        createElement("td", { text: formatResult(item.resultType, item.winner) }),
        createElement("td", { text: formatWinCondition(item.winCondition) }),
      );
      return row;
    }),
    "No hay partidas compartidas para estos jugadores.",
  );
}

function shortMatrixLabel(label) {
  const text = String(label ?? UNKNOWN_LABEL);
  return text.length > 22 ? `${text.slice(0, 21)}...` : text;
}

function heatCellStyle(rate) {
  if (!Number.isFinite(rate)) return "";
  const clamped = Math.max(0, Math.min(1, rate));
  const color = clamped >= 0.5 ? "117, 183, 152" : "215, 123, 114";
  const alpha = 0.14 + Math.abs(clamped - 0.5) * 0.62;
  return `background: rgba(${color}, ${alpha.toFixed(3)})`;
}

export function renderDeckMatchupMatrix(matrix) {
  const container = document.getElementById("deckMatchupMatrix");
  const meta = document.getElementById("deckMatchupMatrixMeta");
  if (meta) meta.textContent = `${matrix.decks.length} decks, n deck>=${matrix.minAppearances}, n matchup>=${matrix.minGames}`;

  if (matrix.decks.length === 0) {
    renderEmpty(container, "No hay suficientes decks para construir el heatmap con esos minimos.");
    return;
  }

  removeChildren(container);
  const table = createElement("table", { className: "heatmap-table" });
  const thead = createElement("thead");
  const headRow = createElement("tr");
  headRow.append(createElement("th", { scope: "col", text: "Deck" }));
  for (const deck of matrix.decks) {
    headRow.append(createElement("th", { scope: "col", title: deck.label, text: shortMatrixLabel(deck.label) }));
  }
  thead.append(headRow);

  const tbody = createElement("tbody");
  for (const rowData of matrix.rows) {
    const row = createElement("tr");
    row.append(createElement("th", { scope: "row", title: rowData.label, text: shortMatrixLabel(rowData.label) }));
    for (const cell of rowData.cells) {
      if (cell === null) {
        row.append(createElement("td", { className: "heat-cell heat-cell--self", text: "-" }));
        continue;
      }

      if (!cell.visible || cell.subjectWinRate === null) {
        row.append(createElement("td", { className: "heat-cell heat-cell--empty", text: `n=${cell.appearances}` }));
        continue;
      }

      row.append(
        createElement("td", { className: "heat-cell", style: heatCellStyle(cell.subjectWinRate) }, [
          createElement("strong", { text: formatPercent(cell.subjectWinRate, 0) }),
          createElement("span", { text: `n=${cell.appearances}` }),
        ]),
      );
    }
    tbody.append(row);
  }

  table.append(thead, tbody);
  container.append(table);
}

export function renderBadges(badges) {
  const container = document.getElementById("badgesGrid");
  removeChildren(container);

  if (badges.length === 0) {
    renderEmpty(container, "No hay suficientes datos registrados para mostrar badges en este subconjunto.");
    return;
  }

  for (const badge of badges) {
    container.append(
      appendChildren(createElement("article", { className: "badge-card" }), [
        createElement("p", { className: "badge-card__title", text: badge.title }),
        createElement("p", { className: "badge-card__winner", text: displayValue(badge.winner) }),
        createElement("p", { className: "badge-card__value", text: displayValue(badge.value) }),
        createElement("p", { className: "badge-card__sample", text: [badge.sample, badge.note].filter(isKnown).join(" · ") }),
      ]),
    );
  }
}
function rankChangeText(row, hasPreviousPeriod) {
  if (!hasPreviousPeriod) return "No aplica";
  if (row.previousRank === null) return "Nuevo";
  if (row.rankChange > 0) return `Sube ${row.rankChange}`;
  if (row.rankChange < 0) return `Baja ${Math.abs(row.rankChange)}`;
  return "Igual";
}

function formatNullablePercent(value, sample) {
  return `${formatPercent(value)} (n=${sample})`;
}

function renderReportSummary(reports) {
  const container = document.getElementById("reportSummary");
  removeChildren(container);

  container.append(
    makeKpi("Periodo", reports.period.label, `${reports.period.games} partidas`),
    makeKpi("Decks unicos", formatNumber(reports.meta.uniqueDecks), `${reports.meta.deckAppearances} apariciones con deck`),
    makeKpi(
      "Diversidad",
      reports.meta.diversityRate === null ? UNKNOWN_LABEL : formatPercent(reports.meta.diversityRate),
      "Decks unicos / apariciones",
    ),
    makeKpi(
      "Orden de turno",
      `${reports.turnOrder.eligibleGames}/${reports.turnOrder.totalGames}`,
      "Real registrado o virtual inferido",
    ),
    makeKpi(
      "Duracion",
      reports.duration.average === null ? UNKNOWN_LABEL : `${reports.duration.average.toFixed(1)} min`,
      `Promedio de partidas con minutos; cobertura ${reports.duration.knownGames}/${reports.duration.totalGames}`,
    ),
    makeKpi(
      "Rating",
      reports.elo.rows[0] ? reports.elo.rows[0].player : UNKNOWN_LABEL,
      reports.elo.rows[0] ? `${Math.round(reports.elo.rows[0].rating)} Elo` : "Sin muestra",
    ),
  );
}

function renderPeriodTables(reports) {
  const hasPreviousPeriod = isKnown(reports.period.previousMonth);

  appendTableOrEmpty(
    document.getElementById("reportPeriodPlayers"),
    ["#", "Jugador", "Partidas", "Victorias", "Tasa", "Decks", "Ubicacion", "Cambio"],
    reports.period.playerRows.slice(0, 12).map((player) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: String(player.rank) }),
        createElement("td", { text: player.player }),
        createElement("td", { text: String(player.games) }),
        createElement("td", { text: String(player.wins) }),
        createElement("td", { text: formatNullablePercent(player.winRate, player.games) }),
        createElement("td", { text: String(player.decksUsed) }),
        createElement("td", { text: `${player.inPerson} presencial / ${player.virtual} virtual` }),
        createElement("td", { text: rankChangeText(player, hasPreviousPeriod) }),
      );
      return row;
    }),
    "No hay jugadores para este periodo.",
  );

  appendTableOrEmpty(
    document.getElementById("reportPeriodDecks"),
    ["#", "Deck", "Apariciones", "Victorias", "Tasa", "Pilotos", "Fechas", "Cambio"],
    reports.period.deckRows.slice(0, 12).map((deck) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: String(deck.rank) }),
        createElement("td", { text: deck.label }),
        createElement("td", { text: String(deck.appearances) }),
        createElement("td", { text: String(deck.wins) }),
        createElement("td", { text: formatNullablePercent(deck.winRate, deck.appearances) }),
        createElement("td", {}, tagList(deck.pilotsList, "Sin pilotos")),
        createElement("td", { text: `${deck.firstDate} a ${deck.lastDate}` }),
        createElement("td", { text: rankChangeText(deck, hasPreviousPeriod) }),
      );
      return row;
    }),
    "No hay decks para este periodo.",
  );

  appendTableOrEmpty(
    document.getElementById("reportRecentForm"),
    ["Jugador", "Ultimas partidas", "Victorias", "Empates", "Tasa", "Partidas"],
    reports.recentForm.playerRows.slice(0, 10).map((player) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: player.player }),
        createElement("td", { text: String(player.games) }),
        createElement("td", { text: String(player.wins) }),
        createElement("td", { text: String(player.draws) }),
        createElement("td", { text: formatNullablePercent(player.winRate, player.games) }),
        createElement("td", {}, tagList(player.recentGameIds)),
      );
      return row;
    }),
    "No hay forma reciente para este subconjunto.",
  );

  appendTableOrEmpty(
    document.getElementById("reportStreaks"),
    ["Jugador", "Partidas", "Racha actual", "Mejor racha", "Mayor sequia", "Desde ultima victoria"],
    reports.recentForm.streakRows.slice(0, 12).map((streak) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: streak.player }),
        createElement("td", { text: String(streak.games) }),
        createElement("td", { text: streakLabel(streak) }),
        createElement("td", { text: `${streak.longestWin} victorias` }),
        createElement("td", { text: `${streak.longestNotWin} sin ganar` }),
        createElement("td", { text: streak.gamesSinceWin === null ? UNKNOWN_LABEL : `${streak.gamesSinceWin} partidas` }),
      );
      return row;
    }),
    "No hay rachas para este subconjunto.",
  );
}

function renderMetaTables(reports) {
  appendTableOrEmpty(
    document.getElementById("metaTopDecks"),
    ["Deck", "Apariciones", "Victorias", "Tasa", "Pilotos"],
    reports.meta.topDecks.slice(0, 12).map((deck) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: deck.label }),
        createElement("td", { text: String(deck.appearances) }),
        createElement("td", { text: String(deck.wins) }),
        createElement("td", { text: formatNullablePercent(deck.winRate, deck.appearances) }),
        createElement("td", {}, tagList(deck.pilotsList, "Sin pilotos")),
      );
      return row;
    }),
    "No hay decks registrados en este subconjunto.",
  );

  appendTableOrEmpty(
    document.getElementById("metaEmergingDecks"),
    ["Deck", "Ventana reciente", "Ventana previa", "Diferencia", "Tasa reciente"],
    reports.meta.emergingDecks.map((deck) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: deck.label }),
        createElement("td", { text: String(deck.appearances) }),
        createElement("td", { text: String(deck.previousAppearances) }),
        createElement("td", { text: `+${deck.appearanceDelta}` }),
        createElement("td", { text: formatNullablePercent(deck.winRate, deck.appearances) }),
      );
      return row;
    }),
    "No hay decks emergentes con la ventana actual.",
  );

  const categoryRows = (rows, nameKey) =>
    rows.slice(0, 12).map((item) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: displayValue(item[nameKey] ?? item.label) }),
        createElement("td", { text: String(item.count) }),
        createElement("td", { text: formatNullablePercent(item.winRate, item.count) }),
      );
      return row;
    });

  appendTableOrEmpty(
    document.getElementById("metaArchetypes"),
    ["Arquetipo", "Apariciones", "Tasa"],
    categoryRows(reports.meta.archetypeRows, "archetype"),
    "No hay arquetipos registrados en deck_catalog.csv.",
  );
  appendTableOrEmpty(
    document.getElementById("metaTags"),
    ["Tag", "Apariciones", "Tasa"],
    categoryRows(reports.meta.tagRows, "tag"),
    "No hay tags registrados en deck_catalog.csv.",
  );
  appendTableOrEmpty(
    document.getElementById("metaPodSizes"),
    ["Tamano", "Partidas", "Tasa con ganador"],
    categoryRows(reports.meta.podSizeRows, "podSize"),
    "No hay partidas para resumir tamano de mesa.",
  );
}

function renderTurnOrderReports(reports) {
  const summary = document.getElementById("turnOrderSummary");
  removeChildren(summary);
  summary.append(
    makeKpi(
      "Cobertura",
      reports.turnOrder.coverageRate === null ? UNKNOWN_LABEL : formatPercent(reports.turnOrder.coverageRate),
      `${reports.turnOrder.eligibleGames}/${reports.turnOrder.totalGames} partidas`,
    ),
    makeKpi("Regla virtual", "Solo virtual", reports.turnOrder.virtualRule),
    makeKpi("Fuentes", String(reports.turnOrder.sourceRows.length), "Real registrado o virtual inferido"),
    makeKpi("Seat proxy", `${reports.turnOrder.seatPositionRows.length} posiciones`, "Orden escrito, no necesariamente turno real"),
  );

  appendTableOrEmpty(
    document.getElementById("turnOrderTable"),
    ["Posicion de turno", "Apariciones", "Victorias", "Winrate"],
    reports.turnOrder.positionRows.map((position) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: String(position.position) }),
        createElement("td", { text: String(position.count) }),
        createElement("td", { text: String(position.wins) }),
        createElement("td", { text: formatNullablePercent(position.winRate, position.count) }),
      );
      return row;
    }),
    "No hay orden de turno explicito o inferible en este subconjunto.",
  );

  appendTableOrEmpty(
    document.getElementById("turnOrderPlayerTable"),
    ["Jugador", "Apariciones", "Posicion promedio", "Victorias", "Winrate"],
    reports.turnOrder.playerRows.map((player) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: player.player }),
        createElement("td", { text: String(player.appearances) }),
        createElement("td", { text: player.averagePosition === null ? UNKNOWN_LABEL : player.averagePosition.toFixed(2) }),
        createElement("td", { text: String(player.wins) }),
        createElement("td", { text: formatNullablePercent(player.winRate, player.appearances) }),
      );
      return row;
    }),
    "No hay datos de jugadores por posicion de turno.",
  );

  appendTableOrEmpty(
    document.getElementById("seatOrderTable"),
    ["Seat order", "Apariciones", "Victorias", "Winrate"],
    reports.turnOrder.seatPositionRows.map((position) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: String(position.position) }),
        createElement("td", { text: String(position.count) }),
        createElement("td", { text: String(position.wins) }),
        createElement("td", { text: formatNullablePercent(position.winRate, position.count) }),
      );
      return row;
    }),
    "No hay seat_order registrado.",
  );
}

function renderDurationReports(reports) {
  const summary = document.getElementById("durationSummary");
  removeChildren(summary);
  summary.append(
    makeKpi(
      "Cobertura",
      reports.duration.coverageRate === null ? UNKNOWN_LABEL : formatPercent(reports.duration.coverageRate),
      `${reports.duration.knownGames}/${reports.duration.totalGames} partidas`,
    ),
    makeKpi("Promedio partida", reports.duration.average === null ? UNKNOWN_LABEL : `${reports.duration.average.toFixed(1)} min`, "Solo partidas con minutos"),
    makeKpi("Mediana partida", reports.duration.median === null ? UNKNOWN_LABEL : `${reports.duration.median.toFixed(1)} min`, "Solo partidas con minutos"),
  );

  const durationRows = (rows) =>
    rows.slice(0, 12).map((item) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: item.label }),
        createElement("td", { text: `${item.average.toFixed(1)} min (n=${item.sample})` }),
        createElement("td", { text: `${item.median.toFixed(1)} min` }),
        createElement("td", { text: `${item.min}-${item.max} min` }),
      );
      return row;
    });

  appendTableOrEmpty(
    document.getElementById("durationByPlayerTable"),
    ["Jugador", "Promedio partida", "Mediana partida", "Rango partida"],
    durationRows(reports.duration.byPlayer),
    "No hay duracion registrada en partidas de estos jugadores.",
  );
  appendTableOrEmpty(
    document.getElementById("durationByDeckTable"),
    ["Deck", "Promedio partida", "Mediana partida", "Rango partida"],
    durationRows(reports.duration.byDeck),
    "No hay duracion registrada en partidas de estos decks.",
  );
}

function renderDeckEventReports(reports) {
  appendTableOrEmpty(
    document.getElementById("deckEventWinConditions"),
    ["Deck", "Condicion", "Veces", "Partidas"],
    reports.deckEvents.winConditionRows.slice(0, 12).map((item) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: item.label }),
        createElement("td", { text: formatWinCondition(item.condition) }),
        createElement("td", { text: String(item.count) }),
        createElement("td", {}, tagList(item.gameIds)),
      );
      return row;
    }),
    "No hay condiciones de victoria por deck registradas.",
  );

  appendTableOrEmpty(
    document.getElementById("deckEventKills"),
    ["Deck", "Eliminaciones", "Metodos", "Partidas"],
    reports.deckEvents.killRows.slice(0, 12).map((item) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: item.label }),
        createElement("td", { text: String(item.count) }),
        createElement("td", {}, tagList(item.methods)),
        createElement("td", {}, tagList(item.gameIds)),
      );
      return row;
    }),
    "No hay eliminaciones hechas por deck registradas.",
  );

  appendTableOrEmpty(
    document.getElementById("deckEventDeaths"),
    ["Deck eliminado", "Veces", "Eliminadores", "Partidas"],
    reports.deckEvents.deathRows.slice(0, 12).map((item) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: item.label }),
        createElement("td", { text: String(item.count) }),
        createElement("td", {}, tagList(item.byActor)),
        createElement("td", {}, tagList(item.gameIds)),
      );
      return row;
    }),
    "No hay decks eliminados registrados.",
  );
}

function renderMonthlyAwards(reports) {
  appendTableOrEmpty(
    document.getElementById("monthlyAwardsTable"),
    ["Mes", "Partidas", "Mas victorias", "Mejor tasa", "Mas variedad", "Deck top", "Eventos"],
    reports.awards.slice(0, 12).map((award) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: award.label }),
        createElement("td", { text: String(award.games) }),
        createElement("td", { text: award.topWinner ? `${award.topWinner.player} (${award.topWinner.wins})` : UNKNOWN_LABEL }),
        createElement("td", {
          text: award.bestRatePlayer
            ? `${award.bestRatePlayer.player} ${formatNullablePercent(award.bestRatePlayer.winRate, award.bestRatePlayer.games)}`
            : UNKNOWN_LABEL,
        }),
        createElement("td", { text: award.mostVariety ? `${award.mostVariety.player} (${award.mostVariety.decksUsed})` : UNKNOWN_LABEL }),
        createElement("td", { text: award.topDeck ? `${award.topDeck.label} (${award.topDeck.appearances})` : UNKNOWN_LABEL }),
        createElement("td", { text: `Nuke ${award.nukeCount}; Sol Ring T1 ${award.solRingCount}` }),
      );
      return row;
    }),
    "No hay meses para calcular achievements.",
  );
}

function renderTimeline(reports) {
  appendTableOrEmpty(
    document.getElementById("timelineTable"),
    ["Fecha", "Partida", "Ubicacion", "Resultado", "Duracion", "Condicion", "Eventos", "Participantes"],
    reports.timeline.map((game) => {
      const row = createElement("tr");
      row.append(
        createElement("td", { text: game.date }),
        createElement("td", { text: game.gameId }),
        createElement("td", { text: formatLocation(game.location) }),
        createElement("td", { text: displayValue(game.result) }),
        createElement("td", { text: formatDuration(game.duration) }),
        createElement("td", { text: formatWinCondition(game.winCondition) }),
        createElement("td", { text: displayValue(game.events) }),
        createElement("td", {}, tagList(game.participants)),
      );
      return row;
    }),
    "No hay partidas en el timeline.",
  );
}

function renderFunFacts(reports) {
  const container = document.getElementById("funFactsGrid");
  removeChildren(container);

  if (reports.funFacts.length === 0) {
    renderEmpty(container, "No hay datos suficientes para curiosidades.");
    return;
  }

  for (const fact of reports.funFacts) {
    container.append(
      appendChildren(createElement("article", { className: "badge-card" }), [
        createElement("p", { className: "badge-card__title", text: fact.title }),
        createElement("p", { className: "badge-card__winner", text: displayValue(fact.value) }),
        createElement("p", { className: "badge-card__sample", text: displayValue(fact.sample) }),
      ]),
    );
  }
}

function renderDiscordSummary(reports) {
  const textarea = document.getElementById("discordSummaryText");
  textarea.value = reports.discordSummary;
}

export function renderAdvancedReports(reports) {
  renderReportSummary(reports);
  renderPeriodTables(reports);
  renderMetaTables(reports);
  renderTurnOrderReports(reports);
  renderDurationReports(reports);
  renderDeckEventReports(reports);
  renderMonthlyAwards(reports);
  renderTimeline(reports);
  renderFunFacts(reports);
  renderDiscordSummary(reports);
}