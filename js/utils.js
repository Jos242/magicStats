export const UNKNOWN_LABEL = "No registrado";

export function isKnown(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function displayValue(value) {
  return isKnown(value) ? String(value) : UNKNOWN_LABEL;
}

export function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(isKnown).map((value) => String(value).trim()))].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );
}

export function formatLocation(location) {
  if (location === "virtual") return "Virtual";
  if (location === "in_person") return "Presencial";
  return UNKNOWN_LABEL;
}

export function formatResult(resultType, winnerPlayer) {
  if (resultType === "draw") return "Empate";
  if (resultType === "win" && isKnown(winnerPlayer)) return `Ganó ${winnerPlayer}`;
  return UNKNOWN_LABEL;
}

export function formatConfidence(confidence) {
  const labels = {
    high: "Alta",
    medium: "Media",
    low: "Baja",
  };
  return labels[confidence] ?? displayValue(confidence);
}

export function formatWinCondition(category) {
  const labels = {
    combat_damage: "Daño de combate",
    commander_damage: "Daño de comandante",
    concessions: "Rendiciones",
    damage_unspecified: "Daño no especificado",
    direct_damage: "Daño directo",
    eliminated_all: "Eliminó a todos",
    last_player_standing: "Último en pie",
    mill: "Mill",
    tokens: "Tokens",
  };
  return labels[category] ?? displayValue(category);
}

export function formatDuration(minutes) {
  if (!isKnown(minutes)) return UNKNOWN_LABEL;
  return `${minutes} min`;
}

export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return UNKNOWN_LABEL;
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return UNKNOWN_LABEL;
  return new Intl.NumberFormat("es-GT").format(value);
}

export function formatAverage(value, sampleSize, unit = "") {
  if (!Number.isFinite(value) || sampleSize === 0) return `${UNKNOWN_LABEL} (n=0)`;
  const suffix = unit ? ` ${unit}` : "";
  return `${value.toFixed(1)}${suffix} (n=${sampleSize})`;
}

export function makeDeckKey(player, deckName) {
  return `${String(player ?? "").trim()}||${String(deckName ?? "").trim()}`;
}

export function splitDeckKey(key) {
  const [player = "", deckName = ""] = String(key ?? "").split("||");
  return { player, deckName };
}

export function deckIdForParticipant(participant) {
  return (
    participant?.deck_catalog?.deck_id ||
    participant?.deck_id ||
    makeDeckKey(participant?.player, participant?.deck_name_normalized)
  );
}

export function deckNameForCatalog(row) {
  return row?.official_name || row?.display_name || row?.deck_name_normalized || "";
}

export function deckOwnerForCatalog(row) {
  return row?.owner_player || row?.deck_owner || row?.player || "";
}

export function deckNameForParticipant(participant) {
  return (
    participant?.deck_catalog?.official_name ||
    participant?.deck_catalog?.display_name ||
    participant?.deck_name_normalized ||
    ""
  );
}

export function deckOwnerForParticipant(participant) {
  return (
    participant?.deck_owner ||
    participant?.deck_catalog?.owner_player ||
    participant?.deck_catalog?.player ||
    participant?.player ||
    ""
  );
}

export function deckLabelFromParts(name, owner) {
  if (!isKnown(name)) return UNKNOWN_LABEL;
  return isKnown(owner) ? `${name} / ${owner}` : name;
}

export function deckLabelForCatalog(row) {
  return deckLabelFromParts(deckNameForCatalog(row), deckOwnerForCatalog(row));
}

export function deckLabelForParticipant(participant) {
  return deckLabelFromParts(deckNameForParticipant(participant), deckOwnerForParticipant(participant));
}

export function parseJsonArray(value) {
  if (!isKnown(value)) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isKnown) : [];
  } catch {
    return [];
  }
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      if (nextChar === "\n") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const cleanRows = rows.filter((csvRow) => csvRow.some((cell) => isKnown(cell)));
  const [headers, ...dataRows] = cleanRows;
  if (!headers) return [];

  return dataRows.map((csvRow) =>
    Object.fromEntries(headers.map((header, index) => [header, csvRow[index] ?? ""])),
  );
}

export function mean(numbers) {
  const valid = numbers.filter(Number.isFinite);
  if (valid.length === 0) return null;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

export function median(numbers) {
  const valid = numbers.filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[middle - 1] + valid[middle]) / 2 : valid[middle];
}

export function groupBy(items, keyGetter) {
  const groups = new Map();
  for (const item of items) {
    const key = keyGetter(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

export function sortByNumberDescThenName(items, numberKey, nameKey = "name") {
  return [...items].sort((a, b) => {
    const numberDifference = (b[numberKey] ?? 0) - (a[numberKey] ?? 0);
    if (numberDifference !== 0) return numberDifference;
    return String(a[nameKey] ?? "").localeCompare(String(b[nameKey] ?? ""), "es", { sensitivity: "base" });
  });
}

export function monthLabel(dateText) {
  if (!isKnown(dateText)) return UNKNOWN_LABEL;
  const [year, month] = String(dateText).split("-");
  const labels = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const monthIndex = Number(month) - 1;
  return `${labels[monthIndex] ?? month} ${year}`;
}

export function safeRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

export function toCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function downloadTextFile(filename, text, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function removeChildren(element) {
  while (element.firstChild) {
    element.firstChild.remove();
  }
}

export function createElement(tag, options = {}, children = []) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(options)) {
    if (key === "className") {
      element.className = value;
    } else if (key === "text") {
      element.textContent = value;
    } else if (key === "dataset") {
      Object.assign(element.dataset, value);
    } else if (key.startsWith("aria")) {
      element.setAttribute(key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`), value);
    } else if (value !== false && value !== null && value !== undefined) {
      element.setAttribute(key, value);
    }
  }

  const normalizedChildren = Array.isArray(children) ? children : [children];
  for (const child of normalizedChildren) {
    if (child === null || child === undefined) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return element;
}
