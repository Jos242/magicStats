# Roadmap de MTG Commander Stats

Este documento lista ideas aprobadas para seguir evolucionando la pagina. La prioridad practica sigue siendo mantener la app estatica compatible con GitHub Pages y calcular todo desde `data/games.json` mas `data/deck_catalog.csv`.

## Implementado

- Perfil de jugador: decks usados, winrate, forma reciente, rivales frecuentes, eliminaciones hechas/recibidas y ultimas partidas.
- Perfil de deck: apariciones, winrate, pilotos, comandante, links, rendimiento por ubicacion, condiciones de victoria y rivales frecuentes.
- Head-to-head de jugadores: comparar dos jugadores cuando aparecen en la misma partida, incluyendo victorias directas, victorias de terceros y lista de partidas.
- Matchups deck contra deck: tabla, graficos directos y heatmap por `deck_id` canonico.
- Combate: eliminaciones actor -> objetivo, metodos y formas de victoria con muestras registradas.
- Badges y curiosidades: lideres por victorias, diversidad de decks, rachas, nukes, eliminaciones y duracion.
- Reportes por periodo: ranking mensual o del subconjunto filtrado, con cambio contra el mes previo cuando aplica.
- Forma reciente y rachas globales por jugador.
- Reporte de meta: decks mas presentes, decks emergentes, arquetipos/tags si el catalogo los tiene, y tamano de mesa.
- Analisis de orden de turno: `turn_order` explicito cuando exista, inferencia virtual fija `Jairo > Andres > Chepe` / `Jairo > Andres > Cris > Chepe`, y `seat_order` presencial como proxy separado.
- Duracion por jugador/deck con cobertura y muestras, sin convertir faltantes a cero.
- Condiciones de victoria y eliminaciones agrupadas por deck.
- Timeline de ultimas partidas, achievements mensuales y resumen para copiar a Discord.
- Elo experimental multijugador, documentado como exploratorio.
- Metadata manual de deck en `deck_catalog.csv`: `archetype`, `power_level`, `tags` y `colors`, preservada por rebuild y deck review.
- Formulario/importador con `Orden de turno opcional`.

## Pendiente estatico o de baja complejidad

- Mejorar presentacion del resumen para Discord con plantillas por sesion.
- Mostrar filtros rapidos por arquetipo/tag/color cuando el catalogo tenga cobertura suficiente.
- Agregar comparacion por arquetipos y colores una vez que `deck_catalog.csv` tenga metadata consistente.
- Ampliar Moxfield si aparece una fuente estable para brackets/power levels; colores ya se derivan del comandante cuando el endpoint responde.
- Validacion previa al submit: autocompletar jugadores/decks y avisar aliases nuevos antes de generar markdown de issue.

## Pendiente avanzado

- Entrada directa desde web con backend: Firebase, Supabase, Airtable, Google Forms/Sheets u otra opcion. Se deja para ultimo por decision del proyecto.
- Rating mas serio que Elo experimental: definir formula multijugador, tratamiento de pods de 3/4/5, empates y victorias por terceros.
- Temporadas futuras: separar 2026, 2027, playoffs o ligas.
- Dashboard de sesion en vivo si algun dia hay backend.

## Principios

- `data/games.json` sigue siendo la fuente principal.
- `data/deck_catalog.csv` enriquece nombres oficiales, commanders, propietarios, links y metadata manual.
- `null`, texto vacio y campos ausentes significan `No registrado`, nunca `false` ni `0`.
- Toda estadistica incompleta debe mostrar cobertura o tamano de muestra.
- La app debe funcionar con rutas relativas en GitHub Pages.
- No agregar backend hasta que haya una necesidad clara.