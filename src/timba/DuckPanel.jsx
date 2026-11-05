// La carrera de patos: cuatro patos con nombre (Cuki, Suti, Vitas y Gordon) y nadie es favorito: se elige uno y puede
// ganar cualquiera. Cuánto tarda cada pato ya viene decidido en la sala (`t.times`): acá solo se anima, con
// tramos en que unos pasan a otros y todos llegando a la meta en su momento. Las reglas están en `games.js`.
import React, { useState } from 'react';
import { DUCKS, DUCK_PAY } from './games.js';
import { BetPad, Shell, useBet, useSpin } from './BetPad.jsx';
import { DUCK_ART, Pixels } from './Pixels.jsx';
import { fmtMoney } from './game.js';

const BODY = ['#f6d640', '#f08ab8', '#6ab4f0', '#7ad46a'];
// Cuánto avanzó el pato `i` (de 0 a 1) a los `ms` de la carrera: va parejo, con vaivenes que se anulan en la meta.
const progress = (times, i, ms) => {
  const u = Math.max(0, Math.min(1, ms / times[i]));
  return u + 0.035 * Math.sin(u * Math.PI * (4 + i)) * (1 - u) * 2;
};

export default function DuckPanel({ room, table: t, clock, onAct, onClose, toast }) {
  const spin = useSpin(t, clock, onAct);
  const bet = useBet({ kind: 'duck', money: room.money, active: !spin.pending, toast });
  const [pick, setPick] = useState(0);
  const play = () => {
    const amount = bet.take();
    if (amount) onAct({ type: 'spin', amount, pick });
  };
  const shownPick = spin.played ? t.pick : pick;
  const racing = spin.running;
  const ms = racing ? spin.elapsed : spin.played ? Infinity : 0;

  let text = 'Elegí un pato, cuánto apostar y tocá LARGAR.';
  let tone = '';
  if (racing) text = '¡Largaron!';
  else if (spin.played) {
    tone = t.pay > 0 ? ' is-win' : ' is-lose';
    text = <><b>Ganó {DUCKS[t.win]}</b> · {t.pay > 0 ? `+${fmtMoney(t.pay - t.bet)}` : `−${fmtMoney(t.bet)}`}</>;
  }

  return (
    <Shell title="CARRERA DE PATOS" name="duck" onClose={onClose} pad={<BetPad bet={bet} money={room.money} active={!spin.pending} shown={spin.pending ? t.bet : undefined} onEnter={play} />}>
      <div className="tbg-duckbox">
        <div className="tbg-lanes">
          {DUCKS.map((name, i) => {
            const p = spin.played ? progress(t.times, i, ms === Infinity ? 1e9 : ms) : 0;
            const won = spin.played && !racing && t.win === i;
            return (
              <div key={name} className={`tbg-lane${won ? ' is-won' : ''}${shownPick === i ? ' is-picked' : ''}`}>
                <span className="tbg-lane-name">{name}</span>
                <div className="tbg-track">
                  <span className="tbg-duck" style={{ left: `calc(${(p * 100).toFixed(1)}% - ${p * 44}px)`, '--bob': `${(i % 2) * 0.15}s` }} data-duck={i}>
                    <Pixels art={DUCK_ART} size={44} body={BODY[i]} />
                  </span>
                </div>
                <span className="tbg-finish" aria-hidden="true" />
              </div>
            );
          })}
        </div>
        <div className="tbg-picks" role="group" aria-label="Elegí tu pato">
          {DUCKS.map((name, i) => (
            <button key={name} type="button" className={`tbg-pick${shownPick === i ? ' is-picked' : ''}`} disabled={spin.pending} onClick={() => setPick(i)} data-pick={i}>
              <Pixels art={DUCK_ART} size={26} body={BODY[i]} /> {name}
            </button>
          ))}
        </div>
        <p className="tbg-pickline">Tu pato: <b>{DUCKS[shownPick]}</b> · paga ×{String(DUCK_PAY).replace('.', ',')}</p>
        <div className={`tbg-result${tone}`} data-result>{text}</div>
      </div>
      <div className="tbg-actions">
        <button type="button" className="tbg-act is-play" disabled={spin.pending} onClick={play} data-act="play">LARGAR</button>
      </div>
    </Shell>
  );
}
