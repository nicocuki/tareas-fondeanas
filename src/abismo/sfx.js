// Sonidos de Abismo, sintetizados con Web Audio (como los del Krillion original: tonos con envolvente,
// ruido filtrado y arpegios cortos). Prendidos por defecto (pedido de Feli), con el botón 🔊 del HUD; la
// elección queda en localStorage.
import { useEffect, useState } from 'react';

const KEY = 'tf:abismo:sonido';
let ac = null;
let gain = null;
let muted = (() => { try { return localStorage.getItem(KEY) === 'off'; } catch { return false; } })();
const listeners = new Set();

function ctx() {
  if (muted) return null;
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    gain = ac.createGain();
    gain.gain.value = 0.75;
    gain.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

function env(g, t, a, peak, dur) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
}

function tone({ type = 'sine', f0, f1, dur = 0.2, a = 0.005, peak = 0.3, lp, delay = 0 }) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  const g = c.createGain();
  env(g, t, a, peak, dur);
  let node = osc;
  if (lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    osc.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(gain);
  osc.start(t);
  osc.stop(t + dur + a + 0.05);
}

function noise({ dur = 0.3, lp = 1200, hp, peak = 0.25, a = 0.003, delay = 0, sweepTo }) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + delay;
  const n = Math.ceil(c.sampleRate * (dur + 0.1));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(lp, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  let node = f;
  src.connect(f);
  if (hp) {
    const h = c.createBiquadFilter();
    h.type = 'highpass';
    h.frequency.value = hp;
    f.connect(h);
    node = h;
  }
  const g = c.createGain();
  env(g, t, a, peak, dur);
  node.connect(g);
  g.connect(gain);
  src.start(t);
  src.stop(t + dur + 0.1);
}

const arp = (notes, { type = 'triangle', step = 0.12, dur = 0.5, peak = 0.16, lp } = {}) => notes.forEach((f0, i) => tone({ type, f0, dur, peak, lp, delay: i * step }));

const SOUNDS = {
  submit: () => tone({ f0: 1150, dur: 0.16, a: 0.003, peak: 0.16 }),
  reject: () => { noise({ dur: 0.22, lp: 420, peak: 0.2 }); tone({ f0: 150, f1: 62, dur: 0.36, peak: 0.22, lp: 700 }); },
  tierline: () => tone({ type: 'triangle', f0: 780, f1: 1560, dur: 0.07, peak: 0.13, lp: 2500 }),
  sink: () => { tone({ f0: 1150, dur: 0.7, a: 0.01, peak: 0.1 }); noise({ dur: 1.3, lp: 1400, sweepTo: 180, peak: 0.16 }); tone({ f0: 300, f1: 60, dur: 1.3, peak: 0.1 }); },
  landSmall: () => { tone({ f0: 140, f1: 70, dur: 0.25, peak: 0.28, lp: 600 }); noise({ dur: 0.14, lp: 500, peak: 0.1 }); },
  landBig: () => { tone({ f0: 80, f1: 45, dur: 0.6, peak: 0.38 }); noise({ dur: 0.7, lp: 900, sweepTo: 200, peak: 0.18, delay: 0.02 }); tone({ type: 'triangle', f0: 523, dur: 0.4, peak: 0.09, delay: 0.15 }); },
  category: () => { noise({ dur: 0.35, lp: 900, sweepTo: 4200, hp: 400, peak: 0.07 }); tone({ type: 'triangle', f0: 988, dur: 0.32, a: 0.004, peak: 0.13, lp: 4000, delay: 0.12 }); tone({ type: 'triangle', f0: 1319, dur: 0.55, a: 0.004, peak: 0.13, lp: 4000, delay: 0.24 }); },
  krillion: () => { tone({ f0: 60, f1: 40, dur: 1.2, peak: 0.34 }); arp([784, 988, 1175, 1568], { step: 0.13, dur: 0.7, peak: 0.15, lp: 3000 }); noise({ dur: 1.4, lp: 2500, hp: 1200, peak: 0.05, delay: 0.3 }); },
  miss: () => { tone({ f0: 220, f1: 52, dur: 0.7, peak: 0.24 }); noise({ dur: 0.5, lp: 400, peak: 0.14, delay: 0.05 }); },
  tick: () => { tone({ f0: 880, dur: 0.07, peak: 0.16 }); tone({ f0: 880, dur: 0.05, peak: 0.06, delay: 0.12 }); },
  surface: () => { noise({ dur: 1.6, lp: 300, sweepTo: 3000, peak: 0.16 }); tone({ f0: 80, f1: 600, dur: 1.5, peak: 0.08 }); },
};

export function play(name) {
  if (muted) return;
  try { SOUNDS[name]?.(); } catch {}
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = Boolean(value);
  try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch {}
  listeners.forEach((fn) => fn(muted));
}

// Para el botón del HUD.
export function useMuted() {
  const [m, setM] = useState(muted);
  useEffect(() => { listeners.add(setM); return () => listeners.delete(setM); }, []);
  return [m, () => setMuted(!muted)];
}
