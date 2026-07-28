import { deckLabelForParticipant, displayValue, toCsvValue } from "./utils.js";

const CSV_COLUMNS = [
  "game_id",
  "date",
  "location",
  "participants",
  "decks",
  "deck_ids",
  "winner",
  "starting_player",
  "duration_minutes",
  "win_condition",
  "parse_confidence",
  "raw_line",
];

function gameToCsvRow(game) {
  const participants = game.participants.map((participant) => participant.player).join("; ");
  const decks = game.participants
    .map((participant) => `${participant.player}: ${deckLabelForParticipant(participant)}`)
    .join("; ");
  const deckIds = game.participants
    .map((participant) => `${participant.player}: ${displayValue(participant.deck_id)}`)
    .join("; ");

  return [
    game.game_id,
    game.date,
    game.location,
    participants,
    decks,
    deckIds,
    game.winner_player ?? "",
    game.starting_player ?? "",
    game.duration_minutes ?? "",
    game.win_condition_category ?? "",
    game.parse_confidence,
    game.raw_line,
  ];
}

export function buildFilteredCsv(games) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const game of games) {
    lines.push(gameToCsvRow(game).map(toCsvValue).join(","));
  }
  return lines.join("\n");
}
