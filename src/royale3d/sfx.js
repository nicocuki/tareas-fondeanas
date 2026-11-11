// Royale 3D: sonidos sintetizados con Web Audio (sin archivos). Prendidos por defecto, con el 🔊 del HUD
// (`tf:royale3d:sonido`). Nada acá toca el estado del juego.
const KEY = 'tf:royale3d:sonido';
let ctx = null, master = null, noiseBuf = null;
let enabled = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } })();

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
}

function ensure() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

// Un tono con envolvente. `pan` de -1 a 1 y `vol` (0 a 1) para que lo lejano suene más bajito.
function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, pan = 0 } = {}) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = g;
  if (c.createStereoPanner && pan) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  o.connect(g);
  out.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function noise(dur, { vol = 0.3, freq = 1500, q = 0.7, type = 'lowpass', delay = 0, slide = 0, pan = 0 } = {}) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0002, vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g);
  let out = g;
  if (c.createStereoPanner && pan) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  out.connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

// `vol` baja con la distancia (se calcula afuera).
export const sfx = {
  shot(kind, vol = 1, pan = 0) {
    const v = vol;
    switch (kind) {
      case 'pistol': noise(0.12, { vol: 0.5 * v, freq: 2600, slide: -1800, pan }); tone(180, 0.1, { type: 'square', vol: 0.12 * v, slide: -120, pan }); break;
      case 'revolver': noise(0.25, { vol: 0.8 * v, freq: 1800, slide: -1300, pan }); tone(120, 0.2, { type: 'square', vol: 0.2 * v, slide: -80, pan }); break;
      case 'smg': noise(0.07, { vol: 0.38 * v, freq: 3200, slide: -2000, pan }); break;
      case 'shotgun': noise(0.35, { vol: 0.9 * v, freq: 1500, slide: -1100, pan }); tone(90, 0.25, { type: 'sawtooth', vol: 0.2 * v, slide: -60, pan }); break;
      case 'rifle': case 'burst': noise(0.1, { vol: 0.5 * v, freq: 2400, slide: -1800, pan }); tone(140, 0.08, { type: 'square', vol: 0.1 * v, pan }); break;
      case 'sniper': noise(0.5, { vol: 0.9 * v, freq: 1400, slide: -1000, pan }); tone(70, 0.4, { type: 'sawtooth', vol: 0.22 * v, slide: -40, pan }); break;
      case 'minigun': noise(0.05, { vol: 0.3 * v, freq: 3000, slide: -1800, pan }); break;
      case 'bazooka': noise(0.45, { vol: 0.75 * v, freq: 900, slide: -600, pan }); tone(110, 0.4, { type: 'sawtooth', vol: 0.2 * v, slide: -70, pan }); break;
      case 'launcher': noise(0.2, { vol: 0.5 * v, freq: 700, slide: -500, pan }); tone(160, 0.14, { type: 'triangle', vol: 0.25 * v, slide: -90, pan }); break;
      case 'pickaxe': noise(0.09, { vol: 0.25 * v, freq: 600, pan }); break;
      default: noise(0.1, { vol: 0.3 * v, pan });
    }
  },
  explosion(vol = 1, pan = 0) { noise(1.1, { vol: 1 * vol, freq: 700, slide: -560, pan }); tone(60, 0.8, { type: 'sine', vol: 0.5 * vol, slide: -35, pan }); noise(0.35, { vol: 0.5 * vol, freq: 2200, slide: -1800, type: 'highpass', pan }); },
  reload() { tone(420, 0.04, { type: 'square', vol: 0.1 }); tone(300, 0.05, { type: 'square', vol: 0.1, delay: 0.5 }); tone(520, 0.05, { type: 'square', vol: 0.12, delay: 1.0 }); },
  click() { tone(260, 0.03, { type: 'square', vol: 0.12 }); },
  hit(head = false) { tone(head ? 1500 : 900, 0.07, { type: 'triangle', vol: 0.28 }); if (head) tone(2200, 0.09, { type: 'triangle', vol: 0.2, delay: 0.04 }); },
  hurt() { tone(160, 0.14, { type: 'sawtooth', vol: 0.22, slide: -90 }); noise(0.12, { vol: 0.25, freq: 500 }); },
  kill() { tone(660, 0.1, { type: 'square', vol: 0.18 }); tone(880, 0.1, { type: 'square', vol: 0.18, delay: 0.09 }); tone(1320, 0.2, { type: 'square', vol: 0.2, delay: 0.18 }); },
  pickup() { tone(740, 0.08, { type: 'triangle', vol: 0.22 }); tone(1110, 0.12, { type: 'triangle', vol: 0.22, delay: 0.06 }); },
  chest() { noise(0.22, { vol: 0.35, freq: 800, type: 'bandpass' }); tone(520, 0.12, { type: 'triangle', vol: 0.22, delay: 0.12 }); tone(780, 0.14, { type: 'triangle', vol: 0.22, delay: 0.2 }); tone(1040, 0.24, { type: 'triangle', vol: 0.22, delay: 0.3 }); },
  heal() { tone(520, 0.12, { type: 'sine', vol: 0.2 }); tone(700, 0.14, { type: 'sine', vol: 0.2, delay: 0.1 }); tone(880, 0.2, { type: 'sine', vol: 0.2, delay: 0.2 }); },
  build() { noise(0.1, { vol: 0.35, freq: 400 }); tone(220, 0.08, { type: 'square', vol: 0.14, slide: 120 }); },
  breakWood() { noise(0.2, { vol: 0.4, freq: 900, slide: -500 }); },
  chop() { noise(0.08, { vol: 0.3, freq: 700 }); tone(180, 0.06, { type: 'triangle', vol: 0.18 }); },
  step(vol = 0.08) { noise(0.05, { vol, freq: 500 }); },
  jump() { tone(300, 0.14, { type: 'sine', vol: 0.12, slide: 200 }); },
  glider() { noise(0.35, { vol: 0.35, freq: 600, slide: 1400, type: 'bandpass' }); },
  land() { noise(0.15, { vol: 0.3, freq: 400 }); tone(90, 0.12, { type: 'sine', vol: 0.3 }); },
  storm() { tone(110, 0.6, { type: 'sawtooth', vol: 0.12, slide: 40 }); tone(165, 0.6, { type: 'sawtooth', vol: 0.1, slide: 60, delay: 0.1 }); },
  drop() { tone(880, 0.12, { type: 'square', vol: 0.15 }); tone(660, 0.12, { type: 'square', vol: 0.15, delay: 0.16 }); tone(880, 0.12, { type: 'square', vol: 0.15, delay: 0.32 }); },
  count(n) { tone(n > 0 ? 520 : 880, n > 0 ? 0.12 : 0.3, { type: 'square', vol: 0.18 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, { type: 'triangle', vol: 0.25, delay: i * 0.14 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.4, { type: 'sawtooth', vol: 0.18, delay: i * 0.2, slide: -30 })); },
};
