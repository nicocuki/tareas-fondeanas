// Las teclas de Royale 3D que cada jugador puede cambiar (construcción incluida). Se guardan en el navegador de cada uno.
// Lo que no está acá (WASD, Espacio, Shift, los números de los lugares y E) no se cambia.

export const ACTIONS = [
  { id: 'wall', label: 'Construir pared', def: 'KeyZ' },
  { id: 'floor', label: 'Construir piso', def: 'KeyX' },
  { id: 'ramp', label: 'Construir rampa', def: 'KeyC' },
  { id: 'level', label: 'Subir de altura al construir', def: 'KeyV' },
  { id: 'reload', label: 'Recargar', def: 'KeyR' },
  { id: 'drop', label: 'Tirar lo que tenés en la mano', def: 'KeyQ' },
  { id: 'map', label: 'Mapa grande', def: 'KeyM' },
  { id: 'inventory', label: 'Inventario', def: 'Tab' },
];

export const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map((a) => [a.id, a.def]));
// Teclas que no se pueden asignar (se usan para moverse, saltar, agarrar o soltar el mouse).
const RESERVED = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']);
const STORE = 'tf:royale3d:teclas';

export function loadBinds() {
  const out = { ...DEFAULT_BINDS };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    for (const a of ACTIONS) if (typeof saved[a.id] === 'string' && saved[a.id] && !RESERVED.has(saved[a.id])) out[a.id] = saved[a.id];
    // Si dos acciones quedaron con la misma tecla, vuelven a las de fábrica.
    if (new Set(Object.values(out)).size !== ACTIONS.length) return { ...DEFAULT_BINDS };
  } catch { /* sin almacenamiento: quedan las de fábrica */ }
  return out;
}

export function saveBinds(binds) {
  try { localStorage.setItem(STORE, JSON.stringify(binds)); } catch { /* no pasa nada */ }
}

// Cambia la tecla de una acción. Devuelve { binds } o { error } (reservada, o ya usada por otra acción).
export function rebind(binds, id, code) {
  if (RESERVED.has(code)) return { error: 'Esa tecla se usa para otra cosa.' };
  const other = ACTIONS.find((a) => a.id !== id && binds[a.id] === code);
  if (other) return { error: `Ya la usa «${other.label}».` };
  return { binds: { ...binds, [id]: code } };
}

// El nombre corto de una tecla para mostrar («KeyZ» → «Z»).
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = { Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Enter: 'Enter', Backspace: '⌫', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', CapsLock: 'Bloq Mayús' };
  return names[code] || code.replace(/^Numpad/, 'Num ');
}
