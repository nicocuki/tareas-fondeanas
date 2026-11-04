# Arena Royale: ficha de diseño

Juego de duelos de cartas y torres, pedido de Nico («un Clash Royale»). Es una imitación entre amigos: los nombres,
los números y los dibujos son nuestros, inspirados en las cartas clásicas.

## De dónde salen los números

Las fuentes públicas (wikis y guías) no coinciden entre sí: los valores cambian con el nivel de la carta y con cada
parche de balance (por ejemplo, la velocidad de golpe del Caballero pasó de 1,1 a 1,2 s y la del Montapuercos de 1,5 a 1,6 s).
Por eso **los valores de abajo son nuestros**: parten de lo que se sabe del juego original (costo, a quién ataca, rapidez,
alcance) y se ajustaron a una escala única para que las cartas se lleven bien entre sí y con las torres.
Referencias consultadas: [Cards (Clash Royale wiki)](https://clashroyale.fandom.com/wiki/Cards),
[Knight](https://www.clasher.us/clash-royale/card/Knight), [Archers (Liquipedia)](https://liquipedia.net/clashroyale/Archers),
[guía de tropas](https://www.pocketgamer.com/clash-royale/clash-royale-cheats-and-tips-a-guide-to-every-troop-card-update/).

**Unidades**: la arena es de 18 × 32 casillas. Velocidad en casillas por segundo (lenta 0,75 · media 1 · rápida 1,5 · muy rápida 2).
Alcance medido de borde a borde. Tiempos en segundos. Los golpes a torres con hechizos hacen el **35 %** del daño.

## Las 20 cartas de base

| # | Carta | Elixir | Tipo | Vida | Daño | Golpe | Vel. | Alcance | Ataca a | Particularidad |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Esqueletos | 1 | tropa ×3 | 55 | 55 | 1,0 | 1,5 | 0,6 | suelo | Tres chiquitos y baratos |
| 2 | Duendes | 2 | tropa ×3 | 130 | 80 | 1,1 | 2,0 | 0,6 | suelo | Los más rápidos |
| 3 | Arqueras | 3 | tropa ×2 | 125 | 45 | 0,9 | 1,0 | 5 | suelo y aire | A distancia |
| 4 | Caballero | 3 | tropa | 690 | 79 | 1,2 | 1,0 | 0,8 | suelo | Tanque barato |
| 5 | Flechas | 3 | hechizo | – | 115 | – | – | radio 4 | todo | Cae a los 0,3 s |
| 6 | Mini P.E.K.K.A | 4 | tropa | 610 | 325 | 1,6 | 1,5 | 0,8 | suelo | Pega durísimo |
| 7 | Mosquetera | 4 | tropa | 340 | 100 | 1,0 | 1,0 | 6 | suelo y aire | Larga distancia |
| 8 | Valquiria | 4 | tropa | 880 | 100 | 1,5 | 1,0 | 0,8 | suelo | Daño en círculo a su alrededor (radio 1,8) |
| 9 | Bola de Fuego | 4 | hechizo | – | 330 | – | – | radio 2,5 | todo | Cae a los 0,5 s |
| 10 | Montapuercos | 4 | tropa | 800 | 160 | 1,6 | 2,0 | 0,8 | solo edificios | Salta el río |
| 11 | Bebé Dragón | 4 | tropa aérea | 800 | 100 | 1,5 | 1,5 | 3,5 | suelo y aire | Daño en área (radio 1,5) |
| 12 | Príncipe | 5 | tropa | 1000 | 130 | 1,4 | 1,0 | 0,8 | suelo | Tras 2 s corriendo carga: el doble de velocidad y de daño |
| 13 | Gigante | 5 | tropa | 2000 | 126 | 1,5 | 0,75 | 0,9 | solo edificios | Enorme y lento |
| 14 | Globo Bomba | 5 | tropa aérea | 1000 | 400 | 3,0 | 1,0 | 0,5 | solo edificios | Al caerse suelta una bomba (130, radio 2) |
| 15 | Horda de Esbirros | 5 | tropa aérea ×6 | 90 | 45 | 1,0 | 1,5 | 1,6 | suelo y aire | Seis voladores |
| 16 | Cañón | 3 | edificio | 600 | 80 | 0,9 | – | 5,5 | solo suelo | Dura 30 s y se va gastando |
| 17 | Descarga | 2 | hechizo | – | 80 | – | – | radio 2,5 | todo | Aturde 0,5 s |
| 18 | Mago | 5 | tropa | 340 | 130 | 1,4 | 1,0 | 5,5 | suelo y aire | Daño en área (radio 1,5) |
| 19 | Mortero | 4 | edificio | 700 | 80 | 5,0 | – | 3,5 a 11,5 | solo suelo | No pega cerca; daño en área (1,5); dura 30 s |
| 20 | P.E.K.K.A | 7 | tropa | 3000 | 600 | 1,8 | 0,75 | 0,9 | suelo | El que más pega y más aguanta |

**Torres**: la princesa tiene 1400 de vida, hace 50 cada 0,8 s y alcanza 7,5. El rey tiene 2400, hace 50 cada 1 s y alcanza 7;
el rey está dormido hasta que lo lastiman o cae una de sus princesas. Una princesa vale 1 corona y el rey 3 (si cae el rey, se acaba).

**Reglas de partida**: se empieza con 5 de elixir (máximo 10) y entra 1 cada 2,8 s (el doble en el último minuto).
Tu mano tiene 4 cartas de un mazo de 8; al jugar una entra la siguiente y la usada va al fondo. Las tropas tardan 1 s en
activarse (aparecen «despertando»). Se juega 3 minutos; si hay empate, un minuto extra donde gana quien tira la primera torre.

## Las 30 cartas nuevas

| Carta | Elixir | Tipo | Vida | Daño | Particularidad |
|---|---|---|---|---|---|
| Murciélagos | 2 | tropa aérea ×3 | 62 | 42 | Muy rápidos |
| Lanceros | 2 | tropa ×3 | 110 | 55 | Alcance 3,5, suelo y aire |
| Tronco | 2 | hechizo | – | 130 | Radio 2,2, solo suelo |
| Bandida | 3 | tropa | 400 | 130 | Rápida (1,5) |
| Bombardero | 3 | tropa | 220 | 90 | Bombas en área (1,5), alcance 4,5, solo suelo |
| Gladiador | 3 | tropa | 380 | 110 | Equilibrado |
| Gárgolas | 3 | tropa aérea ×4 | 75 | 48 | Rápidas |
| Mago de Hielo | 3 | tropa | 270 | 50 | Área 1,5; frena 2 s |
| Princesa | 3 | tropa | 200 | 55 | Alcance 9, área 1,5, solo suelo |
| Minero | 3 | tropa | 1000 | 80 | Se pone en cualquier lado de la arena |
| Granizo | 3 | hechizo | – | 70 | Radio 3,2; frena 4 s |
| Curación | 3 | hechizo | – | cura 220 | Radio 3, a tus tropas |
| Barril de Duendes | 3 | hechizo | – | – | Suelta 3 duendes en tu mitad |
| Ariete | 4 | tropa | 800 | 150 | Solo edificios; carga tras 1,5 s |
| Ogro | 4 | tropa | 1100 | 140 | Lento y aguantador |
| Cazador | 4 | tropa | 400 | 130 | Escopeta, alcance 4, suelo y aire |
| Electromago | 4 | tropa | 380 | 90 | Cada golpe aturde 0,5 s |
| Torre Bomba | 4 | edificio | 700 | 60 | Bombas en área al suelo; 30 s |
| Tumba | 4 | edificio | 500 | – | Cada 6 s saca 3 esqueletos; 30 s |
| Torre Tesla | 4 | edificio | 700 | 120 | Suelo y aire; 30 s |
| Veneno | 4 | hechizo | – | 90 × 8 | Radio 3,5, un golpe por segundo |
| Bárbaros | 5 | tropa ×4 | 260 | 75 | Cuatro guerreros |
| Bruja | 5 | tropa | 700 | 85 | Área; cada 7 s invoca 3 esqueletos |
| Verdugo | 5 | tropa | 520 | 120 | Hacha en arco, alcance 4,5, área |
| Cabaña de Duendes | 5 | edificio | 650 | – | Cada 9 s suelta 3 duendes; 30 s |
| Gigante Esqueleto | 6 | tropa | 2100 | 130 | Solo edificios; al caer deja una bomba (350, radio 3) |
| Cohete | 6 | hechizo | – | 800 | Radio 2, cae al segundo |
| Mega Caballero | 7 | tropa | 2800 | 220 | Golpe en área |
| Sabueso de Lava | 7 | tropa aérea | 2400 | 45 | Solo edificios; al caer suelta murciélagos |
| Golem | 8 | tropa | 3600 | 180 | Solo edificios; al romperse suelta 2 golemitas (carta oculta) |

## Modos de elegir las cartas

- **Clásico**: cada uno arma su mazo de 8 en la sala de espera.
- **Doble elección**: te dan a elegir entre 2 cartas, 4 veces. La que no elegís se la queda tu rival: tu mazo son tus 4 elegidas más las 4 que descartó él. Hacen falta equipos parejos.
- **Triple elección**: te dan a elegir entre 3 cartas, 8 veces. Las que no elegís se descartan.

Cada elección tiene 12 segundos (se cuentan para todos a la vez); si se acaba el tiempo se toma la primera opción. Las ofertas salen de la semilla de la sala.

## Cómo se ve cada una (para el dibujo)

Cada carta tiene su dibujo propio en `src/arena/sprites.js`, hecho con formas de canvas y contorno oscuro (estilo animado), y es el mismo en la arena, en la mano, en el mazo y en las salas. En la arena llevan un aro del color del equipo en los pies (azul o rojo). El marco de la carta tiene el color de su rareza (común azul grisáceo, rara naranja, épica violeta) y una gota de elixir con el costo arriba a la izquierda.

1. **Esqueletos**: cráneo blanco hueso, cuerpo flaco del mismo color, ojos negros. Muy chicos.
2. **Duendes**: piel verde, orejas largas y puntiagudas, taparrabos marrón, daga amarilla en la mano.
3. **Arqueras**: pelo rosa, capa verde, arco marrón en la mano.
4. **Caballero**: casco gris, bigote castaño enorme, armadura azulada, espada recta.
5. **Flechas**: lluvia de flechas amarillas con plumas cayendo en un círculo claro.
6. **Mini P.E.K.K.A**: armadura gris azulada, casco con dos cuernos chicos, ojo rosa brillante, espada grande.
7. **Mosquetera**: pelo morado, sombrero azul puntiagudo con pluma, vestido azul y un fusil largo.
8. **Valquiria**: pelo naranja grande y rizado, vestido azul, hacha enorme de dos filos que gira al pegar.
9. **Bola de Fuego**: esfera naranja y roja con cola de llamas; al caer, explosión amarilla y humo.
10. **Montapuercos**: jabalí marrón con un tipo musculoso arriba, cresta negra, martillo grande.
11. **Bebé Dragón**: cuerpo verde azulado, panza clara, cabeza redonda, alitas que aletean, escupe fuego. Vuela (sombra abajo).
12. **Príncipe**: caballo marrón con armadura dorada, jinete con casco dorado y una lanza larga con banderín.
13. **Gigante**: piel naranja, barba roja grande, tronco ancho con cinturón marrón y puños enormes. El más grande de las tropas comunes.
14. **Globo Bomba**: globo rojo grande con calavera pintada, canasto abajo y una bomba negra colgando. Vuela.
15. **Horda de Esbirros**: seis diablitos gris azulado con cuernos, alitas y garras. Vuelan.
16. **Cañón**: caño negro sobre una base de madera con ruedas; gira hacia el enemigo.
17. **Descarga**: rayo celeste y blanco con chispas en un círculo eléctrico.
18. **Mago**: bigote y barba rubios, sombrero y túnica amarillo anaranjado, varita con una llama.
19. **Mortero**: tubo grueso marrón grisáceo inclinado sobre una base de madera, con piedras al lado.
20. **P.E.K.K.A**: armadura grande negro azulada, casco con cuernos, ojo rosa brillante, espada gigante.

## La arena y la interfaz

- **Arena** (18 × 32 casillas, vista desde arriba): pasto a cuadros verde claro y oscuro, senderos de tierra que unen cada torre princesa con su puente y con la torre del rey, un río celeste con olitas y dos puentes de madera
  con barandas, vallas detrás de las torres, y alrededor árboles, arbustos y piedras.
- **Torres**: la princesa es una torre de piedra con una franja y almenas del color del equipo, un cañón negro arriba que apunta al enemigo y un banderín. El rey es un castillo más grande con cuatro torrecitas de techo del equipo, la puerta,
  un escudo con corona dorada abajo y el rey arriba (con corona y capa del equipo); dormido tiene los ojos cerrados y una «Z». Las torres enemigas llevan esquinas rojas; todas tienen barra de vida con su número y una coronita.
- **Pantalla**: el nombre de cada equipo arriba, el reloj al medio (con «Elixir ×2» y «¡Tiempo extra!»), las coronas a la derecha de la arena (rival arriba, vos abajo), y abajo una bandeja de madera oscura con la carta que sigue a la
  izquierda, tus cuatro cartas y la barra de elixir violeta con su gota y «Máx. 10».
- **Quién ataca a quién**: el Gigante, el Montapuercos y el Globo Bomba van siempre a la estructura o torre más cercana (si ponés un cañón o un mortero más cerca que una torre, van ahí).

## Cómo funciona por dentro

Es **lockstep determinista**: las dos pantallas simulan la partida entera a partir de la misma semilla y se pasan solo
las jugadas (`[tick, asiento, carta de la mano, x×10, y×10]`). Si una jugada llega tarde, la pantalla vuelve a un
punto guardado y repite la simulación (rollback). Detalles en `CLAUDE.md`.
