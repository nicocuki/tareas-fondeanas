// Monopoly: el tablero y los mazos. Datos puros, sin lógica de partida (esa está en game.js).
// Los barrios y los textos de las cartas son nuestros; la estructura (40 casilleros, 28 propiedades,
// precios y alquileres) es la del Monopoly clásico.

export const GO_SALARY = 200;
export const JAIL_POS = 10;
export const JAIL_BAIL = 50;
export const GO_TO_JAIL_POS = 30;
export const PARKING_POS = 20;
export const MAX_HOUSES = 32;  // casas que tiene el banco
export const MAX_HOTELS = 12;  // hoteles que tiene el banco

// Cada color: nombre, tono del tablero y lo que cuesta construir una casa (o el hotel) en esas calles.
export const GROUPS = {
  brown: { name: 'Marrón', color: '#8b5a3c', house: 50 },
  lightblue: { name: 'Celeste', color: '#8fd3f4', house: 50 },
  pink: { name: 'Rosa', color: '#e0509b', house: 100 },
  orange: { name: 'Naranja', color: '#f08a24', house: 100 },
  red: { name: 'Rojo', color: '#d9322f', house: 150 },
  yellow: { name: 'Amarillo', color: '#f2cf3a', house: 150 },
  green: { name: 'Verde', color: '#2e9e5b', house: 200 },
  blue: { name: 'Azul', color: '#2457b5', house: 200 },
};

const street = (name, g, price, rent) => ({ t: 'street', name, g, price, rent });
const station = (name) => ({ t: 'station', name, price: 200 });
const utility = (name, icon) => ({ t: 'utility', name, price: 150, icon });

export const SQUARES = [
  { t: 'go', name: 'Salida' },
  street('La Boca', 'brown', 60, [2, 10, 30, 90, 160, 250]),
  { t: 'chest', name: 'Caja comunal' },
  street('Barracas', 'brown', 60, [4, 20, 60, 180, 320, 450]),
  { t: 'tax', name: 'Impuesto a las Ganancias', price: 200 },
  station('Estación Retiro'),
  street('Parque Patricios', 'lightblue', 100, [6, 30, 90, 270, 400, 550]),
  { t: 'chance', name: 'Suerte' },
  street('Boedo', 'lightblue', 100, [6, 30, 90, 270, 400, 550]),
  street('Almagro', 'lightblue', 120, [8, 40, 100, 300, 450, 600]),
  { t: 'jail', name: 'Cárcel' },
  street('Flores', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  utility('Compañía de Luz', '💡'),
  street('Caballito', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  street('Villa Crespo', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  station('Estación Constitución'),
  street('San Telmo', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { t: 'chest', name: 'Caja comunal' },
  street('Villa Devoto', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  street('Colegiales', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { t: 'parking', name: 'Descanso' },
  street('Villa Urquiza', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { t: 'chance', name: 'Suerte' },
  street('Saavedra', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  street('Núñez', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  station('Estación Once'),
  street('Belgrano', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  street('Barrio Norte', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  utility('Compañía de Aguas', '🚰'),
  street('Palermo', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { t: 'gotojail', name: 'Andá a la cárcel' },
  street('Recoleta', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  street('Palermo Chico', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { t: 'chest', name: 'Caja comunal' },
  street('Av. del Libertador', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  station('Estación Liniers'),
  { t: 'chance', name: 'Suerte' },
  street('Av. Alvear', 'blue', 350, [35, 175, 500, 1100, 1300, 1500]),
  { t: 'tax', name: 'Impuesto al Lujo', price: 100 },
  street('Puerto Madero', 'blue', 400, [50, 200, 600, 1400, 1700, 2000]),
];

export const BUYABLE = ['street', 'station', 'utility'];
export const isBuyable = (pos) => BUYABLE.includes(SQUARES[pos]?.t);
export const STATIONS = SQUARES.flatMap((s, i) => (s.t === 'station' ? [i] : []));
export const UTILITIES = SQUARES.flatMap((s, i) => (s.t === 'utility' ? [i] : []));
export const groupSquares = (g) => SQUARES.flatMap((s, i) => (s.g === g ? [i] : []));
export const GROUP_KEYS = Object.keys(GROUPS);

export const mortgageValue = (pos) => Math.floor(SQUARES[pos].price / 2);
// El 10 % de la hipoteca (redondeado para arriba): lo que se paga de más al levantarla o al recibir una hipotecada.
export const mortgageFee = (pos) => Math.ceil(mortgageValue(pos) / 10);
export const unmortgageCost = (pos) => mortgageValue(pos) + mortgageFee(pos);
export const houseCost = (pos) => GROUPS[SQUARES[pos].g]?.house || 0;

// Cartas. Cada una tiene un efecto `t`:
//   cash n        cobrás (n > 0) o pagás (n < 0) al banco
//   goto to       avanzás hasta ese casillero (si pasás por la Salida, cobrás)
//   back n        retrocedés n casilleros
//   nearest k     avanzás a la estación (alquiler doble) o compañía (10× los dados) más cercana
//   jail          vas a la cárcel
//   jailfree      te la guardás para salir gratis
//   repairs       pagás por cada casa y por cada hotel que tengas
//   eachPay n     le pagás n a cada uno de los demás
//   eachGet n     cada uno de los demás te paga n
export const CARDS = {
  chance: [
    { t: 'goto', to: 0, text: 'Avanzá hasta la Salida y cobrá $200.' },
    { t: 'goto', to: 24, text: 'Avanzá hasta Núñez. Si pasás por la Salida, cobrás $200.' },
    { t: 'goto', to: 11, text: 'Avanzá hasta Flores. Si pasás por la Salida, cobrás $200.' },
    { t: 'goto', to: 39, text: 'Avanzá hasta Puerto Madero.' },
    { t: 'goto', to: 5, text: 'Viajá hasta la Estación Retiro. Si pasás por la Salida, cobrás $200.' },
    { t: 'nearest', k: 'utility', text: 'Avanzá hasta la compañía más cercana. Si no tiene dueño, podés comprarla; si tiene, tirá los dados y pagale 10 veces lo que salga.' },
    { t: 'nearest', k: 'station', text: 'Avanzá hasta la estación más cercana. Si no tiene dueño, podés comprarla; si tiene, pagale el doble del alquiler.' },
    { t: 'nearest', k: 'station', text: 'Avanzá hasta la estación más cercana. Si no tiene dueño, podés comprarla; si tiene, pagale el doble del alquiler.' },
    { t: 'cash', n: 50, text: 'El banco te paga dividendos: cobrá $50.' },
    { t: 'cash', n: 150, text: 'Te vence el plazo fijo: cobrá $150.' },
    { t: 'jailfree', text: 'Salí gratis de la cárcel. Guardá esta carta hasta que la necesites (o vendela en un trato).' },
    { t: 'back', n: 3, text: 'Retrocedé 3 casilleros.' },
    { t: 'jail', text: 'Andá directo a la cárcel. No pasás por la Salida ni cobrás $200.' },
    { t: 'repairs', house: 25, hotel: 100, text: 'Arreglos en tus edificios: pagá $25 por cada casa y $100 por cada hotel.' },
    { t: 'cash', n: -15, text: 'Multa por exceso de velocidad: pagá $15.' },
    { t: 'eachPay', n: 50, text: 'Te eligieron presidente del consorcio: pagale $50 a cada jugador.' },
  ],
  chest: [
    { t: 'goto', to: 0, text: 'Avanzá hasta la Salida y cobrá $200.' },
    { t: 'cash', n: 200, text: 'Error del banco a tu favor: cobrá $200.' },
    { t: 'cash', n: -50, text: 'Honorarios del médico: pagá $50.' },
    { t: 'cash', n: 50, text: 'Vendiste unas acciones: cobrá $50.' },
    { t: 'jailfree', text: 'Salí gratis de la cárcel. Guardá esta carta hasta que la necesites (o vendela en un trato).' },
    { t: 'jail', text: 'Andá directo a la cárcel. No pasás por la Salida ni cobrás $200.' },
    { t: 'cash', n: 100, text: 'Fondo de vacaciones: cobrá $100.' },
    { t: 'cash', n: 20, text: 'Te devuelven impuestos: cobrá $20.' },
    { t: 'eachGet', n: 10, text: 'Es tu cumpleaños: cada jugador te paga $10.' },
    { t: 'cash', n: 100, text: 'Vence tu seguro de vida: cobrá $100.' },
    { t: 'cash', n: -100, text: 'Gastos de hospital: pagá $100.' },
    { t: 'cash', n: -50, text: 'Gastos del colegio: pagá $50.' },
    { t: 'cash', n: 25, text: 'Cobrás $25 por una consultoría.' },
    { t: 'repairs', house: 40, hotel: 115, text: 'Arreglos de las calles: pagá $40 por cada casa y $115 por cada hotel.' },
    { t: 'cash', n: 10, text: 'Ganaste el segundo premio en un concurso: cobrá $10.' },
    { t: 'cash', n: 100, text: 'Te llega una herencia: cobrá $100.' },
  ],
};
export const DECK_NAMES = { chance: 'Suerte', chest: 'Caja comunal' };
export const jailFreeIndex = (deck) => CARDS[deck].findIndex((c) => c.t === 'jailfree');

// Colores de las fichas (cada jugador tiene el suyo).
export const TOKEN_COLORS = ['#e5484d', '#3b82f6', '#f5b82e', '#2fbf71', '#a855f7', '#f97316', '#14b8a6', '#ec4899'];
