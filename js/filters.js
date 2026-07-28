import {
  deckIdForParticipant,
  deckLabelForCatalog,
  displayValue,
  formatConfidence,
  formatLocation,
  formatWinCondition,
  isKnown,
  normalizeSearch,
  uniqueSorted,
} from "./utils.js";

const SELECTS = {
  location: "locationFilter",
  participant: "participantFilter",
  winner: "winnerFilter",
  deck: "deckFilter",
  commander: "commanderFilter",
  starter: "starterFilter",
  result: "resultFilter",
  winCondition: "winConditionFilter",
  confidence: "confidenceFilter",
};

function option(value, label) {
  return { value, label };
}

function setOptions(select, options, placeholder = "Todos") {
  select.replaceChildren();
  select.append(new Option(placeholder, ""));

  for (const item of options) {
    select.append(new Option(item.label, item.value));
  }
}

function setDateBounds(form, dates) {
  const sortedDates = uniqueSorted(dates);
  const minDate = sortedDates[0] ?? "";
  const maxDate = sortedDates[sortedDates.length - 1] ?? "";

  form.elements.dateStart.min = minDate;
  form.elements.dateStart.max = maxDate;
  form.elements.dateEnd.min = minDate;
  form.elements.dateEnd.max = maxDate;
}

export function populateFilterControls(form, dataset) {
  const games = dataset.games;
  const participants = games.flatMap((game) => game.participants);
  const selectors = Object.fromEntries(
    Object.entries(SELECTS).map(([key, id]) => [key, document.getElementById(id)]),
  );

  setDateBounds(form, games.map((game) => game.date));

  setOptions(selectors.location, [
    option("in_person", "Presencial"),
    option("virtual", "Virtual"),
  ]);

  setOptions(
    selectors.participant,
    uniqueSorted(participants.map((participant) => participant.player)).map((player) => option(player, player)),
  );

  setOptions(
    selectors.winner,
    uniqueSorted(games.map((game) => game.winner_player)).map((player) => option(player, player)),
  );

  setOptions(
    selectors.deck,
    dataset.deckIdentityRows.map((deck) => option(deck.deck_id, deckLabelForCatalog(deck))),
  );

  const commanders = uniqueSorted(participants.map((participant) => participant.commander_name));
  setOptions(
    selectors.commander,
    commanders.map((commander) => option(commander, commander)),
    commanders.length > 0 ? "Todos" : "Sin comandantes registrados",
  );
  selectors.commander.disabled = commanders.length === 0;

  setOptions(
    selectors.starter,
    uniqueSorted(games.map((game) => game.starting_player)).map((player) => option(player, player)),
  );

  setOptions(selectors.result, [
    option("win", "Victoria"),
    option("draw", "Empate"),
  ]);

  setOptions(
    selectors.winCondition,
    uniqueSorted(games.map((game) => game.win_condition_category)).map((condition) =>
      option(condition, formatWinCondition(condition)),
    ),
  );

  setOptions(
    selectors.confidence,
    uniqueSorted(games.map((game) => game.parse_confidence)).map((confidence) =>
      option(confidence, formatConfidence(confidence)),
    ),
  );
}

export function readFilterState(form) {
  return {
    searchText: form.elements.searchText.value.trim(),
    dateStart: form.elements.dateStart.value,
    dateEnd: form.elements.dateEnd.value,
    location: form.elements.location.value,
    participant: form.elements.participant.value,
    winner: form.elements.winner.value,
    deck: form.elements.deck.value,
    commander: form.elements.commander.value,
    starter: form.elements.starter.value,
    result: form.elements.result.value,
    winCondition: form.elements.winCondition.value,
    confidence: form.elements.confidence.value,
    needsReview: form.elements.needsReview.checked,
  };
}

function matchesSearch(game, searchText) {
  if (!isKnown(searchText)) return true;
  const needle = normalizeSearch(searchText);

  const searchableParts = [
    game.game_id,
    game.date,
    formatLocation(game.location),
    game.winner_player,
    game.winner_raw,
    game.starting_player,
    game.win_condition_category,
    game.win_condition_text,
    game.parse_confidence,
    game.notes,
    game.raw_line,
    game.quality_issue?.notes,
    ...game.participants.flatMap((participant) => [
      participant.player,
      participant.deck_name_raw,
      participant.deck_name_normalized,
      participant.deck_id,
      participant.deck_owner,
      participant.deck_catalog?.official_name,
      participant.deck_catalog?.moxfield_url,
      participant.deck_catalog?.archidekt_url,
      participant.deck_catalog?.edhrec_url,
      participant.deck_variant,
      participant.commander_name,
      participant.notes,
    ]),
    ...game.events.flatMap((event) => [
      event.event_type,
      event.actor,
      event.target,
      event.method,
      event.notes,
      event.explicitness,
    ]),
  ];

  return normalizeSearch(searchableParts.filter(isKnown).join(" ")).includes(needle);
}

export function applyFilters(games, filters) {
  return games.filter((game) => {
    if (isKnown(filters.dateStart) && game.date < filters.dateStart) return false;
    if (isKnown(filters.dateEnd) && game.date > filters.dateEnd) return false;
    if (isKnown(filters.location) && game.location !== filters.location) return false;
    if (isKnown(filters.winner) && game.winner_player !== filters.winner) return false;
    if (isKnown(filters.starter) && game.starting_player !== filters.starter) return false;
    if (isKnown(filters.result) && game.result_type !== filters.result) return false;
    if (isKnown(filters.winCondition) && game.win_condition_category !== filters.winCondition) return false;
    if (isKnown(filters.confidence) && game.parse_confidence !== filters.confidence) return false;
    if (filters.needsReview && game.needs_review !== true) return false;

    if (
      isKnown(filters.participant) &&
      !game.participants.some((participant) => participant.player === filters.participant)
    ) {
      return false;
    }

    if (
      isKnown(filters.deck) &&
      !game.participants.some((participant) => deckIdForParticipant(participant) === filters.deck)
    ) {
      return false;
    }

    if (
      isKnown(filters.commander) &&
      !game.participants.some((participant) => participant.commander_name === filters.commander)
    ) {
      return false;
    }

    return matchesSearch(game, filters.searchText);
  });
}

export function resetFilterControls(form) {
  form.reset();
}

export function countActiveFilters(filters) {
  return Object.entries(filters).filter(([key, value]) => {
    if (key === "needsReview") return value === true;
    return isKnown(value);
  }).length;
}

export function describeFilterValue(value) {
  return displayValue(value);
}
