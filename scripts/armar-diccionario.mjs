// Arma el diccionario de La Mecha a partir del corrector ortográfico es_AR de RLA-ES
// (diccionario/es_AR.dic + .aff, licencia MPL 1.1 / LGPL 3 / GPL 3).
//
// Hunspell guarda cada palabra una sola vez con «banderas» (plural, femenino, conjugaciones…);
// acá se expanden todas las formas, se normalizan (minúsculas, sin tildes; la ñ queda) y se
// guardan ordenadas, una por línea, en public/mecha/palabras.txt. También se cuentan las
// sílabas (pedazos de 2 a 4 letras) para que la bomba nunca pida algo imposible.
//
// Uso: node scripts/armar-diccionario.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { normalizeWord } from '../src/mecha/words.js';

const root = new URL('..', import.meta.url);
const aff = readFileSync(new URL('diccionario/es_AR.aff', root), 'utf8').split('\n');
const dic = readFileSync(new URL('diccionario/es_AR.dic', root), 'utf8').split('\n').slice(1);

// ─── Leer las reglas ─────────────────────────────────────────────────────────
function conditionRegex(cond, isSuffix) {
  if (!cond || cond === '.') return null;
  return new RegExp(isSuffix ? `${cond}$` : `^${cond}`, 'u');
}
const rules = new Map(); // bandera → { type, cross, entries: [{ strip, add, flags, cond }] }
for (let i = 0; i < aff.length; i++) {
  const parts = aff[i].trim().split(/\s+/);
  if ((parts[0] === 'PFX' || parts[0] === 'SFX') && parts.length === 4 && /^[YN]$/.test(parts[2])) {
    const [type, flag, cross, count] = parts;
    const entries = [];
    for (let j = 1; j <= Number(count); j++) {
      const [, , strip, addRaw, cond] = aff[i + j].trim().split(/\s+/);
      const [add, flags = ''] = addRaw.split('/');
      entries.push({
        strip: strip === '0' ? '' : strip,
        add: add === '0' ? '' : add,
        flags: [...flags],
        cond: conditionRegex(cond, type === 'SFX'),
      });
    }
    rules.set(flag, { type, cross: cross === 'Y', entries });
    i += Number(count);
  }
}

function applySuffix(word, entry) {
  if (entry.cond && !entry.cond.test(word)) return null;
  if (entry.strip && !word.endsWith(entry.strip)) return null;
  return word.slice(0, word.length - entry.strip.length) + entry.add;
}
function applyPrefix(word, entry) {
  if (entry.cond && !entry.cond.test(word)) return null;
  if (entry.strip && !word.startsWith(entry.strip)) return null;
  return entry.add + word.slice(entry.strip.length);
}

// Todas las formas de una entrada: sufijos (con un segundo nivel de sufijos encadenados),
// prefijos, y prefijo + sufijo cuando las dos reglas lo permiten.
function expand(word, flags) {
  const out = new Set([word]);
  const suffixed = []; // formas con sufijo que aceptan prefijo
  for (const flag of flags) {
    const rule = rules.get(flag);
    if (!rule || rule.type !== 'SFX') continue;
    for (const entry of rule.entries) {
      const form = applySuffix(word, entry);
      if (!form) continue;
      out.add(form);
      if (rule.cross) suffixed.push(form);
      for (const cont of entry.flags) {
        const second = rules.get(cont);
        if (!second || second.type !== 'SFX') continue;
        for (const e2 of second.entries) {
          const f2 = applySuffix(form, e2);
          if (f2) out.add(f2);
        }
      }
    }
  }
  for (const flag of flags) {
    const rule = rules.get(flag);
    if (!rule || rule.type !== 'PFX') continue;
    for (const entry of rule.entries) {
      const form = applyPrefix(word, entry);
      if (form) out.add(form);
      if (!rule.cross) continue;
      for (const s of suffixed) {
        const both = applyPrefix(s, entry);
        if (both) out.add(both);
      }
    }
  }
  return out;
}

// ─── Expandir y filtrar ──────────────────────────────────────────────────────
const words = new Set();
let entries = 0;
for (const line of dic) {
  const raw = line.trim();
  if (!raw) continue;
  const [word, flags = ''] = raw.split('/');
  // Nombres propios y siglas (empiezan con mayúscula) no valen en el juego.
  if (word[0] !== word[0].toLowerCase()) continue;
  entries++;
  for (const form of expand(word, [...flags])) {
    const clean = normalizeWord(form);
    if (clean.length >= 2 && clean.length <= 30 && /^[a-zñ]+$/.test(clean) && form === form.toLowerCase()) words.add(clean);
  }
}
// Palabras que el corrector no trae pero que en Argentina se usan (diccionario/agregadas.txt).
for (const line of readFileSync(new URL('diccionario/agregadas.txt', root), 'utf8').split('\n')) {
  const clean = normalizeWord(line.replace(/#.*/, ''));
  if (clean && /^[a-zñ]+$/.test(clean)) words.add(clean);
}
const sorted = [...words].sort();

// ─── Sílabas: cuántas palabras tiene cada pedazo, en cualquier parte y al principio ─
const anywhere = new Map();
const start = new Map();
for (const w of sorted) {
  const seen = new Set();
  for (let n = 2; n <= 4; n++) {
    if (w.length >= n) start.set(w.slice(0, n), (start.get(w.slice(0, n)) || 0) + 1);
    for (let i = 0; i + n <= w.length; i++) {
      const piece = w.slice(i, i + n);
      if (seen.has(piece)) continue;
      seen.add(piece);
      anywhere.set(piece, (anywhere.get(piece) || 0) + 1);
    }
  }
}
// Para cada modo y largo, las sílabas con suficientes palabras, de más a menos frecuente.
function pick(map, n, min) {
  return [...map].filter(([p, c]) => p.length === n && c >= min).sort((a, b) => b[1] - a[1]).map(([p, c]) => [p, c]);
}
// Se guardan las más comunes primero: la dificultad elige de qué parte de la lista sacar.
const syllables = {
  anywhere: { 2: pick(anywhere, 2, 400), 3: pick(anywhere, 3, 250).slice(0, 1200), 4: pick(anywhere, 4, 150).slice(0, 800) },
  start: { 2: pick(start, 2, 300), 3: pick(start, 3, 150).slice(0, 500), 4: pick(start, 4, 80).slice(0, 400) },
};

mkdirSync(new URL('public/mecha/', root), { recursive: true });
writeFileSync(new URL('public/mecha/palabras.txt', root), sorted.join('\n') + '\n');
const compact = Object.fromEntries(Object.entries(syllables).map(([mode, byLen]) => [mode, Object.fromEntries(Object.entries(byLen).map(([n, list]) => [n, list.map(([p]) => p).join(' ')]))]));
writeFileSync(
  new URL('src/mecha/syllables.js', root),
  '// Generado por scripts/armar-diccionario.mjs: no editar a mano.\n'
  + '// Sílabas con suficientes palabras, de la más común a la menos común, por modo y largo.\n'
  + `const RAW = ${JSON.stringify(compact, null, 2)};\n`
  + 'const SYLLABLES = Object.fromEntries(Object.entries(RAW).map(([mode, byLen]) => [mode, Object.fromEntries(Object.entries(byLen).map(([n, text]) => [n, text.split(\' \')]))]));\n'
  + 'export default SYLLABLES;\n',
);
console.log(`${entries} entradas → ${sorted.length} palabras`);
for (const [mode, byLen] of Object.entries(syllables)) {
  console.log(mode, Object.fromEntries(Object.entries(byLen).map(([n, l]) => [n, `${l.length} (ej. ${l.slice(0, 5).map(([p]) => p).join(' ')} … ${l.slice(-3).map(([p, c]) => `${p}:${c}`).join(' ')})`])));
}
