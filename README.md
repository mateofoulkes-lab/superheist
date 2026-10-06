# SuperHeist

Prototipo de atracos cooperativos / semicooperativos y herramientas de diseño.

## Primer simulador s1

- **[Simulador](tools/simulator/)**: una partida automática de cuatro jugadores, semilla reproducible, políticas con información parcial, comparación de lotes y descarga JSON.
- **[Replay](tools/game-replay/)**: tablero ajustado a la ventana, inventario, patrullas con flecha, puertas, tiradas y razones. Navegación por paso o ronda; importa JSON y conserva la demo histórica.
- **[Constructor v0.6](tools/bank-builder/)**: herramienta histórica, aún no conectada al motor nuevo. Su biblioteca mantiene reglas antiguas, incluida Fiabilidad. No mezclar sus setups con s1.

Las decisiones ejecutables y sus límites están en [Reglas del simulador](docs/REGLAS-SIMULADOR.md). s1 elimina Fiabilidad, implementa manos/mochila, Empujar, seguridad automática y escape. Sigue siendo un experimento: faltan negociación humana, Labia, ductos, catálogo completo y escalado 2–8.

## Ejecutar localmente

Requiere Node.js 20 o posterior. El motor y la web no necesitan dependencias de producción.

```sh
npm install
npm test
npm run preview
```

Abrir http://127.0.0.1:4173/tools/simulator/ o /tools/game-replay/.

```sh
# Una partida reproducible y su Replay
node scripts/simulate.cjs mi-semilla cooperative partida.json
node scripts/simulate.cjs mi-semilla conflict partida-conflicto.json
# 100 semillas en ambos perfiles, 200 partidas; informe opcional
node scripts/simulate.cjs ensayo batch 100 resultados.json
```

Cada agente recibe una observación filtrada, nunca el estado real completo ni la semilla. Los resultados miden estas heurísticas en este escenario, no diversión ni balance humano. Los replays sí son omniscientes para auditoría. El registro incluye el estado exacto después de cada acción; no se reconstruyen resultados inventando movimientos.

## Verificación de interfaz

```sh
npm run test:ui
```

Usa Playwright y Chrome instalado (o la variable `CHROME_PATH`). Verifica distintas ventanas, navegación, ida al Replay y vuelta, importación y compatibilidad del ejemplo antiguo.

## Publicación

GitHub Pages puede servir la raíz de `main`; no se necesita compilación ni servidor de producción. Cada herramienta tiene `index.html` y `tool.json`. La portada descubre herramientas remotas y conserva accesos locales conocidos.
