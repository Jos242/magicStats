# Tarea para Codex en VS Code

Construye la página de estadísticas de MTG Commander descrita en `REQUIREMENTS.md`.

Antes de escribir código:

1. Lee `README.md`.
2. Lee completo `REQUIREMENTS.md`.
3. Inspecciona `data/games.json`, `data/deck_catalog.csv`, `data/summary.json` y `docs/DATA_DICTIONARY.md`.
4. Ejecuta `python scripts/validate_data.py`.

Después implementa la web estática en este repositorio.

Restricciones principales:

- sin backend;
- HTML/CSS/JavaScript modular;
- Chart.js mediante CDN;
- rutas relativas compatibles con GitHub Pages en subdirectorios;
- todos los filtros deben actualizar KPIs, gráficos y tabla;
- los valores nulos significan “no registrado”, nunca `false`;
- no modificar `source/magicpartidas.txt`;
- conservar y mostrar la línea original en el detalle;
- agregar exportación CSV del subconjunto filtrado;
- cumplir todos los criterios de aceptación de `REQUIREMENTS.md`.

Al finalizar:

1. Ejecuta nuevamente el validador.
2. Prueba la página con `python -m http.server 8000`.
3. Corrige errores de consola.
4. Actualiza `README.md` con instrucciones de ejecución y despliegue.
5. Resume archivos creados, decisiones y cualquier limitación pendiente.
