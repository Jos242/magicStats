import { renderCharts, renderMatchupCharts } from "./js/charts.js";
import { collectDataWarnings, loadDataset } from "./js/data.js";
import { buildFilteredCsv } from "./js/export.js";
import { applyFilters, countActiveFilters, populateFilterControls, readFilterState, resetFilterControls } from "./js/filters.js";
import { calculateMatchupStats, calculatePlayerDeckStats, calculateStats } from "./js/stats.js";
import {
  renderCoverage,
  renderDeckTable,
  renderGameDetail,
  renderGameTable,
  renderKillPairsTable,
  renderMatchupTable,
  renderPlayerDeckBreakdown,
  renderPlayerTable,
  renderQualityPanel,
  renderReviewList,
  renderSummary,
} from "./js/table.js";
import { deckLabelForCatalog, downloadTextFile, formatNumber, isKnown } from "./js/utils.js";

const elements = {
  form: document.getElementById("filtersForm"),
  clearFilters: document.getElementById("clearFilters"),
  exportCsv: document.getElementById("exportCsv"),
  visibleCounter: document.getElementById("visibleCounter"),
  statusMessage: document.getElementById("statusMessage"),
  datasetMeta: document.getElementById("datasetMeta"),
  deckMinAppearances: document.getElementById("deckMinAppearances"),
  deckMinimumEffect: document.getElementById("deckMinimumEffect"),
  matchupSubjectDeck: document.getElementById("matchupSubjectDeck"),
  matchupRivalDeck: document.getElementById("matchupRivalDeck"),
  matchupMinGames: document.getElementById("matchupMinGames"),
  playerDeckPlayer: document.getElementById("playerDeckPlayer"),
  playerDeckLocation: document.getElementById("playerDeckLocation"),
  dialog: document.getElementById("gameDialog"),
  closeDialog: document.getElementById("closeDialog"),
};

let dataset = null;
let currentFilteredGames = [];
let renderPending = false;

function setStatus(message, type = "info") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("is-error", type === "error");
}

function openGameDetail(game) {
  renderGameDetail(game);
  if (typeof elements.dialog.showModal === "function") {
    elements.dialog.showModal();
  } else {
    elements.dialog.setAttribute("open", "");
  }
}

function updateVisibleCounter(filteredGames, filters) {
  const activeCount = countActiveFilters(filters);
  const filterText = activeCount === 0 ? "sin filtros activos" : `${activeCount} filtros activos`;
  elements.visibleCounter.textContent = `${formatNumber(filteredGames.length)} partidas visibles, ${filterText}`;
}

function readDeckMinimum() {
  const value = Number(elements.deckMinAppearances.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function readMatchupMinimum() {
  const value = Number(elements.matchupMinGames.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function deckOptionLabel(row) {
  return deckLabelForCatalog(row);
}

function populateMatchupControls(deckIdentityRows) {
  const rows = [...deckIdentityRows]
    .filter((row) => isKnown(row.deck_id))
    .sort((a, b) => {
      const gamesDifference = (b.games_played ?? 0) - (a.games_played ?? 0);
      if (gamesDifference !== 0) return gamesDifference;
      return deckOptionLabel(a).localeCompare(deckOptionLabel(b), "es", { sensitivity: "base" });
    });

  elements.matchupSubjectDeck.replaceChildren();
  elements.matchupRivalDeck.replaceChildren(new Option("Todos los rivales", ""));

  for (const row of rows) {
    const value = row.deck_id;
    const label = deckOptionLabel(row);
    elements.matchupSubjectDeck.append(new Option(label, value));
    elements.matchupRivalDeck.append(new Option(label, value));
  }

  if (rows.length > 0) {
    elements.matchupSubjectDeck.value = rows[0].deck_id;
  }
}



function filterPlayerDeckGames(games) {
  const location = elements.playerDeckLocation.value;
  return isKnown(location) ? games.filter((game) => game.location === location) : games;
}

function syncPlayerDeckControl(playerStats, preferredPlayer = "") {
  const previousValue = elements.playerDeckPlayer.value;
  const players = playerStats.map((player) => player.player);

  elements.playerDeckPlayer.replaceChildren();

  if (players.length === 0) {
    elements.playerDeckPlayer.disabled = true;
    elements.playerDeckPlayer.append(new Option("Sin jugadores", ""));
    return "";
  }

  elements.playerDeckPlayer.disabled = false;
  for (const player of playerStats) {
    elements.playerDeckPlayer.append(new Option(`${player.player} (${player.participations})`, player.player));
  }

  const nextValue = players.includes(previousValue)
    ? previousValue
    : players.includes(preferredPlayer)
      ? preferredPlayer
      : players[0];
  elements.playerDeckPlayer.value = nextValue;
  return nextValue;
}

function render() {
  if (!dataset) return;

  const filters = readFilterState(elements.form);
  const filteredGames = applyFilters(dataset.games, filters);
  const stats = calculateStats(filteredGames);
  const deckMinimum = readDeckMinimum();
  const playerDeckGames = filterPlayerDeckGames(filteredGames);
  const playerDeckControlStats = calculateStats(playerDeckGames);
  const selectedPlayerForDecks = syncPlayerDeckControl(playerDeckControlStats.playerStats, filters.participant);
  const playerDeckStats = calculatePlayerDeckStats(playerDeckGames, selectedPlayerForDecks);
  const matchupStats = calculateMatchupStats(filteredGames, {
    subjectKey: elements.matchupSubjectDeck.value,
    rivalKey: elements.matchupRivalDeck.value,
    minGames: readMatchupMinimum(),
    catalogRows: dataset.deckIdentityRows,
  });

  currentFilteredGames = filteredGames;
  updateVisibleCounter(filteredGames, filters);
  renderSummary(stats);
  renderCoverage(stats);
  renderPlayerTable(stats.playerStats);
  renderPlayerDeckBreakdown(playerDeckStats);
  renderDeckTable(stats.deckStats, deckMinimum);
  renderGameTable(filteredGames, openGameDetail);
  renderQualityPanel(stats);
  renderReviewList(stats.reviewGames);
  renderCharts(stats, { deckMinAppearances: deckMinimum });
  renderMatchupCharts(matchupStats);
  renderMatchupTable(matchupStats);
  renderKillPairsTable(stats.combat);
  elements.deckMinimumEffect.textContent = `Filtra ${stats.deckStats.filter((deck) => deck.appearances >= deckMinimum).length} decks en gráfica y tabla`;

  if (dataset.games.length === 0) {
    setStatus("El dataset no contiene partidas", "error");
  } else {
    setStatus("Datos cargados");
  }
}

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  window.requestAnimationFrame(() => {
    renderPending = false;
    render();
  });
}

function exportCurrentCsv() {
  const csv = buildFilteredCsv(currentFilteredGames);
  const today = new Date().toISOString().slice(0, 10);
  downloadTextFile(`mtg-commander-filtrado-${today}.csv`, csv, "text/csv;charset=utf-8");
}

function attachEvents() {
  elements.form.addEventListener("input", scheduleRender);
  elements.form.addEventListener("change", scheduleRender);
  elements.deckMinAppearances.addEventListener("input", scheduleRender);
  elements.deckMinAppearances.addEventListener("change", scheduleRender);
  elements.matchupSubjectDeck.addEventListener("change", () => {
    if (elements.matchupSubjectDeck.value === elements.matchupRivalDeck.value) {
      elements.matchupRivalDeck.value = "";
    }
    scheduleRender();
  });
  elements.matchupRivalDeck.addEventListener("change", scheduleRender);
  elements.matchupMinGames.addEventListener("input", scheduleRender);
  elements.matchupMinGames.addEventListener("change", scheduleRender);
  elements.playerDeckPlayer.addEventListener("change", scheduleRender);
  elements.playerDeckLocation.addEventListener("change", scheduleRender);
  elements.clearFilters.addEventListener("click", () => {
    resetFilterControls(elements.form);
    scheduleRender();
  });
  elements.exportCsv.addEventListener("click", exportCurrentCsv);
  elements.closeDialog.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) elements.dialog.close();
  });
}

async function init() {
  attachEvents();

  try {
    dataset = await loadDataset();
    populateFilterControls(elements.form, dataset);
    populateMatchupControls(dataset.deckIdentityRows);

    const warnings = collectDataWarnings(dataset.games);
    if (warnings.length > 0) {
      console.warn("Advertencias de datos:", warnings);
      setStatus(`${warnings.length} advertencias de datos`);
    }

    const generatedOn = dataset.metadata.generated_on ? `Generado ${dataset.metadata.generated_on}` : "Dataset local";
    elements.datasetMeta.textContent = `${generatedOn} · ${formatNumber(dataset.games.length)} partidas`;
    render();
  } catch (error) {
    console.error("No se pudieron cargar los datos", error);
    setStatus("No se pudieron cargar los datos. Sirve el sitio con un servidor estático.", "error");
    elements.datasetMeta.textContent = "Error de carga";
  }
}

init();
