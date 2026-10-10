// Catálogo de juegos: lo usan la portada, el menú, el header y «Cómo jugar».
// Para sumar un juego nuevo: agregalo acá, en el enrutador de App.jsx y en ROOTS (worker/rules.js).
export const GAMES = [
  {
    id: 'la-mecha',
    title: 'La Mecha',
    emoji: '💣',
    color: 'var(--game-mecha)',
    onColor: '#2a1205',
    tagline: 'Escribí antes de que explote',
    description: 'La bomba pasa de mano en mano con unas letras. Escribí una palabra que las tenga antes de que se termine la mecha… y que no te explote a vos.',
    players: '2 a 16',
    duration: '5–10 min',
    input: 'Teclado o celular',
    badge: 'Nuevo',
    howTo: [
      'Todos están en ronda y la bomba pasa de uno a otro.',
      'Cuando te toca, la bomba muestra unas letras (por ejemplo «CAR»).',
      'Escribí una palabra real que las tenga (o que empiece con ellas, según el modo) y apretá Enter.',
      'Si la mecha se termina mientras la tenés vos, perdés una vida. El último que queda, gana.',
      'Las tildes no hacen falta y no se pueden repetir palabras. Si usás todas las letras del abecedario, ganás una vida.',
    ],
  },
  {
    id: 'gartic',
    title: 'Trazo Loco',
    emoji: '🎨',
    color: 'var(--game-gartic)',
    onColor: '#ffffff',
    tagline: 'Teléfono descompuesto con dibujos',
    description: 'Escribí una frase, alguien la dibuja, otro adivina qué es… y al final se ve cómo se fue deformando la idea.',
    players: '3 a 20',
    duration: '10–20 min',
    input: 'Mouse o dedo',
    howTo: [
      'Cada uno escribe una frase para empezar su cadena.',
      'La frase pasa al siguiente, que la tiene que dibujar.',
      'El siguiente ve solo el dibujo y escribe qué cree que es.',
      'Se alterna así hasta que cada cadena pasó por todos.',
      'Al final se revelan las cadenas, paso por paso.',
    ],
  },
  {
    id: 'codigo-secreto',
    title: 'Código Secreto',
    emoji: '🕵️',
    color: 'var(--game-codigo)',
    onColor: '#ffffff',
    tagline: 'Espías, pistas y palabras',
    description: 'Dos a cuatro equipos. El espía da una pista de una palabra y su equipo tiene que encontrar las suyas sin tocar la bomba.',
    players: '4 a 20',
    duration: '15–30 min',
    input: 'Cualquier pantalla',
    howTo: [
      'Se arman equipos, cada uno con un espía y uno o más agentes.',
      'Solo los espías ven de qué equipo es cada palabra.',
      'El espía da una pista de una sola palabra y un número: «playa 3».',
      'Los agentes eligen casillas: el número es la cantidad de intentos.',
      'Gana el equipo que descubre todas sus palabras. ¡Cuidado con la bomba!',
    ],
  },
  {
    id: 'cafe-o-te',
    title: 'Café o Té',
    emoji: '☕',
    color: 'var(--game-cafe)',
    onColor: '#2b1a07',
    tagline: 'Adivinar eligiendo entre dos',
    description: 'Los pensadores de los dos equipos acuerdan una palabra secreta. Cada adivinador se acerca a ella propuesta a propuesta: «¿café o té?».',
    players: '4 (2 vs 2)',
    duration: '10 min',
    input: 'Cualquier pantalla',
    howTo: [
      'Dos equipos: en cada uno hay un pensador y un adivinador.',
      'Los dos pensadores acuerdan una palabra secreta (proponen y se dan me gusta).',
      'Cada pensador arranca con una palabra cualquiera.',
      'Su adivinador propone otra, y el pensador se queda con la que está más cerca de la secreta.',
      'Así hasta que el pensador elige la palabra secreta: en modo tiempo gana el primero; en modo contador, el que usó menos intentos.',
    ],
  },
  {
    id: 'futbol',
    title: 'Fútbol',
    emoji: '⚽',
    color: 'var(--game-futbol)',
    onColor: '#04210f',
    tagline: 'Fútbol 2D con física real',
    description: 'Dos equipos, una pelota y mucho caos. Con pelotas clásicas o con autos que derrapan, en el modo coches.',
    players: '1 a 20',
    duration: '3–10 min',
    input: 'Teclado',
    badge: 'Beta',
    howTo: [
      'Movete con WASD o con las flechas y pateá con Espacio.',
      'Si el anfitrión activa la estámina, Shift es correr.',
      'En modo coches: W acelera, Shift es turbo, Control derrapa y Espacio salta.',
      'Gana el equipo con más goles al terminar el reloj (o el primero en llegar a la meta de goles).',
      'También hay 1 contra 1 en la misma compu (el segundo usa flechas y Enter) y un modo entrenamiento.',
    ],
  },
];

export const gameById = (id) => GAMES.find((g) => g.id === id) || null;

// Código Secreto vive en la raíz del sitio (por compatibilidad con los links viejos).
export function gameUrl(id, code = '') {
  const url = new URL(window.location.origin + '/');
  if (id && id !== 'codigo-secreto') url.searchParams.set('juego', id);
  if (code) url.searchParams.set('sala', code);
  return url.toString();
}
