// Palabras de La Mecha: normalización y búsqueda en el diccionario. Sin React ni red.
//
// Las tildes no cuentan («cancion» vale lo mismo que «canción»), la ü vale como u y la ñ es
// una letra propia. El diccionario es una lista ordenada de palabras ya normalizadas.

export function normalizeWord(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/ñ/g, '\u0000')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0000/g, 'ñ');
}

// Letras que suman para la vida extra: todo el abecedario menos las muy raras en español.
export const BONUS_LETTERS = 'abcdefghijlmnñopqrstuvz'.split('');

// Diccionario compacto: un solo texto ordenado y el comienzo de cada palabra. Ocupa poco en
// memoria (importa en celulares) y se busca por bisección.
export function createDictionary(text) {
  const starts = [];
  let i = 0;
  while (i < text.length) {
    starts.push(i);
    const next = text.indexOf('\n', i);
    if (next === -1) break;
    i = next + 1;
  }
  const offsets = Uint32Array.from(starts);
  const wordAt = (k) => {
    const from = offsets[k];
    const to = k + 1 < offsets.length ? offsets[k + 1] - 1 : text.length;
    return text.slice(from, to).replace(/\n$/, '');
  };
  return {
    size: offsets.length,
    has(word) {
      let lo = 0, hi = offsets.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const w = wordAt(mid);
        if (w === word) return true;
        if (w < word) lo = mid + 1; else hi = mid - 1;
      }
      return false;
    },
  };
}

// ¿La palabra sirve para esa sílaba? En «cualquier parte» la tiene que contener; en
// «al principio», empezar con ella.
export function matchesSyllable(word, syllable, mode) {
  return mode === 'start' ? word.startsWith(syllable) : word.includes(syllable);
}
