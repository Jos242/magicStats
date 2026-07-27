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
- `scripts/import_issue.py`: importa una partida desde un GitHub Issue Form.
- `scripts/rebuild_exports.py`: regenera CSVs, catálogo, issues de calidad y resumen desde `games.json`.
- `scripts/validate_data.py`: validación local sin dependencias externas.
- `.github/ISSUE_TEMPLATE/record-match.yml`: formulario para registrar partidas desde GitHub.
- `.github/workflows/import-match.yml`: workflow que abre PRs de partidas nuevas.
- `.github/workflows/validate-data.yml`: workflow de validación para pushes y PRs.
- `AGENTS.md`: instrucciones durables para Codex.
- `PROJECT.md`: resumen del proyecto para chats nuevos o colaboradores.
- `source/magicpartidas.txt`: fuente original, no se modifica.

## Ejecutar localmente

Valida primero el dataset:

```bash
python scripts/validate_data.py
```

Si editas `data/games.json`, regenera derivados antes de validar:

```bash
python scripts/rebuild_exports.py
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
- gráficos de eliminaciones registradas y formas de victoria;
- panel de calidad de datos;
- exportación CSV.

El control **Mínimo apariciones decks** filtra tanto las gráficas de decks como la tabla de decks. La sección **Matchups** usa combinaciones `jugador + deck`, permite elegir un deck analizado, un rival específico opcional y un mínimo de partidas para mostrar tasas con tamaño de muestra.

La sección **Eliminaciones** usa solo eventos `elimination` con actor y objetivo registrados. Muestra quién elimina más, quién suele ser eliminado, pares actor -> objetivo, métodos de eliminación y formas de victoria registradas. Las partidas sin eventos o sin condición de victoria no se cuentan como cero.

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

## Agregar partidas desde GitHub

El flujo dinámico recomendado es:

```text
Issue Form -> GitHub Action -> importación -> validación -> Pull Request -> merge
```

Cuando el repo esté en GitHub:

1. Ve a `Issues`.
2. Click `New issue`.
3. Elige `Record Commander match`.
4. Llena una partida por issue.
5. La Action valida el submitter, importa la partida, regenera archivos derivados y abre un PR.
6. Revisa el PR.
7. Si todo se ve bien, haz merge.
8. GitHub Pages se actualizará con la nueva partida.

El workflow permite al dueño del repo por defecto. Para permitir amigos, configura la variable del repositorio:

```text
MATCH_IMPORT_ALLOWED_USERS
```

con usuarios separados por coma o espacios, por ejemplo:

```text
Jos242,ChepeGitHub,JairoGitHub
```

Formato recomendado para eliminaciones en el formulario:

```text
Chepe | Andrés | commander_damage | Chepe mata a Andrés.
Jairo | Chepe | direct_damage
```

Métodos aceptados:

```text
combat_damage
commander_damage
direct_damage
token_damage
mill
unspecified
```

Si un deck no existe en `deck_catalog.csv`, el importador lo agrega como deck nuevo en el PR y marca la partida para revisión manual.

### Opciones "Otro" en el formulario

Los campos de jugador incluyen `Otro jugador`. Si lo seleccionas, llena el campo de texto correspondiente, por ejemplo:

```text
Jugador 1: Otro jugador
Jugador 1 otro: Juan
```

Esto agrega `Juan` a la partida, añade `Juan,Juan` a `data/player_aliases.csv` en el PR y marca la partida para revisión.

También puedes usar valores nuevos en:

- `Otra condición de victoria`;
- métodos de eliminación dentro de `Eliminaciones`;
- `Eventos especiales adicionales`.

Ejemplo:

```text
Condición de victoria: Otra condición
Otra condición de victoria: WinReasonX

Eliminaciones:
Juan | Chepe | win_method_x | método nuevo para revisar

Eventos especiales adicionales:
mana_crypt_turn_1 | Juan | Mana Crypt turno 1.
rule_zero |  | Se permitió una regla especial.
```

Los eventos especiales ya conocidos también tienen campos propios:

```text
Nuke registrado por
Sol Ring turno 1 por
```

Si el jugador de Nuke o Sol Ring es nuevo, selecciona `Otro jugador` y llena el campo `Nuke otro jugador` o `Sol Ring turno 1 otro jugador`.

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
- La web publicada sigue siendo de solo lectura. La entrada dinámica ocurre por GitHub Issues y PRs.
