// Piezas compartidas por los juegos que guardan la partida como archivo (Monopoly y La Timba).

// Hash de 53 bits (cyrb53): alcanza para detectar ediciones, no para resistir a alguien que quiera falsificar.
export function hash53(salt, text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = salt + text;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Baja un texto como archivo.
export function downloadText(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fecha y nombres de los jugadores, para el nombre del archivo.
export function fileStamp(savedAt, names) {
  const d = new Date(savedAt);
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const who = names.join('-').replace(/[^\p{L}\p{N}-]+/gu, '').slice(0, 40);
  return `${stamp}${who ? `-${who}` : ''}`;
}
