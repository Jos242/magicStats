# Roadmap de MTG Commander Stats

Este documento lista ideas aprobadas para seguir evolucionando la pagina. La prioridad practica es mantener la app estatica compatible con GitHub Pages y calcular todo desde `data/games.json` mas `data/deck_catalog.csv`.

## Implementado en esta version

- Perfil de jugador: decks usados, winrate, forma reciente, rivales frecuentes, eliminaciones hechas/recibidas y ultimas partidas.
- Perfil de deck: apariciones, winrate, pilotos, comandante, links, rendimiento por ubicacion, condiciones de victoria y rivales frecuentes.
- Head-to-head de jugadores: comparar dos jugadores cuando aparecen en la misma partida, incluyendo victorias directas, victorias de terceros y lista de partidas.
- Heatmap de matchups deck contra deck: matriz de tasas de victoria y tamanos de muestra para los decks con suficiente aparicion.
- Badges y curiosidades: lideres por victorias, diversidad de decks, rachas, nukes, eliminaciones, duracion y otros logros derivados de datos registrados.

Estos puntos ya existen en la interfaz principal y se recalculan con los filtros globales.

## Siguientes mejoras estaticas

- Ranking por periodo: vistas mensuales o por rango de fechas con cambios de posiciones.
- Forma reciente: ultimas N partidas por jugador/deck y tendencia de winrate.
- Rachas: victorias, derrotas, decks repetidos y jugadores que mas tiempo llevan sin ganar.
- Reporte de meta: decks mas presentes, decks emergentes, decks inactivos, diversidad por sesion.
- Analisis de orden de turno: ventaja del jugador inicial y posicion de asiento cuando haya cobertura suficiente.
- Duracion por jugador/deck: promedios solo con cobertura registrada, sin tratar datos faltantes como cero.
- Condiciones de victoria por deck: ver que decks ganan por combate, combo, Approach, mill, concesiones u otras categorias.
- Eliminaciones por deck: quien elimina usando que deck, y que decks suelen quedar fuera primero cuando hay eventos.
- Vista de timeline: cronologia de partidas con filtros y eventos importantes.
- Estadisticas aleatorias: facts pequenos tipo "deck con mas segundos lugares" cuando el dato exista.

## Ideas divertidas

- Achievements mensuales: premios como mas decks jugados, mas victorias, mas partidas, mejor comeback, mas nukes registrados.
- Rivalidades: pares de jugadores/decks con mas encuentros y resultados mas cerrados.
- Presentacion para Discord: una vista compacta para compartir capturas despues de cada sesion.
- Perfil historico por temporada si despues separan 2026, 2027, etc.

## Ideas avanzadas que podrian requerir decisiones nuevas

- Elo o rating multijugador: requiere definir formula, tratamiento de pods de 3/4/5, empates y victorias por terceros.
- Entrada directa desde web: GitHub Pages no tiene backend; opciones futuras incluyen Firebase, Supabase, Airtable, Google Forms/Sheets o issues de GitHub.
- Validacion previa al submit: autocompletar jugadores/decks y avisar aliases nuevos antes de generar el markdown de issue.
- Sincronizacion mejorada con Moxfield: refrescar nombres, commander, colores, tags y fecha de ultima actualizacion.
- Tags manuales de decks: power level, arquetipo, precon/modificado, tribu, combo, control, casual, etc.
- Comparacion por arquetipos: solo viable si `deck_catalog.csv` incluye tags consistentes.

## Principios para implementar

- `data/games.json` sigue siendo la fuente principal.
- `data/deck_catalog.csv` se usa para enriquecer nombres oficiales, commanders, propietarios y links.
- `null`, texto vacio y campos ausentes significan `No registrado`, nunca `false` ni `0`.
- Toda estadistica incompleta debe mostrar cobertura o tamano de muestra.
- La app debe funcionar con rutas relativas en GitHub Pages.
- No agregar backend hasta que haya una necesidad clara.
