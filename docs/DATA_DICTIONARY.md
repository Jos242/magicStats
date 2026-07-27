# Diccionario de datos

## `data/games.csv`

| Campo | Tipo | Descripción |
|---|---|---|
| `game_id` | string | ID estable en formato `G2026-###`. |
| `date` | date | Fecha ISO `YYYY-MM-DD`. |
| `location` | enum | `virtual` o `in_person`. |
| `player_count` | integer | Cantidad de participantes. |
| `result_type` | enum | `win` o `draw`. |
| `winner_player` | string vacío permitido | Ganador normalizado. Vacío en empate. |
| `winner_raw` | string | Texto o resolución original del ganador. |
| `starting_player` | string vacío permitido | Jugador que comenzó, solo si fue registrado. |
| `start_time`, `end_time` | time vacío permitido | Hora escrita, normalizada a `H:MM`. No tiene zona horaria. |
| `duration_minutes` | integer vacío permitido | Diferencia calculada entre inicio y fin. |
| `win_condition_category` | string vacío permitido | Categoría normalizada. |
| `win_condition_text` | string vacío permitido | Descripción legible. |
| `nuke_recorded` | boolean nullable | `true` cuando se registró. Vacío = desconocido. |
| `nuke_player` | string vacío permitido | Jugador asociado. Si hay varios nukes registrados, este campo conserva solo el primero por compatibilidad; usa `events[]` / `data/events.csv` para el conteo completo. |
| `sol_ring_t1_recorded` | boolean nullable | `true` cuando se registró. Vacío = desconocido. |
| `sol_ring_t1_player` | string vacío permitido | Jugador asociado. Si hay varios Sol Ring turno 1 registrados, este campo conserva solo el primero por compatibilidad; usa `events[]` / `data/events.csv` para el conteo completo. |
| `parse_confidence` | enum | `high`, `medium`, `low`. |
| `needs_review` | boolean | Revisión manual prioritaria. |
| `notes` | string | Supuestos o ambigüedades. |
| `source_line` | integer | Línea no vacía de la fuente. |
| `raw_line` | string | Nota original intacta. |

## `data/game_players.csv`

| Campo | Descripción |
|---|---|
| `game_id` | Relación con la partida. |
| `seat_order` | Orden textual, no necesariamente orden real de turnos. |
| `player` | Nombre normalizado. |
| `deck_name_raw` | Nombre como aparece en la nota. |
| `deck_name_normalized` | Alias consolidado para estadísticas. |
| `deck_variant` | Precon, nerfed u otra anotación. |
| `commander_name` | Vacío por ahora. El catálogo es la fuente futura. |
| `result` | `winner`, `loser` o `draw`. |
| `assignment_confidence` | Confianza de la pareja jugador/deck. |
| `notes` | Aclaraciones. |

## `data/events.csv`

| Campo | Descripción |
|---|---|
| `event_type` | Eliminación, rendición, autoeliminación, nuke, Sol Ring T1 o evento especial personalizado. |
| `actor` | Jugador que causa o protagoniza el evento. |
| `target` | Víctima, cuando aplica. |
| `method` | Método normalizado. |
| `notes` | Texto descriptivo. |
| `explicitness` | `explicit` o `inferred`. |

## `data/deck_catalog.csv`

Una fila por combinación de jugador y deck normalizado. `commander_name` está vacío deliberadamente para completarlo después.

## `data/games.json`

Versión anidada recomendada para la web. Los tipos nulos se conservan correctamente, a diferencia de los CSV.
