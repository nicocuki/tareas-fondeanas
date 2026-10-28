// T.E.G.: el mapa, los continentes, las cartas y los objetivos. Datos puros, sin lógica de partida (esa está en game.js).
// Los 50 países, los 6 continentes y sus bonus son los del T.E.G. de mesa; los vecinos y las posiciones del dibujo son nuestros.

export const CONTINENTS = {
  norteamerica: { name: 'América del Norte', bonus: 5, color: '#e6c27a', label: [200, 28] },
  sudamerica: { name: 'América del Sur', bonus: 3, color: '#9fd08a', label: [290, 560] },
  europa: { name: 'Europa', bonus: 5, color: '#a9b8e8', label: [495, 28] },
  africa: { name: 'África', bonus: 3, color: '#e9a97a', label: [580, 548] },
  asia: { name: 'Asia', bonus: 7, color: '#d9a0c9', label: [735, 58] },
  oceania: { name: 'Oceanía', bonus: 2, color: '#8fd3cf', label: [870, 568] },
};

// [id, nombre, continente, x, y]: la posición es dentro de un dibujo de 1000 × 600.
const RAW = [
  ['alaska', 'Alaska', 'norteamerica', 60, 100],
  ['yukon', 'Yukón', 'norteamerica', 140, 78],
  ['canada', 'Canadá', 'norteamerica', 225, 88],
  ['labrador', 'Labrador', 'norteamerica', 305, 108],
  ['groenlandia', 'Groenlandia', 'norteamerica', 375, 48],
  ['terranova', 'Terranova', 'norteamerica', 350, 160],
  ['oregon', 'Oregón', 'norteamerica', 150, 150],
  ['nuevayork', 'Nueva York', 'norteamerica', 250, 165],
  ['california', 'California', 'norteamerica', 135, 218],
  ['mexico', 'México', 'norteamerica', 195, 272],
  ['colombia', 'Colombia', 'sudamerica', 250, 335],
  ['peru', 'Perú', 'sudamerica', 235, 405],
  ['brasil', 'Brasil', 'sudamerica', 325, 385],
  ['chile', 'Chile', 'sudamerica', 235, 480],
  ['argentina', 'Argentina', 'sudamerica', 290, 490],
  ['uruguay', 'Uruguay', 'sudamerica', 350, 450],
  ['islandia', 'Islandia', 'europa', 440, 75],
  ['granbretana', 'Gran Bretaña', 'europa', 470, 135],
  ['suecia', 'Suecia', 'europa', 545, 75],
  ['francia', 'Francia', 'europa', 485, 200],
  ['espana', 'España', 'europa', 445, 255],
  ['italia', 'Italia', 'europa', 545, 225],
  ['alemania', 'Alemania', 'europa', 535, 150],
  ['polonia', 'Polonia', 'europa', 600, 175],
  ['rusia', 'Rusia', 'europa', 650, 115],
  ['sahara', 'Sahara', 'africa', 475, 320],
  ['egipto', 'Egipto', 'africa', 555, 300],
  ['etiopia', 'Etiopía', 'africa', 595, 360],
  ['zaire', 'Zaire', 'africa', 540, 400],
  ['sudafrica', 'Sudáfrica', 'africa', 560, 465],
  ['madagascar', 'Madagascar', 'africa', 640, 450],
  ['turquia', 'Turquía', 'asia', 640, 235],
  ['israel', 'Israel', 'asia', 625, 285],
  ['arabia', 'Arabia', 'asia', 685, 330],
  ['iran', 'Irán', 'asia', 705, 265],
  ['aral', 'Aral', 'asia', 730, 180],
  ['tartaria', 'Tartaria', 'asia', 790, 130],
  ['taimir', 'Taimir', 'asia', 830, 60],
  ['siberia', 'Siberia', 'asia', 880, 105],
  ['kamchatka', 'Kamchatka', 'asia', 940, 70],
  ['mongolia', 'Mongolia', 'asia', 865, 180],
  ['japon', 'Japón', 'asia', 940, 200],
  ['gobi', 'Gobi', 'asia', 800, 205],
  ['china', 'China', 'asia', 810, 265],
  ['india', 'India', 'asia', 745, 310],
  ['malasia', 'Malasia', 'asia', 835, 335],
  ['sumatra', 'Sumatra', 'oceania', 775, 410],
  ['borneo', 'Borneo', 'oceania', 860, 400],
  ['java', 'Java', 'oceania', 815, 460],
  ['australia', 'Australia', 'oceania', 910, 505],
];

export const COUNTRIES = RAW.map(([id, name, continent, x, y]) => ({ id, name, continent, x, y }));
export const COUNTRY_COUNT = COUNTRIES.length;
export const indexOf = Object.fromEntries(COUNTRIES.map((c, i) => [c.id, i]));
export const countriesOf = (continent) => COUNTRIES.flatMap((c, i) => (c.continent === continent ? [i] : []));

// Fronteras. El tercer valor marca las que cruzan el mar (se dibujan punteadas).
const LINK_LIST = [
  ['alaska', 'yukon'], ['alaska', 'oregon'], ['alaska', 'kamchatka', 'sea'],
  ['yukon', 'oregon'], ['yukon', 'canada'],
  ['oregon', 'canada'], ['oregon', 'nuevayork'], ['oregon', 'california'],
  ['canada', 'nuevayork'], ['canada', 'terranova'], ['canada', 'labrador'],
  ['nuevayork', 'terranova'], ['nuevayork', 'california'], ['nuevayork', 'mexico'],
  ['california', 'mexico'], ['terranova', 'labrador'], ['labrador', 'groenlandia'],
  ['groenlandia', 'islandia', 'sea'], ['mexico', 'colombia'],
  ['colombia', 'peru'], ['colombia', 'brasil'], ['peru', 'brasil'], ['peru', 'chile'], ['peru', 'argentina'],
  ['chile', 'argentina'], ['argentina', 'brasil'], ['argentina', 'uruguay'], ['brasil', 'uruguay'], ['brasil', 'sahara', 'sea'],
  ['islandia', 'granbretana', 'sea'], ['islandia', 'suecia', 'sea'],
  ['granbretana', 'francia', 'sea'], ['granbretana', 'alemania', 'sea'],
  ['suecia', 'alemania'], ['suecia', 'rusia'],
  ['francia', 'espana'], ['francia', 'italia'], ['francia', 'alemania'], ['espana', 'sahara', 'sea'],
  ['italia', 'alemania'], ['italia', 'polonia'], ['italia', 'egipto', 'sea'],
  ['alemania', 'polonia'], ['polonia', 'rusia'], ['polonia', 'turquia'],
  ['rusia', 'turquia'], ['rusia', 'iran'], ['rusia', 'aral'],
  ['sahara', 'egipto'], ['sahara', 'etiopia'], ['sahara', 'zaire'],
  ['egipto', 'etiopia'], ['egipto', 'israel'],
  ['etiopia', 'zaire'], ['etiopia', 'sudafrica'], ['etiopia', 'madagascar', 'sea'], ['etiopia', 'arabia', 'sea'],
  ['zaire', 'sudafrica'], ['sudafrica', 'madagascar', 'sea'],
  ['turquia', 'israel'], ['turquia', 'iran'], ['israel', 'arabia'], ['israel', 'iran'], ['arabia', 'iran'],
  ['iran', 'aral'], ['iran', 'india'], ['aral', 'india'], ['aral', 'china'], ['aral', 'tartaria'],
  ['india', 'china'], ['india', 'malasia'], ['china', 'malasia'], ['china', 'gobi'], ['china', 'tartaria'],
  ['gobi', 'tartaria'], ['gobi', 'mongolia'], ['tartaria', 'siberia'], ['tartaria', 'taimir'], ['taimir', 'siberia'],
  ['siberia', 'mongolia'], ['siberia', 'kamchatka'], ['mongolia', 'kamchatka'],
  ['mongolia', 'japon', 'sea'], ['kamchatka', 'japon', 'sea'],
  ['malasia', 'sumatra', 'sea'], ['malasia', 'borneo', 'sea'],
  ['sumatra', 'java'], ['borneo', 'java'], ['borneo', 'australia'], ['java', 'australia'],
];

export const LINKS = LINK_LIST.map(([a, b, sea]) => ({ a: indexOf[a], b: indexOf[b], sea: Boolean(sea) }));
export const NEIGHBORS = COUNTRIES.map(() => []);
for (const { a, b } of LINKS) {
  NEIGHBORS[a].push(b);
  NEIGHBORS[b].push(a);
}
export const areNeighbors = (a, b) => NEIGHBORS[a]?.includes(b) || false;

// Cartas: una por país (el símbolo se reparte de a tres) y dos comodines.
export const SYMBOLS = ['cannon', 'ship', 'balloon'];
export const SYMBOL_NAMES = { cannon: 'Cañón', ship: 'Barco', balloon: 'Globo', wild: 'Comodín' };
export const SYMBOL_ICONS = { cannon: '💣', ship: '⛵', balloon: '🎈', wild: '⭐' };
export const WILD_CARDS = [COUNTRY_COUNT, COUNTRY_COUNT + 1];
export const CARD_COUNT = COUNTRY_COUNT + 2;
export const cardSymbol = (card) => (card >= COUNTRY_COUNT ? 'wild' : SYMBOLS[card % 3]);

// Los colores de los ejércitos (cada jugador, el suyo).
export const ARMY_COLORS = [
  { name: 'Rojo', color: '#d64545', ink: '#fff' },
  { name: 'Azul', color: '#3a7bd5', ink: '#fff' },
  { name: 'Amarillo', color: '#e8c21a', ink: '#241b05' },
  { name: 'Verde', color: '#3fa34d', ink: '#fff' },
  { name: 'Negro', color: '#262626', ink: '#fff' },
  { name: 'Magenta', color: '#c44bb0', ink: '#fff' },
];

// Objetivos secretos. `all`: continentes enteros; `some`: cuántos países de un continente; `total`: cantidad de países
// (con `armies` los ejércitos que tiene que haber en cada uno); `destroy`: el color a eliminar.
export const OBJECTIVES = [
  { id: 't1', text: 'Ocupar África, 5 países de América del Norte y 7 países de Europa', all: ['africa'], some: { norteamerica: 5, europa: 7 } },
  { id: 't2', text: 'Ocupar Europa, 4 países de Asia y 2 países de América del Sur', all: ['europa'], some: { asia: 4, sudamerica: 2 } },
  { id: 't3', text: 'Ocupar Asia y 2 países de América del Sur', all: ['asia'], some: { sudamerica: 2 } },
  { id: 't4', text: 'Ocupar América del Norte, 2 países de Oceanía y 4 países de África', all: ['norteamerica'], some: { oceania: 2, africa: 4 } },
  { id: 't5', text: 'Ocupar Oceanía, América del Sur, 4 países de América del Norte y 3 países de Europa', all: ['oceania', 'sudamerica'], some: { norteamerica: 4, europa: 3 } },
  { id: 't6', text: 'Ocupar América del Sur, África y 5 países de Asia', all: ['sudamerica', 'africa'], some: { asia: 5 } },
  { id: 't7', text: 'Ocupar América del Norte y Europa', all: ['norteamerica', 'europa'], some: {} },
  { id: 't8', text: 'Ocupar Asia y Oceanía', all: ['asia', 'oceania'], some: {} },
  { id: 'a24', text: 'Ocupar 24 países', total: 24 },
  { id: 'a18', text: 'Ocupar 18 países, con al menos 2 ejércitos en cada uno', total: 18, armies: 2 },
  ...ARMY_COLORS.map((c, i) => ({ id: `d${i}`, text: `Destruir al ejército ${c.name.toLowerCase()}`, destroy: i })),
];
// El objetivo que tienen todos de entrada y al que pasa quien debía destruir a un color que eliminó otro.
export const COMMON_OBJECTIVE = { id: 'c30', text: 'Ocupar 30 países', total: 30 };
export const objectiveById = (id) => (id === COMMON_OBJECTIVE.id ? COMMON_OBJECTIVE : OBJECTIVES.find((o) => o.id === id) || COMMON_OBJECTIVE);
