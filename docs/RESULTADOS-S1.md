# Primer informe del simulador s1

6 de octubre de 2026. Motor s1.0; escenario fijo de cuatro jugadores.

## Método
500 semillas (revision-0 a revision-499), cada una con cooperación y conflicto: 1.000 partidas. Misma preparación para una misma semilla; decisiones diferentes pueden consumir dados diferentes. No se ajustó el reglamento para favorecer victorias. Son heurísticas sin negociación humana.

| Métrica | Cooperación (500) | Conflicto (500) |
|---|---:|---:|
| Éxito grupal | 474 | 454 |
| Rondas medias | 17.39 | 19.73 |
| Empujones totales | 0 | 1445 |
| Arrestos totales | 274 | 301 |
| Rescates totales | 164 | 118 |
| Partidas con SWAT | 457 | 463 |
| Objetivo J1 | 283 | 254 |
| Objetivo J2 | 60 | 85 |
| Objetivo J3 | 425 | 107 |
| Objetivo J4 | 306 | 118 |

Los objetivos de J3/J4 cambian entre perfiles: no son la misma tarea. Personajes, poderes, objetivos y políticas están vinculados; no se puede atribuir superioridad a una carta individual.

## Hallazgos
- SWAT entra en la mayoría de partidas. Revisar detección al entrar más control de seguridad y la capacidad de estos agentes para evitarlo.
- Fantasma (J2) se cumple poco. Puede ser el objetivo, la heurística cautelosa o ambas.
- Éxito grupal alto no equivale a éxito individual: se puede abandonar gente.
- Empujar se ejecuta en situaciones con botín en juego, respeta puertas y aplica efectos de entrada. Conflicto aumenta las rondas medias.
- No generalizar estos resultados a otros mapas ni a 2–8 jugadores.

## Casos incluidos
- Semilla primer-atraco, perfil cooperative: derrota, ronda 28, botín 5/6, 0 empujones, 3 arrestos, 0 rescates.
- Semilla prueba, perfil cooperative: escape, ronda 16, botín 9/6, 0 empujones, 1 arrestos, 1 rescates.
- Semilla conflicto-0, perfil conflict: escape, ronda 22, botín 9/6, 2 empujones, 2 arrestos, 1 rescates.

## Verificación
20 pruebas del motor cubren determinismo, privacidad, acciones ilegales, conservación, capacidad, empujones, trampas, flechas, combate, arresto/rescate, SWAT y salida. Pruebas de navegador cubren ventanas, importación, compatibilidad y todos los pasos incluidos sin scroll interno en escritorio. Lote completo sin errores.

## Próximo experimento
Mejorar una política que use información, humo y ocultamiento antes de alterar dificultades. Luego comparar las mismas semillas con detección sólo en seguridad frente a detección actual. Versionar cambios de reglas y políticas.
