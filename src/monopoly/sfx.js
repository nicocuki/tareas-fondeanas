// Sonidos del Monopoly, sintetizados con Web Audio (no hay archivos). Arrancan apagados: jugando en clase,
// quince celulares sonando a la vez no sirven; cada uno lo prende con el botón del tablero.
const KEY = 'tf:monopoly:sonido';
let ctx = null;
let on = false;
try { on = localStorage.getItem(KEY) === '1'; } catch {}

export const soundOn = () => on;

export function setSound(value) {
  on = Boolean(value);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
  if (on) play('tick');
}

// notas: [frecuencia en Hz, duración en s, retraso en s, tipo de onda]
const SOUNDS = {
  tick: [[660, 0.08, 0, 'sine']],
  dice: [[220, 0.05, 0, 'square'], [300, 0.05, 0.1, 'square'], [260, 0.05, 0.2, 'square'], [340, 0.05, 0.32, 'square'], [300, 0.05, 0.46, 'square'], [420, 0.06, 0.62, 'square'], [380, 0.06, 0.8, 'square']],
  land: [[330, 0.12, 0, 'triangle'], [440, 0.18, 0.1, 'triangle']],
  gain: [[880, 0.08, 0, 'sine'], [1175, 0.14, 0.08, 'sine']],
  good: [[523, 0.1, 0, 'triangle'], [659, 0.1, 0.1, 'triangle'], [784, 0.2, 0.2, 'triangle']],
  loss: [[330, 0.14, 0, 'sawtooth'], [247, 0.22, 0.14, 'sawtooth']],
  bad: [[196, 0.18, 0, 'sawtooth'], [147, 0.18, 0.18, 'sawtooth'], [110, 0.3, 0.36, 'sawtooth']],
  turn: [[587, 0.1, 0, 'sine'], [784, 0.16, 0.12, 'sine']],
  win: [[523, 0.14, 0, 'triangle'], [659, 0.14, 0.14, 'triangle'], [784, 0.14, 0.28, 'triangle'], [1047, 0.4, 0.42, 'triangle']],
};

export function play(name) {
  if (!on) return;
  try {
    const notes = SOUNDS[name];
    if (!notes) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx ||= new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime;
    for (const [freq, dur, delay, type] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + dur + 0.02);
    }
  } catch {}
}
