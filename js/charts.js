import { formatLocation, formatPercent, formatWinCondition } from "./utils.js";

const chartInstances = new Map();
const textColor = "#f0f3f4";
const mutedColor = "#aeb8bd";
const gridColor = "rgba(174, 184, 189, 0.16)";
const palette = ["#75b798", "#d8ad57", "#77a8d8", "#d77b72", "#b79ad7", "#8cc9c2", "#e3c37b"];

function setMeta(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: textColor,
          boxWidth: 14,
        },
      },
      tooltip: {
        callbacks: {
          label(context) {
            return `${context.dataset.label ?? "Valor"}: ${context.formattedValue}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: mutedColor },
        grid: { color: gridColor },
      },
      y: {
        ticks: { color: mutedColor },
        grid: { color: gridColor },
      },
    },
    ...extra,
  };
}

function destroyChart(id) {
  const current = chartInstances.get(id);
  if (current) {
    current.destroy();
    chartInstances.delete(id);
  }
}

function createChart(id, config) {
  destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;

  const chart = new window.Chart(canvas, config);
  chartInstances.set(id, chart);
}

function barDataset(label, data, color = palette[0]) {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: color,
    borderWidth: 1,
    borderRadius: 4,
  };
}

function renderWinsByPlayer(stats) {
  const rows = [...stats.playerStats].sort((a, b) => b.wins - a.wins);
  setMeta("winsByPlayerMeta", `n=${stats.totalGames} partidas`);
  createChart("winsByPlayerChart", {
    type: "bar",
    data: {
      labels: rows.map((row) => row.player),
      datasets: [barDataset("Victorias", rows.map((row) => row.wins), palette[0])],
    },
    options: baseOptions({
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: mutedColor }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
      },
    }),
  });
}

function renderWinRateByPlayer(stats) {
  const rows = [...stats.playerStats].sort((a, b) => b.winRate - a.winRate);
  setMeta("winRateByPlayerMeta", "Tasa = victorias / participaciones");
  createChart("winRateByPlayerChart", {
    type: "bar",
    data: {
      labels: rows.map((row) => `${row.player} (n=${row.participations})`),
      datasets: [barDataset("Tasa de victoria", rows.map((row) => Number((row.winRate * 100).toFixed(2))), palette[1])],
    },
    options: baseOptions({
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              return `Tasa: ${context.formattedValue}%`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: mutedColor }, grid: { display: false } },
        y: { beginAtZero: true, max: 100, ticks: { color: mutedColor, callback: (value) => `${value}%` } },
      },
    }),
  });
}

function renderGamesByMonth(stats) {
  setMeta("gamesByMonthMeta", `n=${stats.totalGames} partidas filtradas`);
  createChart("gamesByMonthChart", {
    type: "line",
    data: {
      labels: stats.gamesByMonth.map((row) => row.label),
      datasets: [
        {
          label: "Partidas",
          data: stats.gamesByMonth.map((row) => row.count),
          borderColor: palette[2],
          backgroundColor: "rgba(119, 168, 216, 0.22)",
          fill: true,
          tension: 0.25,
          pointRadius: 4,
        },
      ],
    },
    options: baseOptions({
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: mutedColor }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
      },
    }),
  });
}

function renderLocation(stats) {
  setMeta("locationMeta", `${stats.locations.in_person} presenciales / ${stats.locations.virtual} virtuales`);
  createChart("locationChart", {
    type: "doughnut",
    data: {
      labels: ["Presencial", "Virtual"],
      datasets: [
        {
          label: "Partidas",
          data: [stats.locations.in_person, stats.locations.virtual],
          backgroundColor: [palette[1], palette[2]],
          borderColor: "#20272f",
          borderWidth: 2,
        },
      ],
    },
    options: baseOptions({
      cutout: "58%",
      scales: {},
    }),
  });
}

function renderTopDecks(stats, minAppearances) {
  const rows = stats.deckStats
    .filter((row) => row.appearances >= minAppearances)
    .sort((a, b) => {
      const appearanceDifference = b.appearances - a.appearances;
      if (appearanceDifference !== 0) return appearanceDifference;
      return a.displayName.localeCompare(b.displayName, "es", { sensitivity: "base" });
    })
    .slice(0, 10);

  setMeta("topDecksMeta", `Top 10 con n>=${minAppearances}; ${rows.length} visibles`);
  createChart("topDecksChart", {
    type: "bar",
    data: {
      labels: rows.map((row) => `${row.displayName} / ${row.ownerPlayer}`),
      datasets: [barDataset("Apariciones", rows.map((row) => row.appearances), palette[3])],
    },
    options: baseOptions({
      indexAxis: "y",
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
        y: { ticks: { color: mutedColor }, grid: { display: false } },
      },
    }),
  });
}

function renderDeckPerformance(stats, minAppearances) {
  const rows = stats.deckStats
    .filter((row) => row.appearances >= minAppearances)
    .sort((a, b) => {
      const rateDifference = b.winRate - a.winRate;
      if (rateDifference !== 0) return rateDifference;
      return b.appearances - a.appearances;
    })
    .slice(0, 12);

  setMeta("deckPerformanceMeta", `Decks con n>=${minAppearances}; ${rows.length} visibles`);
  createChart("deckPerformanceChart", {
    type: "bar",
    data: {
      labels: rows.map((row) => `${row.displayName} / ${row.ownerPlayer} (n=${row.appearances})`),
      datasets: [barDataset("Tasa de victoria", rows.map((row) => Number((row.winRate * 100).toFixed(2))), palette[4])],
    },
    options: baseOptions({
      indexAxis: "y",
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              return `Tasa: ${context.formattedValue}%`;
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { color: mutedColor, callback: (value) => `${value}%` } },
        y: { ticks: { color: mutedColor }, grid: { display: false } },
      },
    }),
  });
}

function renderMatchupRates(matchupStats) {
  const rows = matchupStats.rows.slice(0, 12);
  const subjectText = matchupStats.subjectLabel || "Selecciona un deck";
  const totalAppearances = rows.reduce((total, row) => total + row.appearances, 0);

  setMeta(
    "matchupRatesMeta",
    `${subjectText}; ${rows.length} rivales visibles, ${totalAppearances} partidas contra rivales`,
  );

  createChart("matchupRatesChart", {
    type: "bar",
    data: {
      labels: rows.length > 0 ? rows.map((row) => `${row.opponentLabel} (n=${row.appearances})`) : ["Sin datos"],
      datasets: [
        barDataset(
          "Tasa de victoria",
          rows.length > 0 ? rows.map((row) => Number((row.subjectWinRate * 100).toFixed(2))) : [0],
          palette[0],
        ),
      ],
    },
    options: baseOptions({
      indexAxis: "y",
      plugins: {
        ...baseOptions().plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              return `Tasa: ${context.formattedValue}%`;
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { color: mutedColor, callback: (value) => `${value}%` } },
        y: { ticks: { color: mutedColor }, grid: { display: false } },
      },
    }),
  });
}

function renderMatchupDirect(matchupStats) {
  const direct = matchupStats.direct;

  if (!matchupStats.rivalKey) {
    setMeta("matchupDirectMeta", "Elige un rival específico");
  } else if (!direct) {
    setMeta("matchupDirectMeta", `Sin datos con mínimo n>=${matchupStats.minGames}`);
  } else {
    setMeta("matchupDirectMeta", `${direct.appearances} partidas juntos`);
  }

  createChart("matchupDirectChart", {
    type: "doughnut",
    data: {
      labels: ["Gana deck analizado", "Gana rival", "Gana otro o empate"],
      datasets: [
        {
          label: "Partidas",
          data: direct ? [direct.subjectWins, direct.opponentWins, direct.otherOrDrawCount] : [0, 0, 0],
          backgroundColor: [palette[0], palette[3], palette[2]],
          borderColor: "#20272f",
          borderWidth: 2,
        },
      ],
    },
    options: baseOptions({
      cutout: "58%",
      scales: {},
    }),
  });
}

function renderDuration(stats) {
  setMeta(
    "durationMeta",
    stats.duration.sample > 0
      ? `Usa ${stats.duration.sample} partidas; promedio ${stats.duration.average.toFixed(1)} min`
      : "n=0 partidas con duración",
  );
  createChart("durationChart", {
    type: "bar",
    data: {
      labels: stats.duration.histogram.map((bucket) => bucket.label),
      datasets: [barDataset("Partidas", stats.duration.histogram.map((bucket) => bucket.count), palette[5])],
    },
    options: baseOptions({
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: mutedColor }, grid: { display: false }, title: { display: true, text: "Minutos", color: mutedColor } },
        y: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
      },
    }),
  });
}

function renderStarter(stats) {
  const rateText = stats.starterAdvantage.winRate === null ? "No registrado" : formatPercent(stats.starterAdvantage.winRate);
  setMeta("starterMeta", `Usa ${stats.starterAdvantage.sample} partidas decisivas; tasa ${rateText}`);
  createChart("starterChart", {
    type: "bar",
    data: {
      labels: ["Empezó y ganó", "Empezó y no ganó"],
      datasets: [
        barDataset("Partidas", [stats.starterAdvantage.starterWins, stats.starterAdvantage.starterLosses], palette[6]),
      ],
    },
    options: baseOptions({
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: mutedColor }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
      },
    }),
  });
}

function renderEliminationsByActor(stats) {
  const rows = stats.combat.byActor.slice(0, 10);
  setMeta(
    "eliminationsByActorMeta",
    `${stats.combat.eliminationEventCount} eliminaciones en ${stats.combat.gamesWithEliminations} partidas`,
  );
  createChart("eliminationsByActorChart", {
    type: "bar",
    data: {
      labels: rows.length > 0 ? rows.map((row) => row.actor) : ["Sin datos"],
      datasets: [barDataset("Eliminaciones", rows.length > 0 ? rows.map((row) => row.count) : [0], palette[0])],
    },
    options: baseOptions({
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: mutedColor }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
      },
    }),
  });
}

function renderEliminationsByTarget(stats) {
  const rows = stats.combat.byTarget.slice(0, 10);
  setMeta("eliminationsByTargetMeta", "Veces eliminado; solo eventos registrados");
  createChart("eliminationsByTargetChart", {
    type: "bar",
    data: {
      labels: rows.length > 0 ? rows.map((row) => row.target) : ["Sin datos"],
      datasets: [barDataset("Veces eliminado", rows.length > 0 ? rows.map((row) => row.count) : [0], palette[3])],
    },
    options: baseOptions({
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: mutedColor }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
      },
    }),
  });
}

function renderEliminationMethods(stats) {
  const rows = stats.combat.byMethod;
  setMeta("eliminationMethodsMeta", `${stats.combat.eliminationEventCount} eliminaciones con método registrado/inferido`);
  createChart("eliminationMethodsChart", {
    type: "doughnut",
    data: {
      labels: rows.length > 0 ? rows.map((row) => row.method) : ["Sin datos"],
      datasets: [
        {
          label: "Eliminaciones",
          data: rows.length > 0 ? rows.map((row) => row.count) : [0],
          backgroundColor: palette,
          borderColor: "#20272f",
          borderWidth: 2,
        },
      ],
    },
    options: baseOptions({
      cutout: "58%",
      scales: {},
    }),
  });
}

function renderWinConditions(stats) {
  const rows = stats.combat.winConditions;
  setMeta("winConditionsMeta", `${stats.combat.winConditionGameCount} partidas con condición de victoria`);
  createChart("winConditionsChart", {
    type: "bar",
    data: {
      labels: rows.length > 0 ? rows.map((row) => formatWinCondition(row.category)) : ["Sin datos"],
      datasets: [barDataset("Partidas", rows.length > 0 ? rows.map((row) => row.count) : [0], palette[1])],
    },
    options: baseOptions({
      indexAxis: "y",
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
        y: { ticks: { color: mutedColor }, grid: { display: false } },
      },
    }),
  });
}

function renderKillPairs(stats) {
  const rows = stats.combat.pairs.slice(0, 12);
  setMeta("killPairsMeta", "Pares actor -> objetivo más repetidos");
  createChart("killPairsChart", {
    type: "bar",
    data: {
      labels: rows.length > 0 ? rows.map((row) => `${row.actor} -> ${row.target}`) : ["Sin datos"],
      datasets: [barDataset("Eliminaciones", rows.length > 0 ? rows.map((row) => row.count) : [0], palette[2])],
    },
    options: baseOptions({
      indexAxis: "y",
      plugins: { ...baseOptions().plugins, legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: mutedColor, precision: 0 }, grid: { color: gridColor } },
        y: { ticks: { color: mutedColor }, grid: { display: false } },
      },
    }),
  });
}

export function renderCharts(stats, options) {
  if (!window.Chart) {
    for (const id of [
      "winsByPlayerMeta",
      "winRateByPlayerMeta",
      "gamesByMonthMeta",
      "locationMeta",
      "topDecksMeta",
      "deckPerformanceMeta",
      "durationMeta",
      "starterMeta",
    ]) {
      setMeta(id, "Chart.js no está disponible");
    }
    return;
  }

  renderWinsByPlayer(stats);
  renderWinRateByPlayer(stats);
  renderGamesByMonth(stats);
  renderLocation(stats);
  renderTopDecks(stats, options.deckMinAppearances);
  renderDeckPerformance(stats, options.deckMinAppearances);
  renderDuration(stats);
  renderStarter(stats);
  renderEliminationsByActor(stats);
  renderEliminationsByTarget(stats);
  renderEliminationMethods(stats);
  renderWinConditions(stats);
  renderKillPairs(stats);
}

export function renderMatchupCharts(matchupStats) {
  if (!window.Chart) {
    setMeta("matchupRatesMeta", "Chart.js no está disponible");
    setMeta("matchupDirectMeta", "Chart.js no está disponible");
    return;
  }

  renderMatchupRates(matchupStats);
  renderMatchupDirect(matchupStats);
}

export function destroyCharts() {
  for (const id of chartInstances.keys()) {
    destroyChart(id);
  }
}
