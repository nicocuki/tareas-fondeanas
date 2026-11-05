// Sonidos de la Generala, sintetizados con Web Audio (no hay archivos): cada golpe que anotó la física
// (`events` de dice.js) suena según contra qué pegó el dado y con cuánta fuerza. Arrancan apagados, como en
// el Monopoly: jugando en clase, quince celulares sonando a la vez no sirven; se prenden con el botón de la mesa.
import { HIT_DIE, HIT_FELT, HIT_WALL, TRAY } from './dice.js';

const KEY = 'tf:generala:sonido';
let ctx = null;
let noise = null;
let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch {}

export const soundOn = () => on;

function audio() {
  if (!on) return null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx ||= new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return ctx;
  } catch {
    return null;
  }
}

export function setSound(value) {
  on = Boolean(value);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (on) hit(HIT_DIE, 90, 0);
}

// Un chasquido: ruido filtrado que se apaga rápido, más un golpecito con tono.
function burst(c, at, { freq, q, dur, gain, tone, toneDur, pan, type = 'bandpass' }) {
  const out = c.createGain();
  out.gain.value = 1;
  let last = out;
  if (c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan || 0));
    out.connect(p);
    last = p;
  }
  last.connect(c.destination);

  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.loopStart = Math.random() * 0.8;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = c.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.0015);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(at, Math.random() * 0.8);
  src.stop(at + dur + 0.02);

  if (tone) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tone, at);
    osc.frequency.exponentialRampToValueAtTime(tone * 0.7, at + toneDur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain * 0.6, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + toneDur);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + toneDur + 0.02);
  }
}

// `kind`: contra qué pegó; `speed`: cm/s; `x`: dónde (para el paneo); `delay`: en cuántos segundos suena.
export function hit(kind, speed, x = 0, delay = 0) {
  const c = audio();
  if (!c) return;
  const power = Math.min(1, (speed / 170) ** 1.15);
  if (power < 0.01) return;
  const at = c.currentTime + Math.max(0, delay);
  const pan = (x / TRAY.hx) * 0.55;
  const vary = 0.88 + Math.random() * 0.24;
  if (kind === HIT_DIE) burst(c, at, { freq: 5200 * vary, q: 2.4, dur: 0.028, gain: 0.5 * power, tone: 3600 * vary, toneDur: 0.018, pan });
  else if (kind === HIT_WALL) burst(c, at, { freq: 1900 * vary, q: 1.6, dur: 0.05, gain: 0.55 * power, tone: 460 * vary, toneDur: 0.06, pan });
  else if (kind === HIT_FELT) burst(c, at, { freq: 820 * vary, q: 0.7, dur: 0.055, gain: 0.5 * power, tone: 170 * vary, toneDur: 0.05, pan, type: 'lowpass' });
}

// Los dados sacudiéndose adentro del cubilete de cuero: chasquidos apagados.
export function rattle(x = 0) {
  const c = audio();
  if (!c) return;
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    burst(c, c.currentTime + i * (0.012 + Math.random() * 0.02), {
      freq: 1500 + Math.random() * 900, q: 1.2, dur: 0.035, gain: 0.12 + Math.random() * 0.12, tone: 900 + Math.random() * 500, toneDur: 0.02, pan: (x / TRAY.hx) * 0.55,
    });
  }
}

// Un dado apoyado en el estante o de vuelta en el paño.
export const tap = (x = 0) => hit(HIT_FELT, 60, x);
