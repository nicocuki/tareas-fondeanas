// Ventanas del juego: ficha de una propiedad, subasta y carta que se acaba de sacar. Los tratos están en Trade.jsx.
import React, { useEffect, useRef, useState } from 'react';
import {
  CARDS, DECK_NAMES, GROUPS, SQUARES, groupSquares, houseCost, mortgageValue, unmortgageCost,
} from './board.js';
import {
  AUCTION_BID_MS, AUCTION_OPEN_MS, buildProblem, findPlayer, minBid, mortgageProblem, rentFor, sellBuildingProblem, unmortgageProblem,
} from './game.js';
import { backgroundInterval } from '../ticker.js';
import { Token } from './Board.jsx';

export function Modal({ title, onClose, children, wide, label }) {
  const box = useRef(null);
  const close = useRef(onClose);
  close.current = onClose; // siempre el último, sin volver a armar los eventos en cada render
  useEffect(() => {
    box.current?.focus(); // solo al abrir: si no, se le robaría el foco al que está escribiendo
    const onKey = (e) => { if (e.key === 'Escape') close.current?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="mp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`mp-modal${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={label || title} tabIndex={-1} ref={box}>
        {(title || onClose) && (
          <div className="mp-modal-head">
            <h2>{title}</h2>
            {onClose && <button type="button" className="mp-x" aria-label="Cerrar" onClick={onClose}>✕</button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const money = (n) => `$${n}`;

// ─── Ficha de una propiedad ──────────────────────────────────────────────────
function RentRow({ label, value, on }) {
  return <tr className={on ? 'is-on' : ''}><td>{label}</td><td>{money(value)}</td></tr>;
}

export function DeedModal({ room, me, pos, onClose, dispatch }) {
  const sq = SQUARES[pos];
  const st = room.props[pos];
  const owner = st && findPlayer(room, st.o);
  const group = sq.g && GROUPS[sq.g];
  const mine = st && st.o === me?.id;
  const level = st?.h ?? -1;
  const tradable = ['street', 'station', 'utility'].includes(sq.t);
  if (!tradable) {
    return (
      <Modal title={sq.name} onClose={onClose}>
        <p className="mp-note">{ABOUT[sq.t]}</p>
      </Modal>
    );
  }
  const row = (key, text, problem, label, onClick) => (
    <div className="mp-deed-action" key={key}>
      <button type="button" className="tf-btn tf-btn-soft" disabled={Boolean(problem)} onClick={onClick} data-act={key}>{label}</button>
      {problem && <small>{problem}</small>}
      {!problem && text && <small>{text}</small>}
    </div>
  );
  return (
    <Modal title="" onClose={onClose} label={sq.name}>
      <div className="mp-deed">
        <div className="mp-deed-head" style={{ background: group ? group.color : 'var(--paper-shadow)', color: sq.g === 'lightblue' || sq.g === 'yellow' ? '#241b05' : '#fff' }}>
          <small>{group ? `Calle ${group.name.toLowerCase()}` : sq.t === 'station' ? 'Estación' : 'Compañía'}</small>
          <strong>{sq.icon ? `${sq.icon} ` : ''}{sq.name}</strong>
        </div>
        {sq.t === 'street' && (
          <table className="mp-rent">
            <tbody>
              <RentRow label="Alquiler" value={sq.rent[0]} on={level === 0 && !(owner && rentFor(room, pos) !== sq.rent[0])} />
              <tr className="mp-rent-note"><td colSpan="2">El doble si el dueño tiene las {groupSquares(sq.g).length} calles del color, sin casas.</td></tr>
              <RentRow label="Con 1 casa" value={sq.rent[1]} on={level === 1} />
              <RentRow label="Con 2 casas" value={sq.rent[2]} on={level === 2} />
              <RentRow label="Con 3 casas" value={sq.rent[3]} on={level === 3} />
              <RentRow label="Con 4 casas" value={sq.rent[4]} on={level === 4} />
              <RentRow label="Con hotel" value={sq.rent[5]} on={level === 5} />
            </tbody>
          </table>
        )}
        {sq.t === 'station' && (
          <table className="mp-rent">
            <tbody>
              {[25, 50, 100, 200].map((v, i) => <RentRow key={v} label={`Si el dueño tiene ${i + 1} estación${i ? 'es' : ''}`} value={v} />)}
            </tbody>
          </table>
        )}
        {sq.t === 'utility' && (
          <p className="mp-note">Se paga según los dados: <b>4 veces</b> lo que salga si el dueño tiene una compañía, <b>10 veces</b> si tiene las dos.</p>
        )}
        <ul className="mp-facts">
          <li><span>Precio</span><b>{money(sq.price)}</b></li>
          <li><span>Hipoteca (te da el banco)</span><b>{money(mortgageValue(pos))}</b></li>
          <li><span>Levantar la hipoteca</span><b>{money(unmortgageCost(pos))}</b></li>
          {sq.t === 'street' && <li><span>Cada casa (y el hotel)</span><b>{money(houseCost(pos))}</b></li>}
        </ul>
        <p className="mp-owner-line">
          {!st && <>Sin dueño. {room.phase === 'playing' ? 'Si alguien cae acá, puede comprarla.' : ''}</>}
          {st && <><Token player={owner} size={22} /> De <b>{owner.id === me?.id ? 'vos' : owner.name}</b>{st.m ? ' · hipotecada (no cobra alquiler)' : level === 5 ? ' · con hotel' : level > 0 ? ` · con ${level} casa${level > 1 ? 's' : ''}` : ''}</>}
        </p>
        {mine && room.phase === 'playing' && (
          <div className="mp-deed-actions">
            {sq.t === 'street' && row('build', null, buildProblem(room, me.id, pos), `🏠 Construir (${money(houseCost(pos))})`, () => dispatch({ type: 'build', pos }))}
            {sq.t === 'street' && st.h > 0 && row('sell', `Te devuelven ${money(Math.floor(houseCost(pos) / 2))}.`, sellBuildingProblem(room, me.id, pos), '🧱 Vender una casa', () => dispatch({ type: 'sellBuilding', pos }))}
            {!st.m && row('mortgage', `El banco te da ${money(mortgageValue(pos))}.`, mortgageProblem(room, me.id, pos), '🏦 Hipotecar', () => dispatch({ type: 'mortgage', pos }))}
            {st.m ? row('unmortgage', null, unmortgageProblem(room, me.id, pos), `✅ Levantar hipoteca (${money(unmortgageCost(pos))})`, () => dispatch({ type: 'unmortgage', pos })) : null}
          </div>
        )}
      </div>
    </Modal>
  );
}

const ABOUT = {
  go: 'Cada vez que pasás por la Salida o caés justo ahí, el banco te paga $200.',
  jail: 'Si caés acá sin haber sido enviado, estás «de visita»: no pasa nada. Si te mandaron a la cárcel, para salir pagás $50, usás una carta o sacás dobles (a la tercera vez sin dobles pagás igual).',
  parking: 'Un casillero de descanso: no pasa nada. Si se juega con la opción del pozo, te llevás todo lo que se juntó de impuestos y multas.',
  gotojail: 'Si caés acá vas directo a la cárcel, sin cobrar la Salida.',
  chance: 'Sacás una carta de Suerte y hacés lo que dice: puede ser plata, un viaje o un problema.',
  chest: 'Sacás una carta de la Caja comunal y hacés lo que dice: casi siempre es plata.',
  tax: 'Pagás este impuesto al banco.',
};

// ─── Subasta ─────────────────────────────────────────────────────────────────
// En vivo: todos los que siguen en carrera ofrecen cuando quieran (de a $50 como mínimo) y cada oferta vuelve a poner
// el reloj. Cuando llega a cero, se la lleva la oferta más alta (la manda `Game`, no esta ventana).
const QUICK = [50, 100, 200];

export function useCountdown(deadline, offset = 0) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    return backgroundInterval(() => setNow(Date.now() + offset), 100);
  }, [offset, deadline]);
  return Math.max(0, deadline - now);
}

export function AuctionModal({ room, me, dispatch, offset }) {
  const a = room.auction;
  const sq = SQUARES[a.pos];
  const group = sq.g && GROUPS[sq.g];
  const left = useCountdown(a.deadline, offset);
  const total = a.bidder ? AUCTION_BID_MS : AUCTION_OPEN_MS;
  const inRace = Boolean(me) && a.active.includes(me.id);
  const leading = a.bidder === me?.id;
  const bidder = findPlayer(room, a.bidder);
  const min = minBid(a);
  const [custom, setCustom] = useState('');
  const bids = room.log.filter((e) => e.k === 'bid' && e.s === a.pos).slice(-4).reverse();
  const canBid = (n) => inRace && !leading && n >= min && n <= (me?.cash ?? 0);
  const value = Number.parseInt(custom, 10);
  const problem = !inRace ? null : leading ? 'Vas ganando: esperá a que alguien te supere.'
    : !Number.isInteger(value) ? null : value < min ? `Mínimo ${money(min)}.` : value > me.cash ? `Solo tenés ${money(me.cash)}.` : null;
  const secs = Math.ceil(left / 1000);
  return (
    <Modal title="🔨 Subasta" label={`Subasta de ${sq.name}`}>
      <div className="mp-deed-head" style={{ background: group ? group.color : 'var(--paper-shadow)', color: sq.g === 'lightblue' || sq.g === 'yellow' ? '#241b05' : '#fff' }}>
        <small>Precio de lista {money(sq.price)}</small>
        <strong>{sq.name}</strong>
      </div>
      <div className={`mp-auc-clock${left < 4000 ? ' is-low' : ''}`} data-auction-clock={secs} role="timer" aria-label={`Quedan ${secs} segundos`}>
        <div className="mp-auc-bar"><i style={{ width: `${Math.min(100, (left / total) * 100)}%` }} /></div>
        <b>{secs}s</b>
      </div>
      <div className="mp-auc-bid" data-auction-bid={a.bid}>
        {bidder
          ? <><small>Va ganando</small><strong key={a.bid}>{money(a.bid)}</strong><span><Token player={bidder} size={26} /> {bidder.id === me?.id ? 'Vos' : bidder.name}</span></>
          : <><small>Todavía nadie ofreció</small><strong>{money(0)}</strong><span>Se empieza en {money(min)}. Si nadie ofrece, queda sin dueño.</span></>}
      </div>
      <ul className="mp-bidders">
        {a.order.map((id) => {
          const p = findPlayer(room, id);
          const active = a.active.includes(id);
          return (
            <li key={id} className={`${id === a.bidder ? 'is-turn' : ''}${active ? '' : ' is-dropped'}`}>
              <Token player={p} size={24} />
              <span>{p.id === me?.id ? 'Vos' : p.name}</span>
              <small>{!active ? 'se bajó' : id === a.bidder ? `ofrece ${money(a.bid)}` : 'puede ofrecer'}</small>
            </li>
          );
        })}
      </ul>
      {bids.length > 0 && (
        <ol className="mp-auc-hist" aria-label="Últimas ofertas">
          {bids.map((e, i) => <li key={i}>{findPlayer(room, e.p)?.name}: {money(e.n)}</li>)}
        </ol>
      )}
      {inRace ? (
        <div className="mp-bid-box">
          <div className="mp-quick">
            {QUICK.map((n) => {
              const amount = a.bid + n;
              return <button key={n} type="button" className="tf-btn tf-btn-primary" disabled={!canBid(amount)} data-act="bid" data-amount={amount} onClick={() => dispatch({ type: 'bid', amount })}>+{n}<small>{money(amount)}</small></button>;
            })}
          </div>
          <div className="tf-join-row">
            <input className="tf-input" inputMode="numeric" placeholder={`Otro monto (mín. ${money(min)})`} aria-label="Otra oferta" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))} />
            <button type="button" className="tf-btn tf-btn-soft" disabled={!canBid(value) || Boolean(problem)} data-act="bidCustom" onClick={() => { dispatch({ type: 'bid', amount: value }); setCustom(''); }}>Ofrecer {Number.isInteger(value) ? money(value) : ''}</button>
          </div>
          {problem && <small className="mp-problem">{problem}</small>}
          <small className="mp-hint">Tenés {money(me.cash)} (podés hipotecar para juntar más).</small>
          <button type="button" className="tf-btn tf-btn-danger-soft tf-btn-block" disabled={leading} data-act="passBid" onClick={() => dispatch({ type: 'passBid' })}>
            Bajarme de la subasta
          </button>
        </div>
      ) : (
        <p className="mp-waiting">{me && !me.out ? 'Te bajaste de la subasta.' : 'Estás mirando la subasta.'}</p>
      )}
    </Modal>
  );
}

// ─── Carta recién sacada ─────────────────────────────────────────────────────
// Se ve unos segundos sobre el tablero, para todos, y se cierra tocándola. Va dentro de `.mp-notices`, con los avisos.
export function CardToast({ room }) {
  const card = room.card;
  const [shown, setShown] = useState(null);
  const seen = useRef(card?.n ?? 0); // al entrar a la sala no se muestra una carta vieja
  useEffect(() => {
    if (!card || card.n === seen.current) return undefined;
    seen.current = card.n;
    setShown(card);
    const timer = setTimeout(() => setShown(null), 6000);
    return () => clearTimeout(timer);
  }, [card?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  const who = findPlayer(room, shown.p);
  return (
    <button type="button" className={`mp-card-toast is-${shown.d}`} onClick={() => setShown(null)} data-card-toast aria-live="polite">
      <small>{DECK_NAMES[shown.d]} · {who?.name}</small>
      <strong>{CARDS[shown.d][shown.i].text}</strong>
    </button>
  );
}
