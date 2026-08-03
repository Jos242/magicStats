this is vibe coded like hell bruv, tampoco confie mucho xddddddddddd





# Estadísticas MTG Commander 2026

Página web estática para explorar partidas de Magic: The Gathering Commander registradas durante 2026. La app carga los datos locales del repositorio, permite filtrar partidas, recalcula KPIs y gráficos, muestra detalles de cada partida y exporta el subconjunto filtrado a CSV.

## Contenido principal

- `index.html`: página principal.
- `styles.css`: estilos responsive y tema oscuro.
- `app.js`: inicialización de la app.
- `js/`: módulos de carga de datos, filtros, estadísticas, gráficos, tablas y exportación.
- `data/games.json`: fuente principal de partidas, participantes y eventos anidados.
- `data/deck_catalog.csv`: catálogo de identidades de deck, pilotos, dueños, comandante y links externos.
- `data/summary.json`: resumen precalculado para referencia.
- `data/quality_issues.csv`: partidas con inferencias o ambigüedades.
- `scripts/import_issue.py`: importa una partida desde un GitHub Issue Form.
- `scripts/enrich_deck_catalog.py`: completa nombres, comandantes y colores desde links de Moxfield cuando el endpoint los expone.
- `scripts/deck_review.py`: genera/aplica un JSON editable para limpiar identidades de decks.
- `scripts/rebuild_exports.py`: regenera CSVs, catálogo, issues de calidad y resumen desde `games.json`.
- `scripts/validate_data.py`: validación local sin dependencias externas.
- `.github/ISSUE_TEMPLATE/record-match.yml`: formulario para registrar partidas desde GitHub.
- `.github/workflows/import-match.yml`: workflow que abre PRs de partidas nuevas.
- `.github/workflows/enrich-deck-catalog.yml`: workflow manual para enriquecer el catálogo desde Moxfield.
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

La pagina muestra inicialmente las partidas actuales del dataset. Los filtros se combinan y actualizan:

- KPIs de resumen;
- gráficos Chart.js;
- tablas de jugadores, decks e historial;
- gráficos y tabla de matchups deck contra deck;
- reportes avanzados de periodo, meta, orden de turno, duracion, Elo, timeline y achievements;
- gráficos de eliminaciones registradas y formas de victoria;
- panel de calidad de datos;
- exportación CSV.

El control **Mínimo apariciones decks** filtra tanto las gráficas de decks como la tabla de decks. La sección **Matchups** usa `deck_id` canónico: un deck prestado cuenta como el mismo deck real, pero decks distintos con el mismo nombre pueden mantenerse separados con IDs diferentes, como `chepe--yuna` y `jairo--yuna`.

La sección **Eliminaciones** usa solo eventos `elimination` con actor y objetivo registrados. Muestra quién elimina más, quién suele ser eliminado, pares actor -> objetivo, métodos de eliminación y formas de victoria registradas. Las partidas sin eventos o sin condición de victoria no se cuentan como cero.

Un jugador que pierde no necesariamente fue eliminado o se rindió. Si alguien gana con una condición como `Approach of the Second Sun`, los demás participantes quedan como `loser`, pero solo habrá eventos de eliminación/rendición si realmente fueron registrados.

Los valores `null`, vacíos o ausentes se muestran como **No registrado**. No se convierten a `false` ni a cero. Esto es importante para campos con poca cobertura como duración, jugador inicial, nuke y Sol Ring turno 1.

## Reportes avanzados

El tab **Reportes** agrupa analisis que se recalculan con los filtros globales:

- ranking por periodo mensual o por todo el subconjunto filtrado;
- forma reciente por jugador y rachas;
- reporte de meta con presencia de decks, decks emergentes, arquetipos, tags y tamano de mesa;
- analisis de orden de turno: usa `turn_order` si existe y, para partidas virtuales, infiere `Jairo > Andres > Chepe` o `Jairo > Andres > Cris > Chepe`;
- duracion promedio/mediana por jugador y deck, siempre con cobertura `n=`;
- condiciones de victoria y eliminaciones agrupadas por deck;
- rating Elo experimental multijugador;
- achievements mensuales, timeline y resumen listo para copiar a Discord.

El rating Elo es exploratorio: empieza en 1000, usa K=24 por partida y reparte comparaciones pairwise dentro del pod. No reemplaza las estadisticas oficiales de victorias.

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

Campo opcional de orden de turno:

```text
Orden de turno opcional:
Jairo | Andres | Cris | Chepe
```

Si lo dejas vacio en una partida virtual, la web usa la regla fija del grupo para los reportes. En partidas presenciales, el orden solo cuenta como real si se llena este campo.

Formato recomendado para eliminaciones en el formulario:

```text
Chepe | Andres | commander_damage | Chepe mata a Andres.
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

Si un deck no existe en `deck_catalog.csv`, el importador lo agrega como deck nuevo en el PR y marca la partida para revisión manual. Si el nombre existe como una única identidad canónica, el importador puede resolverlo como deck prestado y también lo marca para revisión. Si el nombre es ambiguo, por ejemplo porque hay dos versiones reales de `Yuna`, se debe revisar el PR.

### Catálogo de decks

`deck_id` identifica el deck real. `player` indica quién lo piloteó en partidas registradas y `owner_player` indica de quién es el deck. Por eso `Dinos` puede aparecer en varias filas por piloto, pero compartir `deck_id = jairo--dinos`.

Campos útiles para completar manualmente en `data/deck_catalog.csv`:

```text
official_name
commander_name
moxfield_url
archidekt_url
edhrec_url
archetype
power_level
tags
colors
```

Después de completar esos datos, corre:

```bash
python scripts/rebuild_exports.py
python scripts/validate_data.py
```

El regenerador preserva esos campos cuando vuelve a crear el catálogo.

### Enriquecer decks desde Moxfield

Si pegas un link en `moxfield_url`, puedes intentar completar `official_name`, `commander_name` y `colors` automaticamente. El script tambien llena `tags` o `power_level` solo si Moxfield los devuelve claramente:

```bash
python scripts/enrich_deck_catalog.py
python scripts/rebuild_exports.py
python scripts/validate_data.py
```

Por defecto el script solo rellena campos vacíos. Para probar sin escribir:

```bash
python scripts/enrich_deck_catalog.py --dry-run
```

Para inspeccionar un solo link:

```bash
python scripts/enrich_deck_catalog.py --url https://moxfield.com/decks/IfKVN4kO3UmoSUmRJ7pyig
```

Para limitarlo a un deck:

```bash
python scripts/enrich_deck_catalog.py --deck-id chepe--jin-sakai
```

Si quieres sobrescribir valores existentes:

```bash
python scripts/enrich_deck_catalog.py --overwrite
```

Moxfield no publica una API oficial estable para esto. El script usa endpoints no oficiales y fallback por HTML; si Moxfield bloquea o cambia algo, reporta el error y deja el CSV intacto para esos decks. El fallback HTML normalmente solo puede recuperar nombre del deck/comandante, no colores ni bracket.

En GitHub también existe el workflow manual **Enrich deck catalog**. Sirve para correr el mismo script desde Actions y abrir un PR con los cambios. En issues nuevos puedes llenar los campos `Deck N Moxfield URL opcional`; el workflow de import intentará enriquecer el catálogo automáticamente si Moxfield responde.

### Limpieza manual de identidades de deck

Para revisar y corregir decks manualmente, genera este archivo:

```bash
python scripts/deck_review.py export
```

Eso crea `data/deck_review.json`. Edita principalmente:

- `identities`: un objeto por deck real. Aquí cambias dueño, nombre visible, nombre oficial, comandante y links.
- `assignments`: una fila por combinación `piloto || deck normalizado`. Aquí cambias a qué deck real apunta cada asignación.
- `game_overrides`: casos puntuales por partida si una misma fila de `assignments` necesita separarse solo para un juego específico.

Ejemplo: si `Cris || Dinos` realmente era el deck de Jairo, deja:

```json
{
  "assignment_key": "Cris||Dinos",
  "target_deck_id": "jairo--dinos",
  "target_deck_name_normalized": "Dinos"
}
```

Ejemplo: si una fila fue fusionada por error y debe ser deck distinto, agrega una identidad nueva:

```json
{
  "deck_id": "cris--dinos",
  "owner_player": "Cris",
  "display_name": "Dinos Cris",
  "official_name": "",
  "commander_name": "",
  "moxfield_url": ""
}
```

y apunta la assignment a ese ID:

```json
{
  "assignment_key": "Cris||Dinos",
  "target_deck_id": "cris--dinos",
  "target_deck_name_normalized": "Dinos Cris"
}
```

Antes de escribir cambios puedes probar:

```bash
python scripts/deck_review.py apply --dry-run
```

Para aplicar:

```bash
python scripts/deck_review.py apply
python scripts/validate_data.py
```

Después de aplicar, el script actualiza `data/games.json`, regenera derivados y conserva la metadata de `identities` en `data/deck_catalog.csv`.

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
- `Nukes registrados por` y `Sol Ring turno 1 registrados por`, usando `Otro jugador: Nombre` si el jugador es nuevo.

Ejemplo:

```text
Condición de victoria: Otra condición
Otra condición de victoria: WinReasonX

Eliminaciones:
Juan | Chepe | win_method_x | método nuevo para revisar

Eventos especiales adicionales:
mana_crypt_turn_1 | Juan | Mana Crypt turno 1.
rule_zero |  | Se permitió una regla especial.

Nukes registrados por:
Chepe | Nuke con Cyclonic Rift overload.
Otro jugador: Juan | Nuke con Farewell.

Sol Ring turno 1 registrados por:
Chepe
Paniagua | Sol Ring en turno 1.
```

Los eventos especiales ya conocidos también tienen campos propios:

```text
Nukes registrados por
Sol Ring turno 1 registrados por
```

Esos campos aceptan más de una línea. El JSON conserva todos los registros como eventos anidados en `events[]`. Los campos resumidos `nuke_player` y `sol_ring_t1_player` guardan solo el primer jugador para compatibilidad con la estructura anterior.

### Campos finales del formulario

`Notas` es para ambigüedades que quien revise el PR debe ver, por ejemplo "no estoy seguro del método exacto" o "el orden de eliminaciones puede estar incompleto". Se agrega al campo `notes` de la partida.

`Nota original opcional` es para pegar la nota informal tal como la escribiste en WhatsApp, Discord o papel. Si lo dejas vacío, el importador genera una línea estructurada; si lo llenas, esa línea queda guardada como `raw_line`.

`Revisión manual` fuerza `needs_review: true` aunque el importador no detecte nada raro. Úsalo cuando quieres que Codex o tú revisen la partida antes de mergear el PR.

## Comprobaciones rápidas

Después de iniciar el servidor:

- sin filtros deben verse 76 partidas;
- `virtual` debe dejar 46 partidas;
- `in_person` debe dejar 30 partidas;
- `draw` debe dejar 1 partida;
- ganador `Cris` debe dejar 1 partida;
- búsqueda `Sol Ring` debe encontrar `G2026-054`;
- `needs_review` debe mostrar `G2026-003`, `G2026-008`, `G2026-049`, `G2026-058`, `G2026-075` y `G2026-076`;
- duración debe indicar muestra `n=29`;
- comenzar y ganar debe indicar muestra `n=31`;
- el filtro de deck `Dinos / Jairo` debe incluir partidas donde lo pilotearon Jairo, Paniagua o Cris;
- `Yuna / Chepe` y `Yuna / Jairo` deben aparecer como decks separados.

## Limitaciones

- Chart.js se carga mediante CDN, así que los gráficos requieren acceso a internet en el navegador.
- `commander_name`, `official_name`, links externos, `archetype`, `power_level`, `tags` y `colors` viven en `data/deck_catalog.csv`; Moxfield puede autocompletar parte de eso, y la UI lo muestra sin cambiar JavaScript.
- La web publicada sigue siendo de solo lectura. La entrada dinamica ocurre por GitHub Issues y PRs.
- La entrada directa desde web con backend queda para una fase futura.
