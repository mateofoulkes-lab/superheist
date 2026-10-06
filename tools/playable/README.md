# La mesa de Superheist

[Jugá online](https://mateofoulkes-lab.github.io/superheist/tools/playable/).

Un primer escenario completo para una persona y tres jugadores automáticos. El navegador reparte un Personaje, un Poder y un Objetivo personal independientes, más un Equipo por personaje. Sólo ves tu objetivo y tu Equipo; las identidades, poderes y ocupación del inventario ajeno son públicos. Al finalizar se revelan los objetivos.

## Cómo jugar

1. Elegí un nombre para el golpe (es la semilla reproducible) y el perfil de la banda.
2. Seleccioná una sala y elegí tu acción. Tocá una carta, objeto o miniatura para inspeccionarlo y ver las opciones disponibles.
3. Los demás personajes actúan automáticamente; la seguridad responde al finalizar cada ronda. El primer jugador rota.
4. Depositá 6 de botín en el auto, subí con al menos otro jugador y usá Arrancar. Tu objetivo personal puede entrar en conflicto con el plan común.

La mochila empieza con dos espacios, además de uno en cada mano. La mochila grande amplía a cuatro. Reorganizar consume acción; soltar es gratis. El Equipo necesita estar en mano para utilizarlo. Se puede combatir, empujar, rescatar y activar poderes. Los peligros se resuelven al entrar, también por un empujón. Una agresión provoca una posible respuesta del personaje automático si todavía puede alcanzar al atacante.

Los extremos de cada patrulla tienen fichas de color. La flecha de cada guardia señala el próximo paso y se oculta al salir de patrulla. Las puertas, cámaras, bóvedas, botín, reducciones, arrestos y SWAT se actualizan en el tablero.

## Alcance y límites

- Tablero con perspectiva y volumen mediante CSS 3D; vista cenital opcional, movimientos animados, cartas inspeccionables y sonido opcional.
- Un banco fijo de 10 salas más exterior, 4 personajes, 4 poderes, 4 tipos de objetivo y 6 tipos de Equipo. No es todavía todo el contenido del reglamento.
- Usa el motor s1 y sus [reglas provisionales](../../docs/REGLAS-SIMULADOR.md), incluido el límite de 28 rondas. No introduce fiabilidad ni un reloj compartido.
- Los jugadores automáticos usan decisiones por reglas e información limitada. No son personas conectadas ni un modelo de lenguaje; las reacciones son tácticas sencillas, no negociación.
- La partida se guarda automáticamente en este navegador. Cambiar de dispositivo no la transfiere. Sin servidor, cuentas, multijugador ni instalación.
- Los secretos están ocultos en la interfaz, no protegidos contra inspección técnica del navegador. Exportar el Replay entrega una vista completa de la partida, incluso si no terminó.
- El historial completo está en un diálogo. En escritorio, tablero, banda, acciones y mano quedan visibles; en móvil se apilan.

## Archivos

`controller.js` gestiona los turnos, reparto independiente, represalias y guardado sobre `../simulator/engine.js`. `table.js` representa sólo la observación propia y los datos públicos durante la partida; la pantalla final revela objetivos. `table.css` contiene la mesa adaptable. No requiere compilación y se publica directamente en GitHub Pages.

Validación: pruebas de turnos, privacidad de observaciones, inventario, reanudación y 100 partidas completas reproducibles; pruebas de navegador para tamaños de pantalla, movimiento, respuestas, inventario y Replay. Ejecutar `npm test` y `npm run test:ui` desde la raíz.
