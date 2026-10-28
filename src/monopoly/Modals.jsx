// Ventanas del juego: ficha de una propiedad, subasta, tratos y carta que se acaba de sacar.
import React, { useEffect, useRef, useState } from 'react';
import {
  CARDS, DECK_NAMES, GROUPS, SQUARES, groupSquares, houseCost, mortgageValue, unmortgageCost,
} from './board.js';
import {
  buildProblem, findPlayer, groupHasBuildings, mortgageProblem, ownedBy, rentFor, sellBuildingProblem, tradeFee, tradeProblem,
  unmortgageProblem,
} from './game.js';
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
export function AuctionModal({ room, me, dispatch }) {
  const a = room.auction;
  const sq = SQUARES[a.pos];
  const mine = a.turn === me?.id;
  const turnPlayer = findPlayer(room, a.turn);
  const bidder = findPlayer(room, a.bidder);
  const [amount, setAmount] = useState(String(a.bid + 10));
  useEffect(() => { setAmount(String(a.bid + 10)); }, [a.bid, a.turn]);
  const value = Number.parseInt(amount, 10);
  const problem = !Number.isInteger(value) ? 'Escribí un número.' : value <= a.bid ? `Tiene que ser más de ${money(a.bid)}.` : value > (me?.cash ?? 0) ? `Solo tenés ${money(me?.cash ?? 0)}.` : null;
  const group = sq.g && GROUPS[sq.g];
  return (
    <Modal title="🔨 Subasta" label={`Subasta de ${sq.name}`}>
      <div className="mp-deed-head" style={{ background: group ? group.color : 'var(--paper-shadow)', color: sq.g === 'lightblue' || sq.g === 'yellow' ? '#241b05' : '#fff' }}>
        <small>Precio de lista {money(sq.price)}</small>
        <strong>{sq.name}</strong>
      </div>
      <p className="mp-note">
        {bidder ? <>Mejor oferta: <b>{money(a.bid)}</b> de <b>{bidder.id === me?.id ? 'vos' : bidder.name}</b>.</> : 'Todavía nadie ofreció. Se puede empezar desde $1.'}
        {' '}Van ofreciendo por turnos: o subís la oferta, o te bajás. Gana el que queda con la oferta más alta y paga lo que ofreció.
      </p>
      <ul className="mp-bidders">
        {a.order.map((id) => {
          const p = findPlayer(room, id);
          const active = a.active.includes(id);
          return (
            <li key={id} className={`${id === a.turn ? 'is-turn' : ''}${active ? '' : ' is-dropped'}`}>
              <Token player={p} size={26} />
              <span>{p.id === me?.id ? 'Vos' : p.name}</span>
              <small>{!active ? 'se bajó' : id === a.bidder ? `ofrece ${money(a.bid)}` : id === a.turn ? 'le toca' : 'espera'}</small>
            </li>
          );
        })}
      </ul>
      {mine ? (
        <div className="mp-bid-box">
          <p><b>Te toca.</b> Tenés {money(me.cash)} (podés hipotecar para juntar más).</p>
          <div className="mp-quick">
            {[1, 10, 50, 100].map((n) => (
              <button key={n} type="button" className="tf-btn tf-btn-soft" onClick={() => setAmount(String(a.bid + n))}>+{n}</button>
            ))}
          </div>
          <div className="tf-join-row">
            <input className="tf-input" inputMode="numeric" aria-label="Tu oferta" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
            <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(problem)} data-act="bid" onClick={() => dispatch({ type: 'bid', amount: value })}>Ofrecer {Number.isInteger(value) ? money(value) : ''}</button>
          </div>
          {problem && <small className="mp-problem">{problem}</small>}
          <button type="button" className="tf-btn tf-btn-danger-soft tf-btn-block" data-act="passBid" onClick={() => dispatch({ type: 'passBid' })}>
            Bajarme de la subasta
          </button>
        </div>
      ) : (
        <p className="mp-waiting">Le toca a <b>{turnPlayer?.name}</b>…</p>
      )}
    </Modal>
  );
}

// ─── Tratos ──────────────────────────────────────────────────────────────────
export function describeSide(room, side) {
  const parts = [];
  if (side.cash) parts.push(money(side.cash));
  for (const pos of side.props) parts.push(`${SQUARES[pos].name}${room.props[pos]?.m ? ' (hipotecada)' : ''}`);
  if (side.cards) parts.push(`${side.cards} carta${side.cards > 1 ? 's' : ''} de «Salir de la cárcel»`);
  return parts.length ? parts : ['nada'];
}

export function TradeSummary({ room, trade, me }) {
  const a = findPlayer(room, trade.from);
  const b = findPlayer(room, trade.to);
  const name = (p) => (p.id === me?.id ? 'Vos' : p.name);
  return (
    <div className="mp-trade-sum">
      <div><b>{name(a)} {a.id === me?.id ? 'das' : 'da'}:</b><ul>{describeSide(room, trade.give).map((t) => <li key={t}>{t}</li>)}</ul></div>
      <div><b>{name(b)} {b.id === me?.id ? 'das' : 'da'}:</b><ul>{describeSide(room, trade.take).map((t) => <li key={t}>{t}</li>)}</ul></div>
    </div>
  );
}

export function TradeIncoming({ room, me, dispatch }) {
  const t = room.trade;
  const from = findPlayer(room, t.from);
  const problem = tradeProblem(room, t, true);
  const feeMe = tradeFee(room, t.give.props);
  return (
    <Modal title="🤝 Te proponen un trato" label="Trato">
      <p className="mp-note"><b>{from.name}</b> te propone esto:</p>
      <TradeSummary room={room} trade={t} me={me} />
      {feeMe > 0 && <p className="mp-note">Recibís propiedades hipotecadas: pagás al banco {money(feeMe)} (el 10 % de sus hipotecas).</p>}
      {problem && <p className="mp-problem">{problem}</p>}
      <div className="mp-modal-actions">
        <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(problem)} data-act="tradeAccept" onClick={() => dispatch({ type: 'tradeAccept' })}>Aceptar</button>
        <button type="button" className="tf-btn tf-btn-danger-soft" data-act="tradeDecline" onClick={() => dispatch({ type: 'tradeDecline' })}>Rechazar</button>
      </div>
    </Modal>
  );
}

const emptySide = () => ({ cash: '', props: [], cards: 0 });

export function TradeComposer({ room, me, initialTo, onClose, dispatch }) {
  const others = room.players.filter((p) => !p.out && p.id !== me.id);
  const [to, setTo] = useState(initialTo && others.some((p) => p.id === initialTo) ? initialTo : others[0]?.id);
  const [give, setGive] = useState(emptySide);
  const [take, setTake] = useState(emptySide);
  const partner = findPlayer(room, to);
  const toggle = (set) => (pos) => set((s) => ({ ...s, props: s.props.includes(pos) ? s.props.filter((x) => x !== pos) : [...s.props, pos] }));
  const clean = (s) => ({ cash: Number.parseInt(s.cash, 10) || 0, props: s.props, cards: s.cards });
  const trade = { from: me.id, to, give: clean(give), take: clean(take) };
  const problem = partner ? tradeProblem(room, trade) : 'No hay con quién tratar.';
  const pickTo = (id) => { setTo(id); setTake(emptySide()); };

  const sideBox = (title, owner, side, set) => {
    const owned = ownedBy(room, owner.id);
    return (
      <fieldset className="mp-side">
        <legend>{title}</legend>
        <label className="mp-cash">
          <span>Plata</span>
          <input className="tf-input" inputMode="numeric" placeholder="$0" aria-label={`Plata que ${owner.id === me.id ? 'das' : 'recibís'}`} value={side.cash} onChange={(e) => set((s) => ({ ...s, cash: e.target.value.replace(/[^0-9]/g, '') }))} />
          <small>{owner.id === me.id ? 'Tenés' : 'Tiene'} {money(owner.cash)}</small>
        </label>
        <div className="mp-prop-pick">
          {owned.length === 0 && <small>No tiene propiedades.</small>}
          {owned.map((pos) => {
            const g = SQUARES[pos].g;
            const blocked = g && groupHasBuildings(room, g);
            return (
              <label key={pos} className={blocked ? 'is-blocked' : ''} title={blocked ? 'Hay edificios en ese color: hay que venderlos antes.' : undefined}>
                <input type="checkbox" disabled={blocked} checked={side.props.includes(pos)} onChange={() => toggle(set)(pos)} />
                <i style={{ background: g ? GROUPS[g].color : 'var(--text-3)' }} />
                <span>{SQUARES[pos].name}{room.props[pos].m ? ' (hipotecada)' : ''}{blocked ? ' · con edificios' : ''}</span>
              </label>
            );
          })}
        </div>
        {owner.jf.length > 0 && (
          <label className="mp-cards">
            <span>Cartas de «Salir de la cárcel»</span>
            <select className="tf-input" value={side.cards} onChange={(e) => set((s) => ({ ...s, cards: Number(e.target.value) }))}>
              {Array.from({ length: owner.jf.length + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </fieldset>
    );
  };

  return (
    <Modal title="🤝 Hacer un trato" onClose={onClose} wide>
      <p className="mp-note">Armá lo que das y lo que querés a cambio. Si el otro acepta, se intercambia todo junto. No se pueden tratar propiedades con edificios en su color.</p>
      <label className="tf-field">
        <span>Tratar con</span>
        <select className="tf-input" value={to} onChange={(e) => pickTo(e.target.value)} aria-label="Tratar con">
          {others.map((p) => <option key={p.id} value={p.id}>{p.avatar} {p.name} ({money(p.cash)})</option>)}
        </select>
      </label>
      <div className="mp-sides">
        {sideBox('Vos das', me, give, setGive)}
        {partner && sideBox(`${partner.name} te da`, partner, take, setTake)}
      </div>
      {problem && <p className="mp-problem">{problem}</p>}
      <div className="mp-modal-actions">
        <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(problem)} data-act="tradeSend" onClick={() => { dispatch({ type: 'tradeOffer', to, give: trade.give, take: trade.take }); onClose(); }}>Proponer trato</button>
        <button type="button" className="tf-btn tf-btn-soft" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}

// ─── Carta recién sacada ─────────────────────────────────────────────────────
// Se ve unos segundos arriba del tablero, para todos, y se cierra tocándola.
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
