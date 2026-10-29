// Lo que hay que hacer ahora: dice con palabras qué pasó, de quién es el turno y qué botones corresponden.
import React, { useState } from 'react';
import { JAIL_BAIL, SQUARES } from './board.js';
import { auctionChance, currentPlayer, debtTotal, debtsOf, findPlayer, liquidation } from './game.js';
import { Token } from './Board.jsx';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function Die({ value, rolling }) {
  const spots = PIPS[value] || [];
  return (
    <span className={`mp-die${rolling ? ' is-rolling' : ''}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={spots.includes(i) ? 'on' : ''} />)}
    </span>
  );
}

// Los dados de la última tirada. Girar y frenar lo hace `DiceRoll` (Stage.jsx), sobre el tablero.
export function Dice({ dice, rollN }) {
  if (!rollN) return null;
  return (
    <div className="mp-dice" aria-label={`Dados: ${dice[0]} y ${dice[1]}`} data-dice={dice.join(',')}>
      <Die value={dice[0]} />
      <Die value={dice[1]} />
    </div>
  );
}

// Qué está pasando cuando no es tu turno (o no podés hacer nada).
function whatsHappening(room) {
  const cur = currentPlayer(room);
  const debtor = room.debts.length ? findPlayer(room, room.debts[0].from) : null;
  if (debtor) return `${debtor.name} tiene que juntar $${debtTotal(room, debtor.id)} para pagar lo que debe. Hasta entonces la partida espera.`;
  if (room.step === 'auction') return `Se está subastando ${SQUARES[room.auction.pos].name}.`;
  if (room.step === 'buy') return `${cur.name} cayó en ${SQUARES[room.offer].name} ($${SQUARES[room.offer].price}) y decide si la compra.`;
  if (room.step === 'roll') return cur.jail > 0 ? `${cur.name} está en la cárcel y decide cómo salir.` : room.doubles > 0 ? `${cur.name} sacó dobles y tira otra vez.` : `${cur.name} tiene que tirar los dados.`;
  return `${cur.name} está terminando su turno.`;
}

function DebtBox({ room, me, dispatch }) {
  const [sure, setSure] = useState(false);
  const mine = debtsOf(room, me.id);
  const total = debtTotal(room, me.id);
  const first = mine[0];
  const canPay = me.cash >= first.n;
  const canRaise = liquidation(room, me.id) >= total;
  const who = (d) => (d.to === 'pot' ? 'al pozo del Descanso' : d.to ? `a ${findPlayer(room, d.to).name}` : 'al banco');
  return (
    <div className="mp-debt" data-debt>
      <p><b>⚠️ Tenés que pagar ${total}.</b></p>
      <ul>{mine.map((d, i) => <li key={i}>${d.n} {who(d)}{d.s !== undefined ? ` (${SQUARES[d.s].name})` : ''}</li>)}</ul>
      {!canPay && <p className="mp-hint">Te faltan ${first.n - me.cash}. Juntalos <b>hipotecando</b> propiedades, <b>vendiendo casas</b> o <b>haciendo un trato</b>, y después apretá «Pagar».</p>}
      <div className="mp-btn-row">
        <button type="button" className="tf-btn tf-btn-primary" disabled={!canPay} data-act="payDebt" onClick={() => dispatch({ type: 'payDebt' })}>Pagar ${first.n}</button>
        {!canRaise && !sure && <button type="button" className="tf-btn tf-btn-danger-soft" data-act="bankrupt" onClick={() => setSure(true)}>Declarar quiebra</button>}
        {sure && <button type="button" className="tf-btn tf-btn-danger" data-act="bankruptSure" onClick={() => dispatch({ type: 'bankrupt' })}>Sí, quebrar: pierdo todo</button>}
      </div>
      {!canRaise && <p className="mp-hint">Aunque vendas y hipoteques todo no llegás a pagar: la única salida es la quiebra.</p>}
    </div>
  );
}

export default function ActionPanel({ room, me, dispatch, onTrade, busy }) {
  if (room.phase !== 'playing') return null;
  const cur = currentPlayer(room);
  const myTurn = cur.id === me?.id;
  const myDebt = me && debtsOf(room, me.id).length > 0;
  const pending = room.trade;
  const tradeBtn = me && !me.out && (
    <button type="button" className="tf-btn tf-btn-soft" data-act="trade" disabled={Boolean(pending || room.auction)} onClick={onTrade} title={pending ? 'Ya hay un trato abierto.' : room.auction ? 'No mientras se subasta.' : undefined}>
      🤝 Hacer un trato
    </button>
  );

  let body;
  if (!me || me.out) {
    body = <p className="mp-say">{me?.out ? '💀 Quebraste. Podés seguir mirando la partida.' : 'Estás mirando la partida.'}</p>;
  } else if (myDebt) {
    body = <DebtBox room={room} me={me} dispatch={dispatch} />;
  } else if (!myTurn || room.step === 'auction' || room.debts.length) {
    body = <p className="mp-say">{whatsHappening(room)}</p>;
  } else if (room.step === 'roll') {
    const jailed = me.jail > 0;
    body = (
      <>
        {jailed ? (
          <>
            <p className="mp-say"><b>🔒 Estás en la cárcel</b> (intento {me.jail} de 3). Para salir: pagá ${JAIL_BAIL}{me.jf.length ? ', usá tu carta' : ''} o tirá los dados y buscá dobles. {me.jail >= 3 ? 'Si no sacás dobles esta vez, pagás $50 igual y salís.' : ''}</p>
            <div className="mp-btn-row">
              <button type="button" className="tf-btn tf-btn-soft" disabled={me.cash < JAIL_BAIL} data-act="payBail" onClick={() => dispatch({ type: 'payBail' })}>Pagar ${JAIL_BAIL}</button>
              {me.jf.length > 0 && <button type="button" className="tf-btn tf-btn-soft" data-act="useCard" onClick={() => dispatch({ type: 'useCard' })}>Usar carta</button>}
              <button type="button" className="tf-btn tf-btn-primary tf-btn-roll" data-act="roll" onClick={() => dispatch({ type: 'roll', seen: room.rollN })}>🎲 Tirar y buscar dobles</button>
            </div>
          </>
        ) : (
          <>
            <p className="mp-say">{room.doubles > 0 ? <><b>¡Sacaste dobles!</b> Tirás otra vez (si sacás tres dobles seguidos, vas a la cárcel).</> : <><b>Es tu turno.</b> Tirá los dados. Antes podés construir, hipotecar o hacer tratos.</>}</p>
            <div className="mp-btn-row">
              <button type="button" className="tf-btn tf-btn-primary tf-btn-roll" data-act="roll" onClick={() => dispatch({ type: 'roll', seen: room.rollN })}>🎲 Tirar los dados</button>
            </div>
          </>
        )}
      </>
    );
  } else if (room.step === 'buy') {
    const sq = SQUARES[room.offer];
    const short = sq.price - me.cash;
    const chance = auctionChance(room);
    body = (
      <>
        <p className="mp-say"><b>Caíste en {sq.name}</b>, que no tiene dueño. Cuesta ${sq.price}. Si la comprás, cada vez que otro caiga acá te paga alquiler.{short > 0 ? <> Te faltan ${short}: hipotecá algo si querés comprarla.</> : null}</p>
        <div className="mp-btn-row">
          <button type="button" className="tf-btn tf-btn-primary" disabled={short > 0} data-act="buy" onClick={() => dispatch({ type: 'buy' })}>Comprar por ${sq.price}</button>
          <button type="button" className="tf-btn tf-btn-soft" data-act="declineBuy" onClick={() => dispatch({ type: 'declineBuy' })}>{chance > 0 ? `No comprar (${chance < 100 ? `${chance} % de subasta` : 'subasta'})` : 'No comprar'}</button>
        </div>
        {chance > 0 && <p className="mp-hint">{chance < 100 ? `Si no la comprás, hay un ${chance} % de chances de que se subaste entre todos; si no sale, queda sin dueño.` : 'Si no la comprás, se subasta entre todos (vos también podés ofrecer).'}</p>}
      </>
    );
  } else {
    body = (
      <>
        <p className="mp-say"><b>Ya jugaste tu casillero.</b> Antes de pasar el turno podés construir, hipotecar o hacer tratos.</p>
        <div className="mp-btn-row">
          <button type="button" className="tf-btn tf-btn-primary" data-act="endTurn" onClick={() => dispatch({ type: 'endTurn', turn: room.turnNo })}>Terminar turno ➜</button>
        </div>
      </>
    );
  }

  return (
    <div className={`mp-action${busy ? ' is-busy' : ''}`} data-step={room.step}>
      <div className="mp-turn">
        <Token player={cur} size={30} current />
        <span>{myTurn ? 'Tu turno' : `Turno de ${cur.name}`}</span>
        <Dice dice={room.dice} rollN={room.rollN} />
      </div>
      {body}
      {pending && (
        <p className="mp-hint">
          {pending.from === me?.id ? `Esperando que ${findPlayer(room, pending.to).name} responda tu trato…` : pending.to === me?.id ? 'Tenés un trato para responder.' : `${findPlayer(room, pending.from).name} le propuso un trato a ${findPlayer(room, pending.to).name}.`}
          {pending.from === me?.id && <> <button type="button" className="mp-link" data-act="tradeCancel" onClick={() => dispatch({ type: 'tradeCancel' })}>Cancelar trato</button></>}
        </p>
      )}
      {tradeBtn && <div className="mp-btn-row mp-secondary">{tradeBtn}</div>}
    </div>
  );
}
