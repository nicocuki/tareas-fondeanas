// Relojes que siguen andando con la pestaña de fondo.
//
// Con la pestaña oculta, el navegador deja de llamar a requestAnimationFrame y frena setInterval y
// setTimeout (a uno por segundo y, después de unos minutos, a uno por minuto). Eso dejaba al jugador
// congelado en la pelea (sin fotos, sin daño; el anfitrión lo daba por muerto) y cortaba la conexión
// con la sala (el servidor lo veía desconectado y no entraba a la partida que se arrancaba).
// Los relojes de un Web Worker no se frenan así: acá se piden ahí y avisan a la página.
//
// - `everyFrame(fn)`: cada cuadro con requestAnimationFrame mientras se ve, y ~60 veces por segundo
//   desde el Worker mientras no. `fn({ hidden })`: con `hidden` conviene no dibujar.
// - `backgroundInterval(fn, ms)` y `backgroundTimeout(fn, ms)`: como setInterval/setTimeout.
// Todas devuelven una función para cortarlas. Sin Worker (Node, tests), usan los relojes comunes.

const WORKER_CODE = `
const timers = new Map();
onmessage = ({ data: [op, id, ms, repeat] }) => {
  if (op === 'set') timers.set(id, (repeat ? setInterval : setTimeout)(() => { postMessage(id); if (!repeat) timers.delete(id); }, ms));
  else { clearTimeout(timers.get(id)); clearInterval(timers.get(id)); timers.delete(id); }
};`;

let worker; // undefined: todavía no se probó; null: no hay Worker
const callbacks = new Map(); // id → { fn, repeat }
let nextId = 1;

function getWorker() {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return worker;
    const url = URL.createObjectURL(new Blob([WORKER_CODE], { type: 'text/javascript' }));
    worker = new Worker(url);
    worker.onmessage = ({ data: id }) => {
      const entry = callbacks.get(id);
      if (!entry) return;
      if (!entry.repeat) callbacks.delete(id);
      entry.fn();
    };
    worker.onerror = () => { worker = null; };
  } catch {
    worker = null;
  }
  return worker;
}

function schedule(fn, ms, repeat) {
  const w = getWorker();
  if (!w) {
    const t = (repeat ? setInterval : setTimeout)(fn, ms);
    return () => { clearTimeout(t); clearInterval(t); };
  }
  const id = nextId++;
  callbacks.set(id, { fn, repeat });
  w.postMessage(['set', id, ms, repeat]);
  return () => {
    if (!callbacks.delete(id)) return;
    try { w.postMessage(['clear', id]); } catch {}
  };
}

export const backgroundInterval = (fn, ms) => schedule(fn, ms, true);
export const backgroundTimeout = (fn, ms) => schedule(fn, ms, false);

// Mientras requestAnimationFrame llega, manda él (cuadros parejos para dibujar). Si deja de llegar más
// de STALL_MS (pestaña de fondo, ventana minimizada o tapada; no alcanza con mirar visibilityState,
// que a veces dice «visible» igual), sigue el Worker con `hidden: true`.
const STALL_MS = 100;

export function everyFrame(fn) {
  let stopped = false;
  let lastFrame = performance.now();
  let raf = requestAnimationFrame(onFrame);
  function onFrame() {
    if (stopped) return;
    raf = requestAnimationFrame(onFrame);
    lastFrame = performance.now();
    fn({ hidden: false });
  }
  const stopWatch = backgroundInterval(() => {
    if (stopped || performance.now() - lastFrame < STALL_MS) return;
    fn({ hidden: true });
  }, 1000 / 60);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stopWatch();
  };
}
