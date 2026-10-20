// Cartas de A los Tiros. Los números siguen los del juego en el que se inspira (ROUNDS): cada carta
// cambia las estadísticas del jugador o le suma un efecto. Los nombres y las descripciones son
// nuestros. `statsFor(cards)` arma las estadísticas finales a partir de la lista de cartas elegidas.
//
// Velocidad de ataque: «-50 %» alarga la espera entre tiros ×1,5; «-100 %» la duplica; «+25 %» la
// divide por 1,25. Daño y vida se multiplican. Recarga: segundos que se suman.

export const RARITIES = {
  common: { label: 'Común', weight: 60 },
  uncommon: { label: 'Poco común', weight: 30 },
  rare: { label: 'Rara', weight: 10 },
};

export const KINDS = { bullet: 'Balas', block: 'Escudo', player: 'Jugador' };

export const BASE = {
  hp: 100,
  dmg: 55,
  speed: 1,          // multiplicador de la velocidad de la bala
  size: 1,           // multiplicador del tamaño de la bala
  bullets: 1,        // balas por disparo, en abanico
  spread: 0,         // apertura del abanico (radianes, total)
  burst: 1,          // disparos seguidos por cada gatillo
  inaccuracy: 0,     // desvío al azar de cada bala (radianes)
  ammo: 3,
  reload: 2,         // segundos
  cooldown: 0.3,     // segundos entre gatillos
  bounces: 0,
  bounceSlow: false, // la bala pierde la mitad de la velocidad al rebotar
  lifesteal: 0,      // fracción del daño que se cura el que tira
  poison: 0,         // segundos en los que se reparte el daño (0 = de una)
  slow: 0,           // cuánto frena al que pega (0 a 1)
  explode: 0,        // radio de la explosión al pegar
  timedBomb: false,  // la bala se pega y explota 0,5 s después
  cloud: false,      // deja una nube tóxica
  grow: 0,           // daño extra por cada unidad recorrida
  trickster: 0,      // daño extra por rebote
  homing: false,     // después de rebotar busca al enemigo más cercano
  drill: 0,          // unidades que atraviesa paredes
  remote: false,     // la bala sigue al mouse del que tiró
  knock: 1,          // multiplicador del empujón al pegar
  blockCooldown: 4,
  blockFx: [],       // efectos del escudo: frost, heal, shock, implode, overpower, teleport, reload, bombs,
                     // echo, emp, empower, radar, charge, silence, static, saw, nova
  reloadOnHit: false,
  phoenix: 0,        // revividas por pelea
  bloodRush: false,  // +50 % de velocidad 3 s después de pegar
  chase: false,      // +60 % de velocidad yendo hacia el enemigo
  straight: false,   // la bala no cae
  seek: false,       // la bala busca al enemigo desde que sale
  sneaky: false,     // la bala esquiva el piso
  thrust: 0,         // la bala sigue empujando un rato al que toca
  stun: 0,           // segundos que aturde la bala
  bloodShot: false,  // cada tiro cuesta 10 de vida y no hay espera entre tiros
  shieldsUp: false,  // gastar la última bala te cubre; solo se recarga con el cargador vacío
  brawler: false,    // +200 % de vida por 3 s después de pegar
  chill: 0,          // cuánto frena a los que están cerca (a distancia cero)
  decay: false,      // el daño que recibís entra de a poco, en 4 s
  drain: false,      // le roba vida al que está cerca
  pristine: false,   // +400 % de vida mientras está arriba del 90 %
  abyss: false,      // quieto se carga la Cuenta abisal
  radiance: false,   // mientras recarga suelta ondas que dañan
  refresh: false,    // pegar te devuelve el escudo
};

const atk = (pct) => (s) => { s.cooldown *= pct < 0 ? 1 - pct : 1 / (1 + pct); };
const reload = (sec) => (s) => { s.reload += sec; };
const mul = (key, f) => (s) => { s[key] *= f; };
const add = (key, n) => (s) => { s[key] += n; };
const set = (key, v) => (s) => { s[key] = v; };
const fx = (name) => (s) => { if (!s.blockFx.includes(name)) s.blockFx.push(name); };
const blockCd = (sec) => (s) => { s.blockCooldown += sec; };

// [id, nombre, rareza, tipo, líneas (+ buena, - mala, · efecto), cambios]
const LIST = [
  // ─── Balas · comunes ───
  ['grande', 'Bala grande', 'common', 'bullet', ['· Balas más grandes', '- +0,25 s de recarga'], [mul('size', 1.8), reload(0.25)]],
  ['rafaga', 'Ráfaga', 'common', 'bullet', ['+ +2 balas seguidas', '+ +3 de munición', '- −60 % de daño', '- +0,25 s de recarga'], [add('burst', 2), add('ammo', 3), mul('dmg', 0.4), reload(0.25)]],
  ['fria', 'Balas frías', 'common', 'bullet', ['· Frenan al que tocan (+70 %)', '- +0,25 s de recarga'], [(s) => { s.slow = Math.min(0.9, s.slow + 0.7); }, reload(0.25)]],
  ['combinar', 'Combinar', 'common', 'bullet', ['+ +100 % de daño', '- −2 de munición', '- +0,5 s de recarga'], [mul('dmg', 2), add('ammo', -2), reload(0.5)]],
  ['bolarapida', 'Bola rápida', 'common', 'bullet', ['+ +250 % de velocidad de bala', '- −50 % de velocidad de ataque', '- +0,25 s de recarga'], [mul('speed', 3.5), atk(-0.5), reload(0.25)]],
  ['veneno', 'Veneno', 'common', 'bullet', ['+ +70 % de daño', '· El daño entra de a poco, en 3 s', '+ +30 % de velocidad de recarga'], [mul('dmg', 1.7), set('poison', 3), mul('reload', 1 / 1.3)]],
  ['tirorapido', 'Tiro rápido', 'common', 'bullet', ['+ +150 % de velocidad de bala', '- +0,25 s de recarga'], [mul('speed', 2.5), reload(0.25)]],
  ['pulso', 'Pulso firme', 'common', 'bullet', ['+ +40 % de vida', '+ +100 % de velocidad de bala', '- +0,25 s de recarga'], [mul('hp', 1.4), mul('speed', 2), reload(0.25)]],
  ['retardada', 'Detonación retardada', 'common', 'bullet', ['· La bala se pega y explota a los 0,5 s', '- −15 % de daño', '- +0,25 s de recarga'], [set('timedBomb', true), (s) => { s.explode = Math.max(s.explode, 4); }, mul('dmg', 0.85), reload(0.25)]],
  ['cuerda', 'A toda cuerda', 'common', 'bullet', ['+ +100 % de velocidad de bala', '+ +60 % de daño', '- −100 % de velocidad de ataque', '- +0,5 s de recarga'], [mul('speed', 2), mul('dmg', 1.6), atk(-1), reload(0.5)]],
  ['deslumbrar', 'Deslumbrar', 'common', 'bullet', ['· Las balas aturden al que tocan', '- +0,25 s de recarga'], [add('stun', 0.45), reload(0.25)]],
  ['adelantar', 'Adelantar', 'common', 'bullet', ['+ +100 % de velocidad de bala', '· Las balas van derecho, sin caer', '+ +30 % de velocidad de recarga'], [mul('speed', 2), set('straight', true), mul('reload', 1 / 1.3)]],
  // ─── Balas · poco comunes ───
  ['bombardeo', 'Bombardeo', 'uncommon', 'bullet', ['+ +4 balas por tiro', '+ +5 de munición', '- −70 % de daño', '- +0,25 s de recarga'], [add('bullets', 4), (s) => { s.spread = Math.max(s.spread, 0.9); }, add('ammo', 5), mul('dmg', 0.3), reload(0.25)]],
  ['escopeta', 'Escopeta', 'uncommon', 'bullet', ['+ +4 balas por tiro', '+ +5 de munición', '- −60 % de daño', '- +0,25 s de recarga'], [add('bullets', 4), (s) => { s.spread = Math.max(s.spread, 0.4); }, add('ammo', 5), mul('dmg', 0.4), reload(0.25)]],
  ['plan', 'Planificación', 'uncommon', 'bullet', ['+ +100 % de daño', '- −150 % de velocidad de ataque', '- +0,5 s de recarga'], [mul('dmg', 2), atk(-1.5), reload(0.5)]],
  ['explosivas', 'Explosivas', 'uncommon', 'bullet', ['· Las balas explotan al pegar', '- −100 % de velocidad de ataque', '- +0,25 s de recarga'], [(s) => { s.explode = Math.max(s.explode, 5) + (s.explode ? 1.5 : 0); }, atk(-1), reload(0.25)]],
  ['crecer', 'Crecer', 'uncommon', 'bullet', ['+ Más daño cuanto más lejos va la bala', '- +0,25 s de recarga'], [add('grow', 0.03), reload(0.25)]],
  ['caos', 'Caos', 'uncommon', 'bullet', ['+ +5 rebotes', '- −15 % de daño', '- +0,5 s de recarga'], [add('bounces', 5), mul('dmg', 0.85), reload(0.5)]],
  ['parasito', 'Parásito', 'uncommon', 'bullet', ['+ +25 % de daño', '+ +50 % de robo de vida', '+ +30 % de vida', '· El daño entra de a poco, en 5 s', '- +0,25 s de recarga'], [mul('dmg', 1.25), add('lifesteal', 0.5), mul('hp', 1.3), set('poison', 5), reload(0.25)]],
  ['rebote', 'Rebote', 'uncommon', 'bullet', ['+ +2 rebotes', '+ +25 % de velocidad de ataque', '· Al rebotar pierde la mitad de la velocidad', '- +0,25 s de recarga'], [add('bounces', 2), atk(0.25), set('bounceSlow', true), reload(0.25)]],
  ['lluvia', 'Lluvia de balas', 'uncommon', 'bullet', ['+ +1000 % de velocidad de ataque', '+ +12 de munición', '- −75 % de daño', '- Menos puntería', '- +0,25 s de recarga'], [atk(10), add('ammo', 12), mul('dmg', 0.25), add('inaccuracy', 0.12), reload(0.25)]],
  ['certero', 'Rebote certero', 'uncommon', 'bullet', ['· Después de rebotar va hacia el enemigo', '+ +1 rebote', '- −20 % de daño', '- +0,25 s de recarga'], [set('homing', true), add('bounces', 1), mul('dmg', 0.8), reload(0.25)]],
  ['empuje', 'Empujón', 'uncommon', 'bullet', ['· Las balas empujan fuerte', '- +0,25 s de recarga'], [mul('knock', 3), reload(0.25)]],
  ['saltarina', 'Saltarina', 'uncommon', 'bullet', ['+ +2 rebotes', '+ +25 % de daño', '- +0,25 s de recarga'], [add('bounces', 2), mul('dmg', 1.25), reload(0.25)]],
  ['teledirigida', 'Teledirigidas', 'uncommon', 'bullet', ['· Las balas buscan al enemigo', '- −25 % de daño', '- −50 % de velocidad de ataque', '- +0,25 s de recarga'], [set('seek', true), mul('dmg', 0.75), atk(-0.5), reload(0.25)]],
  ['escurridiza', 'Escurridizas', 'uncommon', 'bullet', ['· Las balas esquivan el piso', '- +0,25 s de recarga'], [set('sneaky', true), reload(0.25)]],
  ['propulsor', 'Propulsor', 'uncommon', 'bullet', ['· Las balas tienen propulsores que empujan al que tocan', '- +0,25 s de recarga'], [add('thrust', 1), reload(0.25)]],
  // ─── Balas · raras ───
  ['taladro', 'Taladro', 'rare', 'bullet', ['· Atraviesa paredes (7 m)', '- +0,25 s de recarga'], [add('drill', 7), reload(0.25)]],
  ['control', 'Control remoto', 'rare', 'bullet', ['· Las balas siguen a tu mouse', '- −40 % de velocidad de bala', '- +0,25 s de recarga'], [set('remote', true), mul('speed', 0.6), reload(0.25)]],
  ['truco', 'Truquero', 'rare', 'bullet', ['+ +80 % de daño por cada rebote', '+ +2 rebotes', '- −20 % de daño', '- +0,5 s de recarga'], [add('trickster', 0.8), add('bounces', 2), mul('dmg', 0.8), reload(0.5)]],
  ['nube', 'Nube tóxica', 'rare', 'bullet', ['· Al pegar deja una nube que daña y frena', '- −25 % de daño', '- −20 % de velocidad de ataque', '- +0,5 s de recarga'], [set('cloud', true), mul('dmg', 0.75), atk(-0.2), reload(0.5)]],
  ['pacto', 'Pacto demoníaco', 'rare', 'bullet', ['· Cada tiro cuesta 10 de vida', '+ Sin espera entre tiros', '+ +9 de munición', '+ Salpica (+2 m de explosión)', '- +0,25 s de recarga'], [set('bloodShot', true), add('ammo', 9), add('explode', 2), reload(0.25)]],
  // ─── Escudo ───
  ['helado', 'Golpe helado', 'common', 'block', ['· Al cubrirte frenás a los que están cerca', '+ +30 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('frost'), mul('hp', 1.3), blockCd(0.25)]],
  ['curativo', 'Campo curativo', 'common', 'block', ['· Al cubrirte dejás un campo que cura', '+ +30 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('heal'), mul('hp', 1.3), blockCd(0.25)]],
  ['onda', 'Onda expansiva', 'uncommon', 'block', ['· Al cubrirte empujás a los que están cerca', '+ +50 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('shock'), mul('hp', 1.5), blockCd(0.25)]],
  ['implosion', 'Implosión', 'uncommon', 'block', ['· Al cubrirte atraés a los que están cerca', '+ +50 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('implode'), mul('hp', 1.5), blockCd(0.25)]],
  ['sobrecarga', 'Sobrecarga', 'uncommon', 'block', ['· Al cubrirte dañás a los de cerca (15 % de tu vida máxima)', '+ +30 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('overpower'), mul('hp', 1.3), blockCd(0.25)]],
  ['defensor', 'Defensor', 'uncommon', 'block', ['+ −30 % de enfriamiento del escudo', '+ +30 % de vida'], [mul('blockCooldown', 0.7), mul('hp', 1.3)]],
  ['teleport', 'Teletransporte', 'rare', 'block', ['· Al cubrirte saltás hacia donde apuntás', '+ −30 % de enfriamiento del escudo'], [fx('teleport'), mul('blockCooldown', 0.7)]],
  ['tactica', 'Recarga táctica', 'rare', 'block', ['· Al cubrirte recargás el arma', '- +0,25 s de enfriamiento del escudo'], [fx('reload'), blockCd(0.25)]],
  ['bombas', '¡Bombas!', 'uncommon', 'block', ['· Al cubrirte tirás un montón de bombitas alrededor', '+ +30 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('bombs'), mul('hp', 1.3), blockCd(0.25)]],
  ['eco', 'Eco', 'uncommon', 'block', ['· Al cubrirte, te cubrís otra vez un instante después', '+ +30 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('echo'), mul('hp', 1.3), blockCd(0.25)]],
  ['pem', 'PEM', 'uncommon', 'block', ['· Al cubrirte soltás un anillo de balas que frenan', '+ +30 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('emp'), mul('hp', 1.3), blockCd(0.25)]],
  ['potenciar', 'Potenciar', 'uncommon', 'block', ['· Cubrirte potencia tu próximo tiro: más daño y velocidad', '· Donde pega, se activan tus efectos de escudo', '- +0,25 s de enfriamiento del escudo'], [fx('empower'), blockCd(0.25)]],
  ['radar', 'Disparo radar', 'uncommon', 'block', ['· Al cubrirte le tirás solo a cada enemigo que se vea', '+ +30 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('radar'), mul('hp', 1.3), blockCd(0.25)]],
  ['embestida', 'Embestida', 'uncommon', 'block', ['· Al cubrirte salís disparado hacia donde apuntás', '· Al terminar, te cubrís otra vez solo', '- +0,25 s de enfriamiento del escudo'], [fx('charge'), blockCd(0.25)]],
  ['silencio', 'Silencio', 'uncommon', 'block', ['· Al cubrirte, los de cerca no pueden tirar ni cubrirse', '+ +25 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('silence'), mul('hp', 1.25), blockCd(0.25)]],
  ['estatico', 'Campo estático', 'uncommon', 'block', ['· Al cubrirte dejás un campo que frena y daña', '- +0,25 s de enfriamiento del escudo'], [fx('static'), blockCd(0.25)]],
  ['sierra', 'Sierra', 'rare', 'block', ['· Al cubrirte te rodea una sierra por un rato', '+ +30 % de vida', '- +0,25 s de enfriamiento del escudo'], [fx('saw'), mul('hp', 1.3), blockCd(0.25)]],
  ['escudoarriba', '¡Escudo arriba!', 'rare', 'block', ['· Gastar la última bala te cubre', '- Solo recargás con el cargador vacío', '- +0,5 s de recarga', '- +0,5 s de enfriamiento del escudo'], [set('shieldsUp', true), reload(0.5), blockCd(0.5)]],
  ['supernova', 'Supernova', 'rare', 'block', ['· Al cubrirte creás un campo que atrae a los enemigos y al rato los aturde', '+ +50 % de vida', '- +0,5 s de enfriamiento del escudo'], [fx('nova'), mul('hp', 1.5), blockCd(0.5)]],
  // ─── Jugador ───
  ['enorme', 'Enorme', 'common', 'player', ['+ +80 % de vida'], [mul('hp', 1.8)]],
  ['sanguijuela', 'Sanguijuela', 'common', 'player', ['+ +75 % de robo de vida', '+ +30 % de vida'], [add('lifesteal', 0.75), mul('hp', 1.3)]],
  ['tanque', 'Tanque', 'common', 'player', ['+ +100 % de vida', '- −25 % de velocidad de ataque', '- +0,5 s de recarga'], [mul('hp', 2), atk(-0.25), reload(0.5)]],
  ['vidrio', 'Cañón de vidrio', 'uncommon', 'player', ['+ +100 % de daño', '- −50 % de vida', '- +0,25 s de recarga'], [mul('dmg', 2), mul('hp', 0.5), reload(0.25)]],
  ['recarga', 'Recarga rápida', 'uncommon', 'player', ['+ −70 % de tiempo de recarga'], [mul('reload', 0.3)]],
  ['carronero', 'Carroñero', 'uncommon', 'player', ['· Pegarle a alguien te recarga el arma', '- +0,5 s de recarga'], [set('reloadOnHit', true), reload(0.5)]],
  ['persecucion', 'Persecución', 'uncommon', 'player', ['+ +60 % de velocidad yendo hacia el enemigo', '+ +30 % de vida'], [set('chase', true), mul('hp', 1.3)]],
  ['sangre', 'Sed de sangre', 'uncommon', 'player', ['+ +50 % de velocidad por 3 s después de pegar', '+ +30 % de robo de vida'], [set('bloodRush', true), add('lifesteal', 0.3)]],
  ['peleador', 'Peleador', 'uncommon', 'player', ['+ +200 % de vida por 3 s después de pegar'], [set('brawler', true)]],
  ['descomposicion', 'Descomposición', 'uncommon', 'player', ['· El daño que recibís entra de a poco, en 4 s', '+ +50 % de vida'], [set('decay', true), mul('hp', 1.5)]],
  ['abisal', 'Cuenta abisal', 'rare', 'player', ['· Quedate quieto para invocar poderes oscuros', '· Cargada, te cubrís sin parar y dañás a los de cerca'], [set('abyss', true)]],
  ['helada', 'Presencia helada', 'rare', 'player', ['· Frenás un poco a los enemigos que están cerca', '+ +25 % de vida'], [add('chill', 0.3), mul('hp', 1.25)]],
  ['robavidas', 'Robavidas', 'rare', 'player', ['· Le robás vida a los enemigos que están cerca', '+ +25 % de vida'], [set('drain', true), mul('hp', 1.25)]],
  ['pristina', 'Perseverancia prístina', 'rare', 'player', ['+ +400 % de vida mientras estás arriba del 90 %'], [set('pristine', true)]],
  ['resplandor', 'Resplandor', 'rare', 'player', ['· Mientras recargás soltás ondas de sol que dañan, cada vez más seguido', '+ +30 % de vida'], [set('radiance', true), mul('hp', 1.3)]],
  ['refresco', 'Refresco', 'rare', 'player', ['· Pegarle a alguien te devuelve el escudo'], [set('refresh', true)]],
  ['fenix', 'Fénix', 'rare', 'player', ['+ Revivís una vez por pelea', '- −35 % de vida'], [add('phoenix', 1), mul('hp', 0.65)]],
];

export const CARDS = Object.fromEntries(LIST.map(([id, name, rarity, kind, lines, changes]) => [id, { id, name, rarity, kind, lines, changes }]));
export const CARD_IDS = LIST.map(([id]) => id);

export function statsFor(cardIds = []) {
  const s = { ...BASE, blockFx: [] };
  for (const id of cardIds) for (const change of CARDS[id]?.changes || []) change(s);
  s.ammo = Math.max(1, Math.round(s.ammo));
  s.reload = Math.max(0.25, s.reload);
  s.cooldown = s.bloodShot ? 0.06 : Math.max(0.03, s.cooldown);
  s.blockCooldown = Math.max(1, s.blockCooldown);
  s.hp = Math.max(10, Math.round(s.hp));
  s.bullets = Math.min(15, s.bullets);
  s.burst = Math.min(9, s.burst);
  s.bounces = Math.min(20, s.bounces);
  return s;
}

// Cinco cartas distintas al azar, con más chance las comunes.
export function dealCards(rand, n = 5) {
  const pool = [...CARD_IDS];
  const hand = [];
  while (hand.length < n && pool.length) {
    const total = pool.reduce((sum, id) => sum + RARITIES[CARDS[id].rarity].weight, 0);
    let r = rand() * total;
    let index = 0;
    for (; index < pool.length - 1; index++) {
      r -= RARITIES[CARDS[pool[index]].rarity].weight;
      if (r < 0) break;
    }
    hand.push(pool.splice(index, 1)[0]);
  }
  return hand;
}
