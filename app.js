import {
  renderAdvancedCharts,
  renderCharts,
  renderDeckProfileCharts,
  renderHeadToHeadCharts,
  renderMatchupCharts,
  renderPlayerProfileCharts,
} from "./js/charts.js";
import { collectDataWarnings, loadDataset } from "./js/data.js";
import { buildFilteredCsv } from "./js/export.js";
import { applyFilters, countActiveFilters, populateFilterControls, readFilterState, resetFilterControls } from "./js/filters.js";
import {
  calculateBadges,
  calculateDeckMatchupMatrix,
  calculateDeckProfile,
  calculateMatchupStats,
  calculatePlayerDeckStats,
  calculatePlayerHeadToHead,
  calculatePlayerProfile,
  calculateStats,
} from "./js/stats.js";
import { calculateAdvancedReports, listReportMonths } from "./js/reports.js";
import {
  renderAdvancedReports,
  renderBadges,
  renderCoverage,
  renderDeckMatchupMatrix,
  renderDeckProfile,
  renderDeckTable,
  renderGameDetail,
  renderGameTable,
  renderHeadToHead,
  renderKillPairsTable,
  renderMatchupTable,
  renderPlayerDeckBreakdown,
  renderPlayerProfile,
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
  profilePlayer: document.getElementById("profilePlayer"),
  profileDeck: document.getElementById("profileDeck"),
  headToHeadPlayerA: document.getElementById("headToHeadPlayerA"),
  headToHeadPlayerB: document.getElementById("headToHeadPlayerB"),
  matrixTopDecks: document.getElementById("matrixTopDecks"),
  matrixMinAppearances: document.getElementById("matrixMinAppearances"),
  matrixMinGames: document.getElementById("matrixMinGames"),
  reportPeriod: document.getElementById("reportPeriod"),
  copyDiscordSummary: document.getElementById("copyDiscordSummary"),
  copyDiscordStatus: document.getElementById("copyDiscordStatus"),
  dialog: document.getElementById("gameDialog"),
  closeDialog: document.getElementById("closeDialog"),
};

const tabButtons = [...document.querySelectorAll("[data-tab-target]")];
const tabPanels = [...document.querySelectorAll("[data-tab-panel]")];

let dataset = null;
let currentFilteredGames = [];
let renderPending = false;

function normalizeTabName(value) {
  return String(value ?? "")
    .replace(/^#/, "")
    .replace(/^tab-/, "");
}

function tabExists(tabName) {
  return tabPanels.some((panel) => panel.dataset.tabPanel === tabName);
}

function initialTabName() {
  const hashTab = normalizeTabName(window.location.hash);
  return tabExists(hashTab) ? hashTab : "summary";
}

function activateTab(tabName, options = {}) {
  const { renderAfter = true, updateHash = false, focus = false } = options;
  const nextTab = tabExists(tabName) ? tabName : "summary";

  for (const button of tabButtons) {
    const isActive = button.dataset.tabTarget === nextTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
    if (isActive && focus) button.focus();
  }

  for (const panel of tabPanels) {
    const isActive = panel.dataset.tabPanel === nextTab;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  }

  if (updateHash && window.history?.replaceState) {
    window.history.replaceState(null, "", `#${nextTab}`);
  }

  if (renderAfter && dataset) scheduleRender();
}

function handleTabKeydown(event) {
  const currentIndex = tabButtons.indexOf(event.currentTarget);
  if (currentIndex < 0) return;

  const keyOffsets = {
    ArrowLeft: -1,
    ArrowUp: -1,
    ArrowRight: 1,
    ArrowDown: 1,
  };

  let nextIndex = currentIndex;
  if (event.key in keyOffsets) {
    nextIndex = (currentIndex + keyOffsets[event.key] + tabButtons.length) % tabButtons.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabButtons.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  activateTab(tabButtons[nextIndex].dataset.tabTarget, { focus: true, renderAfter: true, updateHash: true });
}

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

function readMatrixTopDecks() {
  const value = Number(elements.matrixTopDecks.value);
  return Number.isFinite(value) && value > 1 ? Math.floor(value) : 10;
}

function readMatrixMinAppearances() {
  const value = Number(elements.matrixMinAppearances.value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2;
}

function readMatrixMinGames() {
  const value = Number(elements.matrixMinGames.value);
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

function syncSelectControl(select, rows, getValue, getLabel, preferredValue = "", emptyLabel = "Sin datos") {
  const previousValue = select.value;
  const options = rows
    .map((row) => ({ value: getValue(row), label: getLabel(row) }))
    .filter((row) => isKnown(row.value));
  const values = options.map((option) => option.value);

  select.replaceChildren();

  if (options.length === 0) {
    select.disabled = true;
    select.append(new Option(emptyLabel, ""));
    return "";
  }

  select.disabled = false;
  for (const option of options) {
    select.append(new Option(option.label, option.value));
  }

  const nextValue = values.includes(previousValue)
    ? previousValue
    : values.includes(preferredValue)
      ? preferredValue
      : values[0];
  select.value = nextValue;
  return nextValue;
}

function syncHeadToHeadControls(playerStats, preferredPlayer = "") {
  const players = playerStats.map((player) => player.player);
  const previousA = elements.headToHeadPlayerA.value;
  const previousB = elements.headToHeadPlayerB.value;

  elements.headToHeadPlayerA.replaceChildren();
  elements.headToHeadPlayerB.replaceChildren();

  if (players.length < 2) {
    for (const select of [elements.headToHeadPlayerA, elements.headToHeadPlayerB]) {
      select.disabled = true;
      select.append(new Option("Sin suficientes jugadores", ""));
    }
    return { playerA: "", playerB: "" };
  }

  for (const select of [elements.headToHeadPlayerA, elements.headToHeadPlayerB]) {
    select.disabled = false;
    for (const player of playerStats) {
      select.append(new Option(`${player.player} (${player.participations})`, player.player));
    }
  }

  const playerA = players.includes(previousA)
    ? previousA
    : players.includes(preferredPlayer)
      ? preferredPlayer
      : players[0];
  const playerB = players.includes(previousB) && previousB !== playerA
    ? previousB
    : players.find((player) => player !== playerA) ?? "";

  elements.headToHeadPlayerA.value = playerA;
  elements.headToHeadPlayerB.value = playerB;
  return { playerA, playerB };
}

function syncReportPeriodControl(games) {
  const months = listReportMonths(games);
  const previousValue = elements.reportPeriod.value;
  elements.reportPeriod.replaceChildren(new Option("Todo el subconjunto", ""));

  for (const month of months) {
    elements.reportPeriod.append(new Option(month, month));
  }

  elements.reportPeriod.value = months.includes(previousValue) ? previousValue : "";
  return elements.reportPeriod.value;
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
  const selectedProfilePlayer = syncSelectControl(
    elements.profilePlayer,
    stats.playerStats,
    (player) => player.player,
    (player) => `${player.player} (${player.participations})`,
    filters.participant,
    "Sin jugadores",
  );
  const selectedProfileDeck = syncSelectControl(
    elements.profileDeck,
    stats.deckStats,
    (deck) => deck.deckId,
    (deck) => `${deck.displayName} / ${deck.ownerPlayer} (${deck.appearances})`,
    filters.deck,
    "Sin decks",
  );
  const headToHeadPlayers = syncHeadToHeadControls(stats.playerStats, filters.participant);
  const playerProfile = calculatePlayerProfile(filteredGames, selectedProfilePlayer);
  const deckProfile = calculateDeckProfile(filteredGames, selectedProfileDeck, dataset.deckIdentityRows);
  const headToHead = calculatePlayerHeadToHead(filteredGames, headToHeadPlayers.playerA, headToHeadPlayers.playerB);
  const deckMatrix = calculateDeckMatchupMatrix(filteredGames, {
    minAppearances: readMatrixMinAppearances(),
    minGames: readMatrixMinGames(),
    topN: readMatrixTopDecks(),
    catalogRows: dataset.deckIdentityRows,
  });
  const badges = calculateBadges(filteredGames, stats);
  const matchupStats = calculateMatchupStats(filteredGames, {
    subjectKey: elements.matchupSubjectDeck.value,
    rivalKey: elements.matchupRivalDeck.value,
    minGames: readMatchupMinimum(),
    catalogRows: dataset.deckIdentityRows,
  });
  const selectedReportPeriod = syncReportPeriodControl(filteredGames);
  const advancedReports = calculateAdvancedReports(filteredGames, {
    periodMonth: selectedReportPeriod,
    catalogRows: dataset.deckIdentityRows,
  });

  currentFilteredGames = filteredGames;
  updateVisibleCounter(filteredGames, filters);
  renderSummary(stats);
  renderCoverage(stats);
  renderPlayerTable(stats.playerStats);
  renderPlayerDeckBreakdown(playerDeckStats);
  renderPlayerProfile(playerProfile);
  renderDeckProfile(deckProfile);
  renderHeadToHead(headToHead);
  renderDeckMatchupMatrix(deckMatrix);
  renderBadges(badges);
  renderAdvancedReports(advancedReports);
  renderDeckTable(stats.deckStats, deckMinimum);
  renderGameTable(filteredGames, openGameDetail);
  renderQualityPanel(stats);
  renderReviewList(stats.reviewGames);
  renderCharts(stats, { deckMinAppearances: deckMinimum });
  renderPlayerProfileCharts(playerProfile);
  renderDeckProfileCharts(deckProfile);
  renderHeadToHeadCharts(headToHead);
  renderMatchupCharts(matchupStats);
  renderAdvancedCharts(advancedReports);
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

async function copyDiscordSummaryText() {
  const textarea = document.getElementById("discordSummaryText");
  const text = textarea?.value ?? "";
  if (!text) {
    elements.copyDiscordStatus.textContent = "Sin resumen";
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    elements.copyDiscordStatus.textContent = "Copiado";
  } catch {
    textarea?.focus();
    textarea?.select();
    elements.copyDiscordStatus.textContent = "Texto seleccionado";
  }
}

function attachEvents() {
  for (const button of tabButtons) {
    button.addEventListener("click", () => activateTab(button.dataset.tabTarget, { updateHash: true }));
    button.addEventListener("keydown", handleTabKeydown);
  }

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
  elements.profilePlayer.addEventListener("change", scheduleRender);
  elements.profileDeck.addEventListener("change", scheduleRender);
  elements.headToHeadPlayerA.addEventListener("change", scheduleRender);
  elements.headToHeadPlayerB.addEventListener("change", scheduleRender);
  elements.matrixTopDecks.addEventListener("input", scheduleRender);
  elements.matrixTopDecks.addEventListener("change", scheduleRender);
  elements.matrixMinAppearances.addEventListener("input", scheduleRender);
  elements.matrixMinAppearances.addEventListener("change", scheduleRender);
  elements.matrixMinGames.addEventListener("input", scheduleRender);
  elements.matrixMinGames.addEventListener("change", scheduleRender);
  elements.reportPeriod.addEventListener("change", scheduleRender);
  elements.copyDiscordSummary.addEventListener("click", copyDiscordSummaryText);
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
  activateTab(initialTabName(), { renderAfter: false });

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
