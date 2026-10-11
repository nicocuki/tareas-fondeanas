// Catálogo de plantillas de Armá el Meme, elegidas a mano entre las más usadas de Imgflip (las
// imágenes se cargan de i.imgflip.com). Se sacaron las que no se entienden sin contexto, las que
// traen texto en inglés pegado y las de política yanqui.
//
// Cada una dice cómo se usa (`hint`) y dónde va cada texto: `x`/`y` es el centro en % de la imagen,
// `w` el ancho en % y `s` el tamaño de letra (en % del ancho); `k: 1` es letra negra, para cuando el
// fondo es blanco. `label` es lo que se ve en la caja vacía, para que se entienda qué escribir ahí.
const T = (label, x, y, extra = {}) => ({ label, x, y, ...extra });
const TOP = (label) => T(label, 50, 12, { s: 9 });
const BOTTOM = (label) => T(label, 50, 88, { s: 9 });

const LIST = [
  ['181913649', '30b1gx.jpg', 1200, 1200, 'Drake', 'Arriba lo que rechazás, abajo lo que preferís.',
    [T('Lo que no', 75, 25, { w: 48, s: 6.5, k: 1 }), T('Lo que sí', 75, 75, { w: 48, s: 6.5, k: 1 })]],
  ['87743020', '1g8my4.jpg', 600, 908, 'Los dos botones', 'Dos opciones que querés las dos y no podés elegir.',
    [T('Opción 1', 30, 11, { w: 36, s: 5.5, k: 1 }), T('Opción 2', 66, 7, { w: 36, s: 5.5, k: 1 }), T('Quién duda', 50, 90, { s: 7 })]],
  ['112126428', '1ur9b0.jpg', 1200, 800, 'El novio distraído', 'Él mira algo nuevo mientras su novia lo mira mal.',
    [T('Lo nuevo y tentador', 25, 75, { w: 40, s: 5.5 }), T('Vos', 56, 58, { w: 26, s: 5.5 }), T('Lo de siempre', 84, 68, { w: 30, s: 5.5 })]],
  ['217743513', '3lmzyx.jpg', 500, 494, 'UNO: hacé esto o robá 25', 'Algo facilísimo que alguien prefiere no hacer y comerse las 25 cartas.',
    [T('Lo que tenés que hacer', 25, 40, { w: 42, s: 5 }), T('El que prefiere robar 25', 74, 12, { w: 50, s: 6 })]],
  ['252600902', '46e43q.png', 960, 540, 'Siempre lo fue', 'El astronauta descubre algo y el otro le dice que siempre fue así.',
    [T('¿O sea que todo es…?', 30, 22, { w: 52, s: 6 }), T('Siempre lo fue', 75, 12, { w: 45, s: 6 })]],
  ['124822590', '22bdq6.jpg', 804, 767, 'La salida de la autopista', 'El auto dobla de golpe a lo que no debería.',
    [T('Lo correcto', 36, 10, { w: 26, s: 3.6 }), T('Lo tentador', 62, 10, { w: 26, s: 3.6 }), T('Vos', 66, 80, { w: 40, s: 7 })]],
  ['322841258', '5c7lwq.png', 768, 768, 'Anakin y Padmé', 'Él dice algo, ella pregunta ilusionada… y él no contesta.',
    [T('Lo que dice él', 25, 40, { w: 48, s: 5 }), T('Lo que pregunta ella', 75, 40, { w: 48, s: 5 }), T('¿…no?', 75, 92, { w: 48, s: 5 })]],
  ['135256802', '28j0te.jpg', 900, 645, 'El apretón de manos', 'Dos que no tienen nada que ver coinciden en algo.',
    [T('Unos', 20, 70, { w: 36, s: 6 }), T('Otros', 80, 70, { w: 36, s: 6 }), T('En qué coinciden', 50, 22, { w: 40, s: 6 })]],
  ['131940431', '26jxvz.jpg', 700, 449, 'El plan de Gru', 'Un plan de tres pasos donde el último sale mal (y Gru se da cuenta en el cuarto).',
    [T('Paso 1', 37, 25, { w: 22, s: 3.6, k: 1 }), T('Paso 2', 87, 25, { w: 22, s: 3.6, k: 1 }), T('Paso 3', 37, 75, { w: 22, s: 3.6, k: 1 }), T('Paso 3 (otra vez)', 87, 75, { w: 22, s: 3.6, k: 1 })]],
  ['131087935', '261o3j.jpg', 761, 1024, 'El globo que se escapa', 'Querés algo, pero alguien te agarra y no te deja.',
    [T('Vos', 28, 22, { w: 34, s: 5 }), T('Lo que querés', 80, 18, { w: 36, s: 5 }), T('Lo que te frena', 22, 66, { w: 36, s: 5 }), T('Vos', 52, 88, { w: 30, s: 5 }), T('Lo que querés', 82, 72, { w: 32, s: 5 })]],
  ['97984', '23ls.jpg', 500, 375, 'La nena del incendio', 'Ella sonríe como si no hubiera hecho nada.', [TOP('Lo que pasó'), BOTTOM('Lo que hiciste')]],
  ['4087833', '2fm6x.jpg', 298, 403, 'El esqueleto que espera', 'Esperando algo que nunca llega.', [TOP('Yo esperando que…'), BOTTOM('…algo que nunca pasa')]],
  ['80707627', '1c1uej.jpg', 720, 709, 'Pablo Escobar triste', 'Tres momentos de soledad y aburrimiento.',
    [T('Cuando…', 50, 42, { s: 6 }), T('…y…', 25, 92, { w: 48, s: 5 }), T('…y encima…', 75, 92, { w: 48, s: 5 })]],
  ['91538330', '1ihzfe.jpg', 2118, 1440, 'X, X por todos lados', 'Woody ve algo que aparece en todas partes.', [TOP('Algo'), BOTTOM('Algo por todos lados')]],
  ['309868304', '54hjww.jpg', 607, 794, 'Oferta de intercambio', 'Una oferta que le conviene a uno solo.',
    [T('Yo recibo', 25, 34, { w: 46, s: 6 }), T('Vos recibís', 75, 34, { w: 46, s: 6 })]],
  ['124055727', '21uy0f.jpg', 600, 471, '¿No tenés más de eso?', 'Pedís más de algo que te encanta.', [TOP('Cuando probás…'), BOTTOM('¿No tenés más de…?')]],
  ['129242436', '24y43o.jpg', 482, 361, 'Cambiame la opinión', 'Una opinión polémica que defendés.', [T('Tu opinión polémica', 58, 77, { w: 46, s: 5, k: 1 }), TOP('Arriba (opcional)')]],
  ['188390779', '345v97.jpg', 680, 438, 'La mujer le grita al gato', 'Alguien que grita indignado y el gato que no entiende nada.',
    [T('Lo que grita ella', 25, 14, { w: 48, s: 6, k: 1 }), T('Lo que contesta el gato', 75, 14, { w: 48, s: 6, k: 1 })]],
  ['438680', '9ehk.jpg', 400, 387, 'Batman le pega a Robin', 'Robin dice una pavada y Batman lo calla de un cachetazo.',
    [T('Lo que dice Robin', 27, 11, { w: 44, s: 5.5, k: 1 }), T('Lo que contesta Batman', 74, 11, { w: 44, s: 5.5, k: 1 })]],
  ['224015000', '3pdf2w.png', 926, 688, 'Bernie te vuelve a pedir', 'Pidiendo otra vez lo mismo de siempre.', [TOP('Yo'), BOTTOM('Pidiéndote otra vez que…')]],
  ['101470', '26am.jpg', 500, 437, 'Los alienígenas', 'La explicación de todo: fueron los extraterrestres.', [TOP('Algo sin explicación'), BOTTOM('Aliens')]],
  ['79132341', '1b42wl.jpg', 500, 680, 'El de la bici', 'Se arruina solo y le echa la culpa a otro.',
    [T('Vos', 55, 14, { w: 40, s: 5.5 }), T('Lo que te hacés solo', 44, 46, { w: 44, s: 5.5 }), T('A quién le echás la culpa', 50, 92, { s: 5.5 })]],
  ['102156234', '1otk96.jpg', 502, 353, 'Bob Esponja burlón', 'Repetís lo que dijo alguien con voz de burla.', [TOP('Lo que te dicen'), BOTTOM('lO qUe Te DiCeN')]],
  ['100777631', '1o00in.jpg', 1587, 1425, '¿Esto es una paloma?', 'Alguien confunde una cosa con otra.',
    [T('El que confunde', 30, 40, { w: 40, s: 5 }), T('La cosa', 82, 18, { w: 34, s: 5 }), T('¿Esto es…?', 50, 90, { s: 7 })]],
  ['61579', '1bij.jpg', 568, 335, 'Uno no simplemente…', 'Algo que no se hace así nomás.', [TOP('Uno no simplemente'), BOTTOM('…')]],
  ['247375501', '43a45p.png', 937, 720, 'Doge fuerte vs. Cheems', 'Comparación: antes eran unos cracks, ahora son unos flojos.',
    [T('Los de antes', 25, 8, { w: 46, s: 5, k: 1 }), T('Lo que hacían', 25, 88, { w: 46, s: 4.5, k: 1 }), T('Los de ahora', 75, 8, { w: 46, s: 5, k: 1 }), T('Lo que hacen', 75, 88, { w: 46, s: 4.5, k: 1 })]],
  ['177682295', '2xscjb.png', 520, 358, '¿A ustedes les pagan?', 'Cuando descubrís que a otros les dan algo que a vos no.', [TOP('Cuando te enterás…'), BOTTOM('¿A ustedes les…?')]],
  ['180190441', '2za3u1.jpg', 1363, 1524, 'Es la misma foto', 'Dos cosas que parecen distintas pero son lo mismo.',
    [T('Cosa 1', 27, 13, { w: 36, s: 5, k: 1 }), T('Cosa 2', 72, 13, { w: 36, s: 5, k: 1 })]],
  ['67452763', '145qvv.jpg', 598, 420, 'Calamardo en la ventana', 'Mirás a los demás divertirse mientras vos no.',
    [T('Vos', 22, 85, { w: 40, s: 6 }), T('Los que la pasan bien', 68, 30, { w: 50, s: 6 })]],
  ['505705955', '8d317n.png', 936, 725, 'Cine puro', 'Algo tan perfecto que es una obra de arte.', [TOP('Cuando…'), BOTTOM('Cine puro')]],
  ['93895088', '1jwhww.jpg', 857, 1202, 'El cerebro que crece', 'Cuatro ideas, cada una más "inteligente" (o más ridícula) que la anterior.',
    [T('Idea normal', 25, 12, { w: 48, s: 5, k: 1 }), T('Idea mejor', 25, 37, { w: 48, s: 5, k: 1 }), T('Idea brillante', 25, 62, { w: 48, s: 5, k: 1 }), T('Idea de genio', 25, 87, { w: 48, s: 5, k: 1 })]],
  ['28251713', 'gtj5t.jpg', 620, 465, 'Oprah regala', '¡Vos te llevás uno, vos te llevás uno!', [TOP('¡Vos te llevás…!'), BOTTOM('¡Todos se llevan…!')]],
  ['3218037', '1wz1x.jpg', 300, 418, 'Acá iría mi trofeo', 'Acá iría mi premio… si tuviera uno.', [TOP('Acá pondría mi trofeo de…'), BOTTOM('…si tuviera uno')]],
  ['178591752', '2ybua0.png', 800, 582, 'Winnie Pooh de traje', 'Lo mismo dicho normal y dicho fino.',
    [T('Dicho normal', 72, 25, { w: 54, s: 5.5, k: 1 }), T('Dicho fino', 72, 75, { w: 54, s: 5.5, k: 1 })]],
  ['370867422', '64sz4u.png', 540, 540, 'Megamente: ¿no?', 'Megamente se asoma y pregunta: "¿No tenés…?"', [TOP('Arriba (opcional)'), BOTTOM('¿No…?')]],
  ['77045868', '19vcz0.jpg', 624, 352, 'El precio de la historia', 'Una contraoferta ridícula.', [TOP('Lo que ofrecés'), T('Lo mejor que te puedo dar es…', 50, 86, { s: 7 })]],
  ['55311130', 'wxica.jpg', 580, 282, 'Todo bien (todo se prende fuego)', 'Hacerse el tranquilo mientras todo es un desastre.', [TOP('La situación'), BOTTOM('Todo bien')]],
  ['110163934', '1tl71a.jpg', 1654, 930, 'Seguro piensa en otra', 'Ella se imagina lo peor y él en realidad piensa en otra cosa.',
    [T('Lo que piensa ella', 28, 14, { w: 52, s: 5 }), T('Lo que piensa él', 75, 14, { w: 46, s: 5 })]],
  ['533936279', '8tw3vb.png', 675, 499, 'La campana de Gauss', 'El tonto y el genio piensan igual; el del medio se complica.',
    [T('Lo que dice el tonto', 13, 60, { w: 26, s: 4, k: 1 }), T('Lo que dice el del medio', 50, 12, { w: 36, s: 4, k: 1 }), T('Lo que dice el genio', 87, 60, { w: 26, s: 4, k: 1 })]],
  ['284929871', '4pn1an.png', 671, 673, 'Ellos no saben', 'Estás en una fiesta pensando algo que nadie sabe.', [T('Ellos no saben que…', 28, 14, { w: 52, s: 5, k: 1 })]],
  ['171305372', '2tzo2k.jpg', 540, 440, 'El soldado que protege', 'Protegés algo de todo lo que lo ataca.',
    [T('Lo que ataca', 22, 9, { w: 40, s: 5 }), T('Vos', 40, 55, { w: 30, s: 5 }), T('Lo que protegés', 78, 75, { w: 40, s: 5 })]],
  ['354700819', '5v6gwj.jpg', 762, 675, 'Dos en el micro', 'Mismo viaje: uno ve la pared y el otro el paisaje.',
    [T('El que la pasa mal', 26, 22, { w: 46, s: 5 }), T('El que la pasa bien', 74, 22, { w: 46, s: 5 })]],
  ['195515965', '38el31.jpg', 750, 798, 'El payaso que se maquilla', 'Cuatro pasos para terminar haciendo el ridículo.',
    [T('Paso 1', 37, 12, { w: 66, s: 5, k: 1 }), T('Paso 2', 37, 37, { w: 66, s: 5, k: 1 }), T('Paso 3', 37, 62, { w: 66, s: 5, k: 1 }), T('Paso 4', 37, 87, { w: 66, s: 5, k: 1 })]],
  ['148909805', '2gnnjh.jpg', 923, 768, 'El mono que mira de reojo', 'Cuando algo te deja incómodo y mirás para otro lado.', [T('Cuando…', 50, 16, { s: 7, k: 1 })]],
  ['163573', '3i7p.jpg', 500, 366, 'Bob Esponja: imaginación', 'Algo que te ilusiona demasiado.', [TOP('Arriba (opcional)'), BOTTOM('Imaginación')]],
  ['89370399', '1h7in3.jpg', 702, 395, 'Pensalo', 'Un "consejo inteligente" que en realidad es trampa.', [TOP('No podés…'), BOTTOM('…si…')]],
  ['206151308', '3eqjd8.jpg', 600, 551, 'Tres Spider-Man', 'Tres que se acusan entre sí de lo mismo.',
    [T('Uno', 20, 35, { w: 36, s: 5.5 }), T('Otro', 55, 18, { w: 36, s: 5.5 }), T('Otro más', 82, 42, { w: 34, s: 5.5 })]],
  ['1035805', 'm78d.jpg', 500, 649, 'La reunión de oficina', 'El jefe pregunta, dos dicen lo obvio y al que tiene razón lo tiran por la ventana.',
    [T('Lo que pregunta el jefe', 55, 6, { w: 36, s: 3.6, k: 1 }), T('Idea 1', 15, 31, { w: 18, s: 3.2, k: 1 }), T('Idea 2', 33, 31, { w: 18, s: 3.2, k: 1 }), T('La idea buena', 79, 37, { w: 26, s: 3.6, k: 1 })]],
  ['316466202', '58eyvu.png', 1113, 629, '¿Dónde está?', 'Los monos esperando algo que no llega.', [TOP('Esperando…'), BOTTOM('¿Dónde está…?')]],
  ['27813981', 'gk5el.jpg', 480, 601, 'Harold ocultando el dolor', 'Sonreís por fuera, sufrís por dentro.', [TOP('Cuando…'), BOTTOM('…y sonreís igual')]],
  ['84341851', '1e7ql7.jpg', 700, 325, 'Kermit malvado', 'Tu lado oscuro te tienta.',
    [T('Yo', 25, 85, { w: 46, s: 6 }), T('Mi lado oscuro: …', 75, 85, { w: 46, s: 6 })]],
  ['187102311', '33e92f.jpg', 680, 544, 'El dragón de tres cabezas', 'Dos serios y uno que no entiende nada.',
    [T('El serio', 18, 22, { w: 34, s: 5 }), T('El otro serio', 50, 12, { w: 34, s: 5 }), T('El que no entiende', 84, 25, { w: 30, s: 5 })]],
  ['216523697', '3kwur5.jpg', 680, 615, 'Mis amigos odian', 'Ahora todo el grupo odia algo.', [TOP('Mis amigos y yo odiamos…'), BOTTOM('…')]],
  ['166969924', '2reqtg.png', 510, 572, 'Cinta mágica', 'Un problema gigante "arreglado" con lo primero que encontraste.',
    [T('Vos', 25, 12, { w: 44, s: 5.5 }), T('El problema', 72, 30, { w: 46, s: 5.5 }), T('El "arreglo"', 50, 82, { w: 60, s: 5.5 })]],
  ['99683372', '1nck6k.jpg', 640, 631, 'Shaq durmiendo', 'Algo te aburre, pero otra cosa te despierta de golpe.',
    [T('Lo que te aburre', 30, 25, { w: 56, s: 5.5, k: 1 }), T('Lo que te despierta', 30, 75, { w: 56, s: 5.5, k: 1 })]],
  ['259237855', '4acd7j.png', 470, 470, 'Leo se ríe', 'Cuando algo te da muchísima gracia.', [TOP('Cuando…'), BOTTOM('Abajo (opcional)')]],
  ['247113703', '434i5j.png', 920, 1086, 'El tren contra el micro', 'Algo que viene a arrasar con otra cosa.',
    [T('Lo que va a sufrir', 70, 18, { w: 50, s: 5.5 }), T('Lo que viene', 32, 66, { w: 50, s: 5.5 })]],
  ['133946291', '27qxmb.jpg', 1200, 600, 'Yo también soy científico', 'Te hacés el experto en algo.', [T('Cuando…', 50, 10, { s: 7 }), T('Yo también soy medio…', 50, 88, { s: 7 })]],
  ['114585149', '1w7ygt.jpg', 1269, 2825, 'La gaviota que grita', 'Cada vez más fuerte, hasta gritar.',
    [T('Tranqui', 50, 7, { s: 7 }), T('Más fuerte', 50, 32, { s: 7 }), T('Más fuerte todavía', 50, 57, { s: 7 }), T('¡GRITANDO!', 50, 82, { s: 8 })]],
  ['224514655', '3po4m7.jpg', 581, 633, 'La nena que se esconde', 'Te escondés de algo que te está buscando.',
    [T('Lo que te busca', 25, 18, { w: 46, s: 5 }), T('Vos', 72, 18, { w: 50, s: 5 })]],
  ['61585', '1bip.jpg', 475, 562, 'Brian, el de la mala suerte', 'Algo bueno que termina mal.', [TOP('Lo bueno'), BOTTOM('Lo que salió mal')]],
  ['226297822', '3qqcim.png', 640, 881, 'Pánico, calma, pánico', 'Algo te asusta, después te calma, y al final peor.',
    [T('Lo que te asusta', 32, 17, { w: 60, s: 5, k: 1 }), T('Lo que te calma', 32, 50, { w: 60, s: 5, k: 1 }), T('Lo que te asusta más', 32, 83, { w: 60, s: 5, k: 1 })]],
  ['145139900', '2eeunw.jpg', 720, 960, 'Scooby-Doo: el desenmascarado', 'Le sacás la máscara a algo y era otra cosa.',
    [T('Lo que parece', 24, 28, { w: 42, s: 5.5 }), T('Lo que es en realidad', 24, 80, { w: 42, s: 5.5 })]],
  ['221578498', '3nx72a.png', 500, 475, 'Festejando en la tumba', 'Festejás que algo se terminó.', [T('Lo que se terminó', 30, 30, { w: 40, s: 5.5 }), BOTTOM('Yo')]],
  ['162372564', '2oo7h0.jpg', 820, 565, 'El efecto dominó', 'Algo chiquito que termina en algo enorme.',
    [T('Lo chiquito', 75, 85, { w: 40, s: 5 }), T('Lo enorme', 20, 15, { w: 36, s: 5 })]],
  ['110133729', '1tkjq9.jpg', 800, 450, 'Spider-Man se señala', 'Dos que son iguales y se acusan entre sí.',
    [T('Uno', 25, 80, { w: 46, s: 6 }), T('El otro', 75, 80, { w: 46, s: 6 })]],
  ['104893621', '1qg8fp.jpg', 500, 312, 'La muerte golpea puertas', 'Algo que va uno por uno… y la próxima puerta es la tuya.',
    [T('Lo que viene', 60, 90, { w: 34, s: 4.5, k: 1 }), T('Los que ya cayeron', 18, 10, { w: 32, s: 4, k: 1 }), T('El próximo', 87, 10, { w: 24, s: 4, k: 1 })]],
  ['155067746', '2kbn1e.jpg', 1893, 1893, 'Pikachu sorprendido', 'Hacés algo obvio y te sorprende el resultado obvio.',
    [T('Lo que hiciste', 50, 9, { s: 6, k: 1 }), T('Lo que pasó (obvio)', 50, 27, { s: 6, k: 1 })]],
  ['72525473', '176h0h.jpg', 395, 650, '¡Decí la frase, Bart!', 'Todos piden la frase de siempre y Bart la dice sin ganas.',
    [T('¡Decí la frase, Bart!', 50, 6, { s: 7 }), T('La frase', 50, 66, { s: 7 }), T('¡Todos festejan!', 50, 94, { s: 7 })]],
  ['119139145', '1yxkcp.jpg', 600, 446, 'El botón', 'Algo tan irresistible que lo apretás sin pensar.', [T('Lo irresistible', 30, 30, { w: 56, s: 6 }), TOP('Arriba (opcional)')]],
  ['61520', '1bgw.jpg', 552, 414, 'Fry desconfiado', 'No sabés si es una cosa o la otra.', [TOP('No sé si…'), BOTTOM('…o…')]],
  ['5496396', '39t1o.jpg', 600, 400, 'Leo brinda', 'Un brindis por alguien (o por algo).', [TOP('Por…'), BOTTOM('Salud')]],
  ['309668311', '54d9lj.png', 416, 416, 'Los dos caminos', 'Un camino lindo, uno oscuro… y vos en el medio.',
    [T('El camino lindo', 25, 40, { w: 40, s: 5 }), T('El camino oscuro', 75, 40, { w: 40, s: 5 }), T('Vos', 55, 90, { w: 40, s: 5 })]],
  ['123999232', '21tqf4.jpg', 1280, 1236, 'El pergamino de la verdad', 'Encontrás la verdad, no te gusta y la tirás.', [T('La verdad incómoda', 25, 72, { w: 34, s: 4, k: 1 })]],
  ['21735', 'grr.jpg', 568, 700, 'La Roca manejando', 'Ella dice algo que lo deja con cara de pánico.',
    [T('Lo que pregunta él', 87, 15, { w: 21, s: 3.4, k: 1 }), T('Lo que contesta ella', 87, 44, { w: 21, s: 3.4, k: 1 })]],
  ['92084495', '1itoun.jpg', 1024, 768, 'La teoría conspirativa', 'Lo explicás todo con una teoría delirante.', [TOP('Cuando explicás…'), BOTTOM('Abajo (opcional)')]],
  ['16464531', '9sw43.jpg', 600, 600, 'Kermit con el té', 'Tirás un comentario picante y después "pero no es asunto mío".', [TOP('El comentario picante'), BOTTOM('Pero no es asunto mío')]],
  ['342785297', '5o32tt.png', 700, 1000, 'No somos iguales', 'Vos hacés algo, él hace lo mismo pero mejor (o peor).', [TOP('Vos…'), T('Yo…', 50, 70, { s: 8 }), BOTTOM('No somos iguales')]],
];

// Tamaño de letra y ancho por defecto (el clásico: arriba y abajo, de lado a lado).
const DEFAULT_S = 8;
const DEFAULT_W = 92;

export const CATALOG = LIST.map(([id, file, w, h, name, hint, boxes]) => ({
  id, url: `https://i.imgflip.com/${file}`, w, h, name, hint,
  boxes: boxes.map((b) => ({ label: b.label, x: b.x, y: b.y, w: b.w ?? DEFAULT_W, s: b.s ?? DEFAULT_S, ...(b.k && { k: 1 }) })),
}));

const BY_ID = new Map(CATALOG.map((t) => [t.id, t]));
export const findTemplate = (id) => BY_ID.get(String(id)) || null;

// Lo que viaja en la sala: solo lo necesario (el resto se busca en el catálogo por id).
export const toRoomTemplate = (t) => ({ id: t.id, name: t.name, url: t.url, w: t.w, h: t.h, boxes: t.boxes.length });

// Cajas de texto vacías, en las posiciones del catálogo.
export function defaultTexts(template) {
  const entry = findTemplate(template?.id);
  if (entry) return entry.boxes.map(({ x, y, w, s, k }) => ({ t: '', x, y, w, s, ...(k && { k: 1 }) }));
  const n = Math.max(1, template?.boxes || 2);
  if (n <= 2) return [{ t: '', x: 50, y: 12, w: DEFAULT_W, s: 9 }, { t: '', x: 50, y: 88, w: DEFAULT_W, s: 9 }].slice(0, n);
  return Array.from({ length: n }, (_, i) => ({ t: '', x: 50, y: Math.round(10 + (80 * i) / (n - 1)), w: DEFAULT_W, s: 7 }));
}

export const boxLabel = (template, i) => findTemplate(template?.id)?.boxes[i]?.label || `Texto ${i + 1}`;
