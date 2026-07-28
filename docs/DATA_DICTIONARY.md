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
| `deck_name_normalized` | Nombre normalizado escrito para esa asignación de piloto/deck. |
| `deck_id` | Identidad canónica del deck real. Puede repetirse entre pilotos si el deck fue prestado. |
| `deck_owner` | Dueño canónico del deck, distinto del piloto cuando aplica. |
| `moxfield_url` | Link de Moxfield usado como semilla para el catálogo, cuando vino del formulario. |
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

Una fila por combinación de piloto y deck normalizado. Varias filas pueden compartir el mismo `deck_id` cuando representan el mismo deck real usado por diferentes pilotos.

| Campo | Descripción |
|---|---|
| `deck_id` | Identidad canónica del deck real. |
| `owner_player` | Dueño del deck. |
| `player` | Piloto que ha usado ese deck en partidas registradas. |
| `deck_name_normalized` | Nombre normalizado para esa asignación. |
| `display_name` | Nombre visible corto. |
| `official_name` | Nombre oficial/apodo elegido por el grupo, opcional. |
| `commander_name` | Comandante real, opcional. |
| `moxfield_url`, `archidekt_url`, `edhrec_url` | Links externos opcionales. |
| `first_played`, `last_played` | Rango de fechas para ese piloto/deck. |
| `games_played`, `wins`, `win_rate` | Estadísticas de ese piloto usando ese deck. |
| `aliases` | Alias observados en fuentes o formularios. |
| `variants` | Variantes textuales observadas. |

Las estadísticas de la web agrupan decks por `deck_id`. `Yuna / Chepe` y `Yuna / Jairo` se mantienen separados porque tienen IDs distintos. `Dinos` se consolida con `deck_id = jairo--dinos` aunque lo hayan jugado otros pilotos.

## `data/games.json`

Versión anidada recomendada para la web. Los tipos nulos se conservan correctamente, a diferencia de los CSV.

## `data/deck_review.json`

Archivo editable generado por `python scripts/deck_review.py export`.

| Sección | Descripción |
|---|---|
| `identities` | Decks reales canónicos. Aquí se corrige `owner_player`, `display_name`, `official_name`, `commander_name` y links. |
| `assignments` | Mapea cada combinación `piloto || deck normalizado` hacia un `target_deck_id`. |
| `game_overrides` | Correcciones puntuales por `game_id` y `seat_order` cuando una assignment completa no basta. |

Después de editarlo, aplica con `python scripts/deck_review.py apply`. El script modifica `data/games.json`, regenera derivados y escribe metadata canónica en `data/deck_catalog.csv`.
