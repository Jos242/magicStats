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
        "Dueño",
        "Comandante",
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

function missingFields(game) {
  const fields = [
    ["Hora inicial", game.start_time],
    ["Hora final", game.end_time],
    ["Duración", game.duration_minutes],
    ["Jugador inicial", game.starting_player],
    ["Condición de victoria", game.win_condition_category],
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
      createElement("p", { text: `Comenzó: ${displayValue(game.starting_player)}` }),
    ]),
    detailBlock("Metadata escasa", [
      createElement("p", { text: `Condición: ${formatWinCondition(game.win_condition_category)}` }),
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
