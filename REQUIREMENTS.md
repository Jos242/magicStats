# Requerimientos: página de estadísticas MTG Commander

## 1. Contexto del proyecto

El repositorio contiene notas de partidas de Magic: The Gathering Commander jugadas durante 2026. Las notas originales fueron escritas rápidamente y no siguen un formato completamente consistente.

El patrón más común es:

```text
nombreDeck nombreJugador nombreDeck nombreJugador ... / ganador
```

Ejemplo conceptual:

```text
dinos(Pani) dragones(Jairo) gato andres Sauron chepe / gano chepe
```

También pueden aparecer:

- hora inicial y final;
- quién comenzó;
- si alguien usó un “nuke”;
- Sol Ring en turno 1;
- quién eliminó a quién;
- daño de comandante, daño de combate, mill, tokens, daño directo o rendiciones;
- variantes del deck entre paréntesis;
- typos y nombres pegados.

La ausencia de metadata opcional **no significa que el evento no ocurrió**. Significa que no fue registrado.

## 2. Objetivo

Construir una página estática, sencilla, rápida y responsive, desplegable en GitHub Pages, que permita explorar las partidas, filtrar estadísticas y entender qué datos tienen cobertura suficiente.

No se requiere backend, autenticación ni base de datos.

## 3. Archivos de datos

Usar como fuente principal:

```text
data/games.json
```

Archivos auxiliares:

- `data/deck_catalog.csv`: catálogo de decks y futura columna de comandante real.
- `data/summary.json`: resumen precalculado; no debe ser la única fuente de verdad.
- `data/quality_issues.csv`: partidas ambiguas.
- `data/schema.json`: esquema básico.
- CSV relacionales para exportación o depuración.

No modificar `source/magicpartidas.txt`.

## 4. Stack requerido

Implementación preferida:

- HTML semántico;
- CSS propio;
- JavaScript modular sin framework;
- Chart.js 4 mediante CDN para gráficos;
- sin servidor;
- sin claves de API;
- sin pasos de build obligatorios.

La página debe funcionar con un servidor estático y rutas relativas, por ejemplo:

```js
fetch("./data/games.json")
```

## 5. Estructura sugerida

```text
/
├── index.html
├── styles.css
├── app.js
├── js/
│   ├── data.js
│   ├── filters.js
│   ├── stats.js
│   ├── charts.js
│   ├── table.js
│   └── utils.js
├── data/
│   └── ...
├── README.md
└── REQUIREMENTS.md
```

No es obligatorio usar exactamente estos módulos, pero evitar un único archivo JavaScript gigante.

## 6. Modelo y semántica

### Partida

Una partida contiene fecha, ubicación, participantes, ganador o empate, metadata temporal, condición de victoria, eventos, texto original y nivel de confianza.

### Participación

Cada participante tiene:

- jugador;
- deck original;
- deck normalizado;
- variante;
- comandante real, actualmente vacío;
- resultado;
- confianza de asignación.

### Eventos

Pueden existir eventos como:

- `elimination`;
- `self_elimination`;
- `concession`;
- `nuke`;
- `sol_ring_turn_1`.

### Valores desconocidos

Tratar `null`, `""` o campo ausente como **desconocido/no registrado**.

Nunca convertir metadata desconocida a `false`.

Ejemplo incorrecto:

```js
const usedNuke = game.nuke_recorded ?? false;
```

Ejemplo correcto:

```js
const hasNukeData = game.nuke_recorded !== null;
```

## 7. Vistas requeridas

### 7.1 Resumen

Mostrar como mínimo:

- total de partidas;
- partidas presenciales y virtuales;
- número de jugadores;
- total de empates;
- duración promedio, acompañada del tamaño de muestra;
- porcentaje o indicador de cobertura de jugador inicial;
- cantidad de partidas que necesitan revisión.

### 7.2 Jugadores

Para cada jugador:

- partidas jugadas;
- victorias;
- tasa de victoria = victorias / partidas participadas;
- victorias presenciales y virtuales;
- decks utilizados;
- deck más jugado;
- deck con más victorias;
- duración promedio de sus partidas únicamente donde exista duración.

No ocultar jugadores con pocas partidas, pero mostrar el tamaño de muestra.

### 7.3 Decks

Para cada combinación `jugador + deck normalizado`:

- apariciones;
- victorias;
- tasa de victoria;
- primera y última fecha;
- variantes registradas;
- comandante real si está disponible;
- aliases originales.

No mezclar automáticamente decks de distintos jugadores solo porque compartan nombre.

### 7.4 Historial de partidas

Tabla ordenable con:

- fecha;
- ubicación;
- participantes y decks;
- ganador o empate;
- duración;
- quién comenzó;
- condición de victoria;
- confianza de parseo;
- indicador de revisión.

Cada fila debe poder expandirse o abrir un modal con:

- línea original;
- notas;
- eventos;
- asignaciones de deck;
- campos faltantes.

### 7.5 Calidad de datos

Incluir una sección o panel con:

- cantidad de partidas por nivel de confianza;
- partidas `needs_review`;
- cobertura de duración;
- cobertura de jugador inicial;
- cobertura de condición de victoria;
- cobertura de eventos especiales;
- explicación visible de que “no registrado” no equivale a “no ocurrió”.

## 8. Filtros requeridos

Los filtros deben poder combinarse y actualizar KPIs, gráficos y tabla:

- rango de fechas;
- ubicación: todas, presencial, virtual;
- jugador participante;
- ganador;
- deck normalizado;
- comandante real, cuando exista;
- jugador inicial;
- tipo de resultado: victoria o empate;
- condición de victoria;
- confianza de parseo;
- solo partidas que necesitan revisión.

Agregar:

- botón “Limpiar filtros”;
- contador de partidas visibles;
- búsqueda libre por deck, jugador, notas o línea original.

## 9. Gráficos requeridos

Usar gráficos legibles y no excesivos.

Mínimos:

1. Victorias por jugador.
2. Tasa de victoria por jugador, mostrando `n`.
3. Partidas por fecha o por mes.
4. Distribución presencial vs virtual.
5. Decks más jugados.
6. Rendimiento de decks con un filtro mínimo de apariciones configurable.
7. Distribución de duración usando solo partidas con duración.
8. Relación entre comenzar y ganar usando solo partidas con jugador inicial registrado.

Opcionales útiles:

- condiciones de victoria;
- eliminaciones por jugador;
- matriz “quién eliminó a quién”;
- eventos registrados de nuke y Sol Ring turno 1.

Para metadata escasa, mostrar siempre la cobertura. No presentar un porcentaje de “uso de nuke” sobre las 74 partidas, porque en la mayoría no se registró ese campo.

## 10. Reglas de cálculo

- Una victoria suma únicamente cuando `result_type === "win"` y el jugador coincide con `winner_player`.
- Un empate no suma victoria a nadie.
- La tasa de victoria de jugador es `wins / participations`.
- La tasa de victoria de deck es `wins_with_deck / appearances_with_deck`.
- No incluir decks vacíos en rankings de decks.
- No incluir duraciones nulas en promedio, mediana ni histograma.
- Para “ventaja de empezar”, usar solo partidas decisivas con `starting_player` conocido.
- Todos los gráficos deben respetar los filtros activos.
- La tabla debe mostrar resultados aunque un deck o metadata esté vacío.

## 11. Interfaz y diseño

- Mobile-first.
- Tema oscuro o neutro inspirado en MTG, sin depender de imágenes protegidas.
- Buen contraste y foco de teclado visible.
- Controles con etiquetas accesibles.
- Tooltips en conceptos como “cobertura” y “confianza”.
- No usar tablas demasiado anchas en móvil; permitir tarjetas o scroll horizontal.
- Mantener el estado de filtros al cambiar de sección.
- Formatear nombres y acentos tal como aparecen en los campos normalizados.

## 12. Exportación

Permitir descargar las partidas actualmente filtradas como CSV generado en el navegador.

El CSV filtrado debe incluir al menos:

- game_id;
- date;
- location;
- participants;
- decks;
- winner;
- starting_player;
- duration_minutes;
- win_condition;
- parse_confidence;
- raw_line.

## 13. Comandantes reales

La web debe leer `commander_name` desde el catálogo.

Mientras esté vacío:

- mostrar el nombre interno del deck;
- opcionalmente mostrar “Comandante pendiente” en el detalle;
- no excluir el deck de estadísticas.

Diseñar el código para que completar `commander_name` en el catálogo sea suficiente para que aparezca en la UI sin cambiar JavaScript.

## 14. Manejo de errores

- Mostrar un mensaje amigable si `games.json` no carga.
- Registrar detalles técnicos en consola.
- Validar que el ganador forme parte de los participantes.
- Ignorar una fila inválida en un cálculo sin romper toda la página.
- Mostrar advertencia si el dataset tiene cero partidas.
- Evitar divisiones por cero y valores `NaN`.

## 15. Rendimiento

El dataset actual es pequeño. Aun así:

- cargar datos una sola vez;
- recalcular estadísticas a partir del subconjunto filtrado;
- destruir o actualizar instancias Chart.js para evitar duplicados;
- usar `DocumentFragment` o renderizado eficiente para tablas;
- no cargar librerías grandes innecesarias.

## 16. GitHub Pages

La solución debe funcionar al publicar el repositorio como GitHub Pages desde la rama principal o una carpeta `/docs`.

Todas las rutas deben ser relativas y funcionar también cuando el sitio se publique bajo:

```text
https://usuario.github.io/nombre-repo/
```

No asumir que la página vive en `/`.

## 17. Criterios de aceptación

La tarea se considera completa cuando:

1. `index.html` carga sin errores desde un servidor estático.
2. Los 74 juegos aparecen al no tener filtros.
3. Los KPIs iniciales muestran 30 presenciales, 44 virtuales y 1 empate.
4. Filtrar por jugador cambia KPIs, gráficos y tabla.
5. Filtrar por ubicación funciona junto con otros filtros.
6. Los gráficos de duración indican que usan 27 partidas.
7. El análisis de jugador inicial indica que usa 29 partidas antes de aplicar filtros.
8. Los valores nulos no se cuentan como “no”.
9. La partida con empate no entrega una victoria.
10. Las cuatro partidas prioritarias de revisión son identificables.
11. La tabla permite ver la línea original.
12. La exportación CSV refleja los filtros.
13. La web es usable en móvil.
14. No hay errores de consola en el flujo normal.
15. Las rutas funcionan en un subdirectorio de GitHub Pages.
16. `python scripts/validate_data.py` termina exitosamente.

## 18. Pruebas manuales sugeridas

- Seleccionar `virtual`: deben quedar 44 partidas.
- Seleccionar `in_person`: deben quedar 30.
- Buscar `Sol Ring`: debe aparecer la partida registrada correspondiente.
- Filtrar `needs_review`: deben aparecer 4 partidas.
- Filtrar ganador `Cris`: debe aparecer 1 victoria.
- Filtrar resultado `draw`: debe aparecer 1 partida.
- Filtrar deck `Half-Life`: verificar apariciones de Andrés.
- Abrir una partida con eventos y confirmar que actor, objetivo y método se muestran.
- Abrir una partida sin duración y confirmar que no aparece como 0 minutos.

## 19. Fuera de alcance inicial

- edición desde la web;
- login;
- sincronización con Google Sheets;
- parser automático de nuevas notas;
- base de datos;
- imágenes de cartas;
- integración con Scryfall.

Estas funciones pueden añadirse después sin bloquear la primera versión.
