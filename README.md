this is vibe coded like hell bruv, tampoco confie mucho xddddddddddd





# Estadísticas MTG Commander 2026

Página web estática para explorar partidas de Magic: The Gathering Commander registradas durante 2026. La app carga los datos locales del repositorio, permite filtrar partidas, recalcula KPIs y gráficos, muestra detalles de cada partida y exporta el subconjunto filtrado a CSV.

## Contenido principal

- `index.html`: página principal.
- `styles.css`: estilos responsive y tema oscuro.
- `app.js`: inicialización de la app.
- `js/`: módulos de carga de datos, filtros, estadísticas, gráficos, tablas y exportación.
- `data/games.json`: fuente principal de partidas, participantes y eventos anidados.
- `data/deck_catalog.csv`: catálogo de decks por jugador; `commander_name` se usa cuando esté completado.
- `data/summary.json`: resumen precalculado para referencia.
- `data/quality_issues.csv`: partidas con inferencias o ambigüedades.
- `scripts/validate_data.py`: validación local sin dependencias externas.
- `source/magicpartidas.txt`: fuente original, no se modifica.

## Ejecutar localmente

Valida primero el dataset:

```bash
python scripts/validate_data.py
```

Sirve el repositorio con un servidor estático:

```bash
python -m http.server 8000
```

Abre:

```text
http://localhost:8000/
```

No abras `index.html` directamente como archivo local, porque `fetch()` puede quedar bloqueado por el navegador.

## Uso

La página muestra inicialmente las 74 partidas. Los filtros se combinan y actualizan:

- KPIs de resumen;
- gráficos Chart.js;
- tablas de jugadores, decks e historial;
- gráficos y tabla de matchups deck contra deck;
- panel de calidad de datos;
- exportación CSV.

El control **Mínimo apariciones decks** filtra tanto las gráficas de decks como la tabla de decks. La sección **Matchups** usa combinaciones `jugador + deck`, permite elegir un deck analizado, un rival específico opcional y un mínimo de partidas para mostrar tasas con tamaño de muestra.

Los valores `null`, vacíos o ausentes se muestran como **No registrado**. No se convierten a `false` ni a cero. Esto es importante para campos con poca cobertura como duración, jugador inicial, nuke y Sol Ring turno 1.

## Despliegue en GitHub Pages

La app no requiere backend ni build. Puede publicarse desde la raíz del repositorio en GitHub Pages.

Requisitos:

- mantener `index.html`, `styles.css`, `app.js`, `js/` y `data/` juntos;
- conservar rutas relativas como `./data/games.json`;
- permitir acceso a Chart.js desde CDN;
- publicar desde la rama principal o mover/copiar la misma estructura a `/docs` si se usa esa opción de Pages.

La app no asume que vive en `/`, por lo que funciona bajo una ruta como:

```text
https://usuario.github.io/nombre-repo/
```

## Comprobaciones rápidas

Después de iniciar el servidor:

- sin filtros deben verse 74 partidas;
- `virtual` debe dejar 44 partidas;
- `in_person` debe dejar 30 partidas;
- `draw` debe dejar 1 partida;
- ganador `Cris` debe dejar 1 partida;
- búsqueda `Sol Ring` debe encontrar `G2026-054`;
- `needs_review` debe mostrar `G2026-003`, `G2026-008`, `G2026-049` y `G2026-058`;
- duración debe indicar muestra `n=27`;
- comenzar y ganar debe indicar muestra `n=29`.

## Limitaciones

- Chart.js se carga mediante CDN, así que los gráficos requieren acceso a internet en el navegador.
- `commander_name` está vacío actualmente en el catálogo; cuando se complete en `data/deck_catalog.csv`, la UI lo mostrará sin cambiar JavaScript.
- La web es de solo lectura. La edición de datos y el parser de nuevas notas quedan fuera del alcance inicial.
