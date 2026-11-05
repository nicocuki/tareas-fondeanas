// Keno: 40 números, se eligen de 1 a 10 y salen 10. Cuantos más aciertos, más paga (la tabla de abajo muestra lo que paga cada
// cantidad con los números elegidos). Los números que salen ya vienen decididos en la sala (`t.draw`): acá solo se
// muestran de a uno. Las reglas están en `newgames.js`.
import React, { useState } from 'react';
import { BetPad, Shell, useBet, useSpin } from './BetPad.jsx';
import { fmtMoney } from './game.js';
import { KENO_DRAW, KENO_MAX_PICK, KENO_N, KENO_PAYS } from './newgames.js';

const fmtX = (n) => `×${String(n).replace('.', ',')}`;
const same = (a, b) => a.length === b.length && a.every((v) => b.includes(v));

export default function KenoPanel({ room, table: t, clock, onAct, onClose, toast }) {
  const spin = useSpin(t, clock, onAct);
  const bet = useBet({ kind: 'keno', money: room.money, day: room.day.n, active: !spin.pending, toast });
  const [picks, setPicks] = useState([]);
  const toggle = (n) => {
    if (spin.pending) return;
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= KENO_MAX_PICK ? p : [...p, n]));
  };
  const lucky = () => {
    if (spin.pending) return;
    const pool = Array.from({ length: KENO_N }, (_, i) => i).sort(() => Math.random() - 0.5);
    setPicks(pool.slice(0, picks.length || 5));
  };
  const play = () => {
    if (!picks.length) { toast('Elegí al menos un número.'); return; }
    const amount = bet.take();
    if (amount) onAct({ type: 'spin', amount, picks });
  };

  // los números que salieron, de a uno mientras corre la animación
  const shownPicks = spin.pending ? t.picks : picks;
  const revealed = spin.running ? Math.min(KENO_DRAW, Math.floor((spin.elapsed / Math.max(1, t.ms - 500)) * KENO_DRAW) + 1) : spin.played ? KENO_DRAW : 0;
  const result = spin.played && (spin.pending || same(picks, t.picks || []));
  const drawn = result ? (t.draw || []).slice(0, revealed) : [];
  const hits = drawn.filter((n) => shownPicks.includes(n)).length;
  const pays = KENO_PAYS[shownPicks.length] || [];

  let text = 'Elegí de 1 a 10 números, cuánto apostar y tocá JUGAR.';
  let tone = '';
  if (spin.running) text = <>Salieron {drawn.length} de {KENO_DRAW} · {hits} aciertos</>;
  else if (result) {
    tone = t.pay > t.bet ? ' is-win' : t.pay === t.bet ? ' is-push' : ' is-lose';
    text = <><b>{t.hits} {t.hits === 1 ? 'acierto' : 'aciertos'}</b> {t.pay >= t.bet ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet - t.pay)}`}</>;
  }

  return (
    <Shell title="KENO" name="keno" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!spin.pending} shown={spin.pending ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-kenobox">
        <div className="tbg-kenogrid" role="group" aria-label="Números">
          {Array.from({ length: KENO_N }, (_, n) => {
            const isPick = shownPicks.includes(n);
            const isDrawn = drawn.includes(n);
            return (
              <button key={n} type="button" className={`tbg-kn${isPick ? ' is-pick' : ''}${isDrawn ? ' is-drawn' : ''}${isPick && isDrawn ? ' is-hit' : ''}`} disabled={spin.pending} onClick={() => toggle(n)} data-num={n + 1}>{n + 1}</button>
            );
          })}
        </div>
        <div className="tbg-kenopays" data-pays>
          {pays.map((p, h) => (p ? <span key={h} className={`tbg-kp${result && hits === h ? ' is-now' : ''}`}><b>{h}</b>{fmtX(p)}</span> : null))}
          {!shownPicks.length && <span className="tbg-kp is-empty">Elegí números para ver cuánto paga cada acierto</span>}
        </div>
        <p className="tbg-pickline">Elegiste <b>{shownPicks.length}</b> de {KENO_MAX_PICK}</p>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={spin.pending} onClick={play} data-act="play">JUGAR</button>
        <button type="button" className="tbg-act is-stand" disabled={spin.pending} onClick={() => setPicks([])} data-act="clear">BORRAR</button>
        <button type="button" className="tbg-act is-double" disabled={spin.pending} onClick={lucky} data-act="lucky">AL AZAR</button>
      </div>
    </Shell>
  );
}
