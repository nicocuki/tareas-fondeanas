// Tratos: cómo se ve una oferta (cada propiedad con su color), la tarjeta que ven todos al costado mientras hay una
// abierta, la ventana del que la recibe y la de armar una.
import React, { useEffect, useRef, useState } from 'react';
import { backgroundTimeout } from '../ticker.js';
import { GROUPS, GROUP_KEYS, SQUARES, groupSquares } from './board.js';
import { findPlayer, groupHasBuildings, ownedBy, tradeEffects, tradeFee, tradeProblem } from './game.js';
import { Token, propColor } from './Board.jsx';
import { Modal } from './Modals.jsx';

const money = (n) => `$${n}`;
const SET_ORDER = [...GROUP_KEYS, 'station', 'utility'];
const setOf = (pos) => SQUARES[pos].g || SQUARES[pos].t;
// Por color (en el orden del tablero) y, adentro, por casillero.
const bySet = (a, b) => SET_ORDER.indexOf(setOf(a)) - SET_ORDER.indexOf(setOf(b)) || a - b;
const tradeKey = (t) => (t ? JSON.stringify(t) : '');

// Una propiedad como fichita: la franja de su color, el nombre y el precio (o que está hipotecada).
// Con `onClick` es un botón: abre la ficha o, si viene `pressed`, se marca y desmarca.
function PropChip({ room, pos, onClick, pressed, disabled, title, note }) {
  const sq = SQUARES[pos];
  const st = room.props[pos];
  const Tag = onClick ? 'button' : 'span';
  const button = onClick ? { type: 'button', onClick, disabled, ...(pressed === undefined ? {} : { 'aria-pressed': pressed }) } : {};
  return (
    <Tag {...button} className={`mp-tchip${st?.m ? ' is-mortgaged' : ''}${pressed ? ' is-picked' : ''}`} style={{ '--c': propColor(pos) }} title={title} data-chip={pos}>
      <i aria-hidden="true">{sq.t === 'station' ? '🚆' : sq.t === 'utility' ? sq.icon : pressed ? '✓' : ''}</i>
      <span className="mp-tchip-name">{sq.name}</span>
      <small>{note || (st?.m ? 'hipotecada' : money(sq.price))}</small>
    </Tag>
  );
}

// Lo que entrega uno de los dos.
function OfferSide({ room, player, side, me, onPick }) {
  const empty = !side.cash && !side.cards && !side.props.length;
  return (
    <div className="mp-oside" data-offer-side={player.name}>
      <div className="mp-oside-head">
        <Token player={player} size={24} />
        <b>{player.id === me?.id ? 'Vos das' : `${player.name} da`}</b>
      </div>
      <div className="mp-tchips">
        {side.cash > 0 && <span className="mp-tchip is-cash"><i aria-hidden="true">💵</i><span className="mp-tchip-name">{money(side.cash)}</span></span>}
        {[...side.props].sort(bySet).map((pos) => <PropChip key={pos} room={room} pos={pos} onClick={onPick ? () => onPick(pos) : undefined} title={onPick ? 'Ver la ficha' : undefined} />)}
        {side.cards > 0 && <span className="mp-tchip is-jf"><i aria-hidden="true">🎟</i><span className="mp-tchip-name">{side.cards} carta{side.cards > 1 ? 's' : ''} de «Salir de la cárcel»</span></span>}
        {empty && <span className="mp-tnone">Nada</span>}
      </div>
    </div>
  );
}

const setName = (set) => (set === 'station' ? 'las 4 estaciones' : set === 'utility' ? 'las 2 compañías' : `las ${groupSquares(set).length} calles de color ${GROUPS[set].name.toLowerCase()}`);

// Lo que está en juego: quién completa (o desarma) un color con este trato y lo que hay que pagarle al banco por las
// hipotecadas. Sale de las mismas cuentas que usa el reducer.
function OfferNotes({ room, trade, me }) {
  const party = me && (trade.from === me.id || trade.to === me.id);
  const notes = tradeEffects(room, trade).map((e) => {
    const mine = e.id === me?.id;
    const who = findPlayer(room, e.id)?.name;
    const street = Boolean(GROUPS[e.set]);
    if (e.kind === 'completes') {
      return mine
        ? { tone: 'good', icon: '✅', text: `Completás ${setName(e.set)}${street ? ': vas a poder construir' : ''}.` }
        : { tone: party ? 'warn' : 'info', icon: party ? '⚠️' : '🏘️', text: `${who} completa ${setName(e.set)}${street ? ' y va a poder construir' : ''}.` };
    }
    return mine
      ? { tone: 'warn', icon: '⚠️', text: `Dejás de tener ${setName(e.set)}.` }
      : { tone: 'info', icon: '↩️', text: `${who} deja de tener ${setName(e.set)}.` };
  });
  for (const [id, got] of [[trade.from, trade.take.props], [trade.to, trade.give.props]]) {
    const fee = tradeFee(room, got);
    if (!fee) continue;
    notes.push({
      tone: 'info', icon: '🏦',
      text: id === me?.id ? `Recibís propiedades hipotecadas: le pagás ${money(fee)} al banco (el 10 % de sus hipotecas).` : `${findPlayer(room, id)?.name} le paga ${money(fee)} al banco por las hipotecadas que recibe.`,
    });
  }
  if (!notes.length) return null;
  return (
    <ul className="mp-tnotes" data-trade-notes>
      {notes.map((n, i) => <li key={i} className={`is-${n.tone}`}><span aria-hidden="true">{n.icon}</span> {n.text}</li>)}
    </ul>
  );
}

// La oferta entera: los dos lados y lo que está en juego. `notes={false}` cuando ya se cerró (la sala ya cambió).
function OfferView({ room, trade, me, onPick, notes = true }) {
  const a = findPlayer(room, trade.from);
  const b = findPlayer(room, trade.to);
  if (!a || !b) return null;
  return (
    <>
      <div className="mp-offer">
        <OfferSide room={room} player={a} side={trade.give} me={me} onPick={onPick} />
        <span className="mp-offer-swap" aria-hidden="true">⇄</span>
        <OfferSide room={room} player={b} side={trade.take} me={me} onPick={onPick} />
      </div>
      {notes && <OfferNotes room={room} trade={trade} me={me} />}
    </>
  );
}

// La oferta que va al costado: la que está abierta o, por unos segundos, la que se acaba de cerrar con cómo terminó.
export function useTradeView(room) {
  const live = room.phase === 'playing' ? room.trade : null;
  const last = useRef(null);
  const [done, setDone] = useState(null);
  const key = tradeKey(live);
  useEffect(() => {
    const before = last.current;
    if (live) {
      last.current = { trade: live, n: room.logN ?? 0 };
      setDone(null);
      return undefined;
    }
    last.current = null;
    if (!before || room.phase !== 'playing') return undefined;
    const fresh = Math.max(0, (room.logN ?? 0) - before.n); // lo que se anotó desde que apareció la oferta
    const entries = fresh ? room.log.slice(-Math.min(fresh, room.log.length)) : [];
    const t = before.trade;
    const outcome = entries.some((e) => e.k === 'traded' && e.p === t.from && e.o === t.to) ? 'accepted'
      : entries.some((e) => e.k === 'refused' && e.p === t.to && e.o === t.from) ? 'refused' : 'cancelled';
    setDone({ trade: t, outcome });
    return backgroundTimeout(() => setDone(null), 4200);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return live ? { trade: live, outcome: null } : done;
}

const OUTCOME = { accepted: '✅ ¡Trato cerrado!', refused: '🚫 Rechazado', cancelled: '↩️ Se canceló' };

// La tarjeta que ven todos al costado mientras hay un trato abierto: quién le ofrece qué a quién.
export function TradeCard({ room, me, view, dispatch, onPick, onRespond }) {
  if (!view) return null;
  const { trade: t, outcome } = view;
  const from = findPlayer(room, t.from);
  const to = findPlayer(room, t.to);
  if (!from || !to) return null;
  const mine = t.from === me?.id;
  const forMe = t.to === me?.id && !me?.out;
  return (
    <section className={`mp-trade-card${outcome ? ` is-${outcome}` : ''}${forMe && !outcome ? ' is-for-me' : ''}`} data-trade-card={outcome || 'open'} aria-label="Trato en curso" aria-live="polite">
      <h2>
        <span aria-hidden="true">🤝</span>{' '}
        {mine ? <>Le propusiste un trato a <b>{to.name}</b></>
          : t.to === me?.id ? <><b>{from.name}</b> te {outcome ? 'propuso' : 'propone'} un trato</>
            : <><b>{from.name}</b> le {outcome ? 'propuso' : 'propone'} un trato a <b>{to.name}</b></>}
      </h2>
      <OfferView room={room} trade={t} me={me} onPick={onPick} notes={!outcome} />
      {outcome ? <p className="mp-trade-outcome" data-trade-outcome={outcome}>{OUTCOME[outcome]}</p> : (
        <div className="mp-trade-foot">
          {forMe
            ? <button type="button" className="tf-btn tf-btn-primary" data-act="tradeOpen" onClick={onRespond}>Responder</button>
            : <span className="mp-trade-wait">Esperando que <b>{to.name}</b> responda…</span>}
          {mine && <button type="button" className="tf-btn tf-btn-soft" data-act="tradeCancel" onClick={() => dispatch({ type: 'tradeCancel' })}>Cancelar trato</button>}
        </div>
      )}
    </section>
  );
}

// La ventana del que recibe la oferta. Se puede correr para mirar el tablero: la oferta queda en la tarjeta del costado.
export function TradeIncoming({ room, me, dispatch, onHide, onPick }) {
  const t = room.trade;
  const from = findPlayer(room, t.from);
  const problem = tradeProblem(room, t, true);
  return (
    <Modal title={`🤝 ${from.name} te propone un trato`} label="Trato" wide>
      <OfferView room={room} trade={t} me={me} onPick={onPick} />
      {problem && <p className="mp-problem">{problem}</p>}
      <div className="mp-modal-actions">
        <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(problem)} data-act="tradeAccept" onClick={() => dispatch({ type: 'tradeAccept' })}>✓ Aceptar</button>
        <button type="button" className="tf-btn tf-btn-danger-soft" data-act="tradeDecline" onClick={() => dispatch({ type: 'tradeDecline' })}>✕ Rechazar</button>
        <button type="button" className="tf-btn tf-btn-soft" data-act="tradeHide" onClick={onHide}>👀 Mirar el tablero</button>
      </div>
      <p className="mp-hint">Tocá una propiedad para ver su ficha. Si mirás el tablero, la oferta queda a la vista para responder cuando quieras.</p>
    </Modal>
  );
}

const emptySide = () => ({ cash: '', props: [], cards: 0 });

export function TradeComposer({ room, me, initialTo, onClose, dispatch }) {
  const others = room.players.filter((p) => !p.out && p.id !== me.id);
  const [to, setTo] = useState(initialTo && others.some((p) => p.id === initialTo) ? initialTo : others[0]?.id);
  const [give, setGive] = useState(emptySide);
  const [take, setTake] = useState(emptySide);
  const partner = others.find((p) => p.id === to);
  const toggle = (set) => (pos) => set((s) => ({ ...s, props: s.props.includes(pos) ? s.props.filter((x) => x !== pos) : [...s.props, pos] }));
  const clean = (s) => ({ cash: Number.parseInt(s.cash, 10) || 0, props: s.props, cards: s.cards });
  const trade = { from: me.id, to, give: clean(give), take: clean(take) };
  const problem = !partner ? 'No hay con quién tratar.' : room.trade ? 'Ya hay un trato esperando respuesta: hay que esperar a que se cierre.' : tradeProblem(room, trade);
  const pickTo = (id) => { setTo(id); setTake(emptySide()); };

  const sideBox = (title, owner, side, set) => {
    const owned = ownedBy(room, owner.id).sort(bySet);
    const mine = owner.id === me.id;
    return (
      <fieldset className="mp-side" data-side={mine ? 'give' : 'take'}>
        <legend><Token player={owner} size={22} /> {title}</legend>
        <label className="mp-cash">
          <span>Plata</span>
          <input className="tf-input" inputMode="numeric" placeholder="$0" aria-label={`Plata que ${mine ? 'das' : 'recibís'}`} value={side.cash} onChange={(e) => set((s) => ({ ...s, cash: e.target.value.replace(/[^0-9]/g, '') }))} />
          <small>{mine ? 'Tenés' : 'Tiene'} {money(owner.cash)}</small>
        </label>
        <div className="mp-tchips mp-tpick">
          {owned.length === 0 && <small className="mp-tnone">{mine ? 'No tenés propiedades.' : 'No tiene propiedades.'}</small>}
          {owned.map((pos) => {
            const g = SQUARES[pos].g;
            const blocked = Boolean(g && groupHasBuildings(room, g));
            return (
              <PropChip
                key={pos} room={room} pos={pos} disabled={blocked} pressed={side.props.includes(pos)} onClick={() => toggle(set)(pos)}
                note={blocked ? 'con edificios' : undefined} title={blocked ? 'Hay edificios en ese color: hay que venderlos antes.' : undefined}
              />
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
      <p className="mp-note">Elegí con quién, y tocá lo que das y lo que querés a cambio. Si acepta, se intercambia todo junto. No se pueden tratar propiedades con edificios en su color.</p>
      <div className="mp-tpartners" role="group" aria-label="Tratar con">
        {others.map((p) => (
          <button key={p.id} type="button" aria-pressed={p.id === to} className={p.id === to ? 'is-picked' : ''} data-partner={p.name} onClick={() => pickTo(p.id)}>
            <Token player={p} size={26} />
            <span>{p.name}</span>
            <small>{money(p.cash)}</small>
          </button>
        ))}
      </div>
      <div className="mp-sides">
        {sideBox('Vos das', me, give, setGive)}
        {partner && sideBox(`${partner.name} te da`, partner, take, setTake)}
      </div>
      {partner && <OfferNotes room={room} trade={trade} me={me} />}
      {problem && <p className="mp-problem">{problem}</p>}
      <div className="mp-modal-actions">
        <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(problem)} data-act="tradeSend" onClick={() => { dispatch({ type: 'tradeOffer', to, give: trade.give, take: trade.take }); onClose(); }}>Proponer trato</button>
        <button type="button" className="tf-btn tf-btn-soft" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  );
}
