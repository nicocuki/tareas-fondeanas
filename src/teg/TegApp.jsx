// T.E.G.: entrada, sala de espera, partida y final.
import React, { useEffect, useMemo, useState } from 'react';
import { backend } from '../storage.js';
import { clearSession, loadSession, saveSession } from '../session.js';
import { LobbyLayout, LobbyOptions, OptionField, Segmented } from '../lobby/index.js';
import { isKicked } from '../lobby/kick.js';
import GameHero from '../ui/GameHero.jsx';
import JoinInvite from '../ui/JoinInvite.jsx';
import { useAutoCreate } from '../ui/mudanza.js';
import { AVATARS, getProfile, setProfile, useRegisterRoom } from '../ui/store.js';
import GameChat from '../ui/GameChat.jsx';
import { gameUrl } from '../ui/games.js';
import { ARMY_COLORS, COUNTRIES, NEIGHBORS, areNeighbors, objectiveById } from './board.js';
import {
  FORCED_TRADE, GAME_TYPE, MAX_PLAYERS, MIN_PLAYERS, applyAction, armiesOf, attackProblem, cleanName, countOf, findPlayer, indexOfPlayer, inGame,
  makeId, movable, newRoom, objectiveProgress,
} from './game.js';
import WorldMap from './Map.jsx';
import { DealBar, DealFly, MissionScene, useOpening } from './Opening.jsx';
import Reserve from './Reserve.jsx';
import DiceTray, { useBattle } from './Dice.jsx';
import {
  Chip, ContinentsPanel, HandPanel, LogPanel, ObjectivePanel, PlayersPanel, RulesPanel,
} from './Panels.jsx';
import { AttackDialog, BattleReport, MoveDialog, OccupyDialog } from './Dialogs.jsx';
import './teg.css';

const GAME = 'teg';

function codeFromUrl() {
  return (new URLSearchParams(window.location.search).get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
function setUrlCode(code) {
  window.history.replaceState(null, '', gameUrl(GAME, code));
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
function Entry({ onCreate, onJoin, busy, error, onBack }) {
  const profile = getProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [code, setCode] = useState(codeFromUrl);
  const [invite, setInvite] = useState(() => codeFromUrl().length === 4);
  const save = () => setProfile({ name, avatar });
  useAutoCreate(() => { save(); onCreate(name, avatar); }, Boolean(name.trim()));
  if (invite) {
    return (
      <div className="cs-root tg-page">
        <JoinInvite
          gameId={GAME} code={code} name={name} onName={setName} avatar={avatar} onAvatar={setAvatar}
          busy={busy} error={error} onBack={onBack}
          onJoin={() => { save(); onJoin(code, name, avatar); }}
          onCancel={() => { setInvite(false); setCode(''); setUrlCode(''); }}
        />
      </div>
    );
  }
  return (
    <div className="cs-root tg-page">
      <GameHero gameId={GAME} onBack={onBack} />
      <div className="tg-card tg-entry">
        <label className="tf-field">
          <span>Tu nombre</span>
          <input className="tf-input" value={name} maxLength={20} placeholder="¿Cómo te llamás?" autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="tf-field">
          <span>Avatar</span>
          <div className="tf-avatar-grid">
            {AVATARS.map((a) => <button key={a} type="button" aria-label={`Avatar ${a}`} aria-pressed={avatar === a} className={avatar === a ? 'is-selected' : ''} onClick={() => setAvatar(a)}>{a}</button>)}
          </div>
        </div>
        {error && <p className="tg-error" role="alert">{error}</p>}
        <button type="button" className="tf-btn tf-btn-primary tf-btn-block" disabled={busy || !cleanName(name)} onClick={() => { save(); onCreate(name, avatar); }}>
          Crear sala
        </button>
        <div className="tg-or"><span>o entrá con un código</span></div>
        <form className="tf-join-row" onSubmit={(e) => { e.preventDefault(); save(); onJoin(code, name, avatar); }}>
          <input className="tf-input tf-code-input" aria-label="Código de sala" placeholder="ABCD" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))} />
          <button type="submit" className="tf-btn tf-btn-soft" disabled={busy || code.length !== 4 || !cleanName(name)}>Unirme</button>
        </form>
      </div>
    </div>
  );
}

// ─── Sala de espera ──────────────────────────────────────────────────────────
function Lobby({ room, me, code, onDispatch, onLeave, onCopy, copied }) {
  const host = room.hostId === me?.id;
  const opts = room.options;
  const enough = room.players.length >= MIN_PLAYERS;
  return (
    <LobbyLayout
      code={code}
      roster={room.players}
      me={me?.id}
      onKick={(id) => onDispatch({ type: 'kick', target: id })}
      host={host}
      players={room.players.length}
      gameTitle="T.E.G. · sala de espera"
      subtitle={host ? 'Elegí las reglas y arrancá cuando estén todos.' : 'El anfitrión elige las reglas y arranca la partida.'}
      copied={copied}
      onCopyInvite={onCopy}
      onLeave={onLeave}
    >
      <div className="tg-card">
        <div className="tg-card-head">
          <h2>Jugadores</h2>
          <span>{room.players.length} / {MAX_PLAYERS}</span>
        </div>
        <ul className="tg-lobby-players">
          {room.players.map((p) => (
            <li key={p.id} className={p.id === me?.id ? 'is-me' : ''}>
              <span className="tg-lobby-army" style={{ background: ARMY_COLORS[p.color].color }}>{p.avatar}</span>
              <strong>{p.name}</strong>
              <small>Ejército {ARMY_COLORS[p.color].name.toLowerCase()}{p.id === room.hostId ? ' · 👑' : ''}{p.wins ? ` · 🏆 ${p.wins}` : ''}</small>
            </li>
          ))}
        </ul>
        <p className="tg-hint">Se juega de 2 a {MAX_PLAYERS}. El orden de los turnos y el reparto de países se sortean al empezar.</p>
      </div>

      <LobbyOptions canEdit={host}>
        <OptionField
          title="Cómo se gana"
          hint={opts.goal === 'secret' ? 'Cada uno recibe un objetivo secreto (continentes, países o destruir a un color). Además, cualquiera que llegue a 30 países gana.' : 'Sin objetivos secretos: gana el primero en ocupar 30 países.'}
        >
          <Segmented name="goal" value={opts.goal} disabled={!host} onChange={(v) => onDispatch({ type: 'setOptions', options: { goal: v } })} choices={[{ value: 'secret', label: 'Objetivos secretos' }, { value: 'conquer30', label: 'Conquistar 30 países' }]} />
        </OptionField>
      </LobbyOptions>

      <div className="tg-start">
        {host ? (
          <button type="button" className="tf-btn tf-btn-primary tg-start-btn" disabled={!enough} data-act="start" onClick={() => onDispatch({ type: 'start' })}>
            🌍 Empezar la guerra
          </button>
        ) : <p>Esperando que el anfitrión arranque…</p>}
        {!enough && <p className="tg-hint">Hacen falta al menos {MIN_PLAYERS} jugadores. Pasales el código.</p>}
      </div>
    </LobbyLayout>
  );
}

// ─── Qué hacer ahora ─────────────────────────────────────────────────────────
const AMOUNTS = [1, 5, 10, 'todos'];

function ActionBar({ room, me, mi, dispatch, amount, setAmount, setFrom, from }) {
  const cur = room.players[room.current];
  const setup = room.stage === 'setup1' || room.stage === 'setup2';
  const myTurn = !setup && room.current === mi && inGame(me);
  const forced = myTurn && room.stage === 'reinforce' && me.cards.length >= FORCED_TRADE;
  const amounts = (
    <div className="tg-amounts" role="group" aria-label="Cuántos ejércitos poner por toque">
      <small>Por toque:</small>
      {AMOUNTS.map((a) => (
        <button key={a} type="button" className={amount === a ? 'is-on' : ''} aria-pressed={amount === a} onClick={() => setAmount(a)} data-amount={a}>{a === 'todos' ? 'Todos' : `×${a}`}</button>
      ))}
    </div>
  );
  let text;
  let controls = null;
  if (!me || me.out || me.left) {
    text = me?.out ? '💀 Te eliminaron. Podés seguir mirando la partida.' : 'Estás mirando la partida.';
  } else if (setup) {
    text = me.pend > 0
      ? <><b>Poné tus ejércitos iniciales</b> ({room.stage === 'setup1' ? 'primera' : 'segunda'} tanda): te quedan <b data-pend>{me.pend}</b>. Arrastrá las fichas de tu reserva a tus países (o tocá un país: cada toque pone una). Todos ponen a la vez y no se sigue hasta que la reserva de todos quede en 0.</>
      : <><b>Listo.</b> Esperando a los demás…</>;
  } else if (!myTurn) {
    const stage = { reinforce: 'repartiendo refuerzos', attack: 'atacando', regroup: 'reagrupando' }[room.stage];
    text = <>Turno de <b>{cur.name}</b>: está {stage}.</>;
  } else if (room.stage === 'reinforce') {
    text = forced
      ? <><b>Tenés {FORCED_TRADE} cartas.</b> Canjeá tres (panel «Mis cartas») antes de seguir.</>
      : <><b>Refuerzos:</b> te quedan <b data-reinf>{room.reinf}</b> ejércitos por repartir. Tocá tus países para sumarles. Podés canjear cartas antes.</>;
    controls = (
      <>
        {room.reinf > 0 && !forced && amounts}
        <button type="button" className="tf-btn tf-btn-primary" disabled={room.reinf > 0 || forced} data-act="toAttack" onClick={() => dispatch({ type: 'toAttack' })}>Pasar a atacar ➜</button>
      </>
    );
  } else if (room.stage === 'attack') {
    text = room.pending
      ? <>Pasá ejércitos al país que conquistaste.</>
      : from !== null
        ? <><b>Atacás desde {COUNTRIES[from].name}.</b> Tocá un vecino enemigo marcado en rojo, o elegí otro país tuyo.</>
        : <><b>Ataque:</b> tocá un país tuyo con 2 o más ejércitos y después un vecino enemigo. Podés atacar las veces que quieras.</>;
    controls = (
      <>
        <button type="button" className="tf-btn tf-btn-soft" disabled={Boolean(room.pending)} data-act="toRegroup" onClick={() => { setFrom(null); dispatch({ type: 'toRegroup' }); }}>Reagrupar ➜</button>
        <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(room.pending)} data-act="endTurn" onClick={() => { setFrom(null); dispatch({ type: 'endTurn', turn: room.turnNo }); }}>Terminar turno{room.conq ? ' (y robar carta)' : ''}</button>
      </>
    );
  } else {
    text = from !== null
      ? <><b>Pasás desde {COUNTRIES[from].name}.</b> Tocá un vecino tuyo marcado, o elegí otro país.</>
      : <><b>Reagrupe:</b> tocá un país tuyo y después un vecino tuyo para pasarle ejércitos (siempre queda uno atrás).</>;
    controls = <button type="button" className="tf-btn tf-btn-primary" data-act="endTurn" onClick={() => { setFrom(null); dispatch({ type: 'endTurn', turn: room.turnNo }); }}>Terminar turno{room.conq ? ' (y robar carta)' : ''}</button>;
  }
  const stageLabel = setup ? (room.stage === 'setup1' ? 'Ejércitos iniciales · 1' : 'Ejércitos iniciales · 2') : { reinforce: '1 · Refuerzos', attack: '2 · Ataque', regroup: '3 · Reagrupe' }[room.stage];
  return (
    <div className="tg-action" data-stage={room.stage} aria-live="polite">
      <div className="tg-action-top">
        {!setup && <><Chip player={cur} size={16} /><strong>{myTurn ? 'Tu turno' : `Turno de ${cur.name}`}</strong></>}
        {setup && <strong>Preparación</strong>}
        <span className="tg-stage">{stageLabel}</span>
      </div>
      <p>{text}</p>
      {controls && <div className="tg-action-row">{controls}</div>}
    </div>
  );
}

// ─── Partida ─────────────────────────────────────────────────────────────────
// Pantalla completa: el mapa lo ocupa todo y lo demás flota encima (qué hacer, jugadores, reserva, y un cajón con los paneles).
const TABS = [
  ['mision', '🎯', 'Misión'], ['cartas', '🃏', 'Cartas'], ['jugadores', '👥', 'Jugadores'],
  ['continentes', '🌍', 'Continentes'], ['log', '📜', 'Bitácora'], ['reglas', '❓', 'Reglas'],
];

function PlayersHud({ room, me }) {
  const setup = room.stage === 'setup1' || room.stage === 'setup2';
  return (
    <ul className="tg-hud" aria-label="Jugadores">
      {room.players.map((p, i) => {
        const turn = room.phase === 'playing' && !setup && room.current === i && inGame(p);
        return (
          <li key={p.id} className={`${turn ? 'is-turn' : ''}${!inGame(p) ? ' is-out' : ''}`} style={{ '--who': ARMY_COLORS[p.color].color }}>
            <span className="tg-hud-av">{p.avatar}</span>
            <span className="tg-hud-name">{p.id === me.id ? 'Vos' : p.name}</span>
            <span className="tg-hud-stats" title="Países · ejércitos · cartas">
              🗺️{countOf(room, i)} 🪖{armiesOf(room, i)} 🃏{p.cards.length}
            </span>
            {turn && <b className="tg-hud-turn">▶</b>}
            {setup && inGame(p) && <b className={p.pend ? 'tg-hud-pend' : 'tg-hud-ok'}>{p.pend ? p.pend : '✓'}</b>}
            {p.out && <span className="tg-hud-tag">💀</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Game({ room, me, onDispatch, onLeave }) {
  const mi = indexOfPlayer(room, me.id);
  const setup = room.stage === 'setup1' || room.stage === 'setup2';
  const myTurn = !setup && room.current === mi && inGame(me);
  const [amount, setAmount] = useState(1);
  const [from, setFrom] = useState(null);
  const [attackTo, setAttackTo] = useState(null);
  const [moveTo, setMoveTo] = useState(null);
  const [tab, setTab] = useState(null);
  const [dropHover, setDropHover] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const host = room.hostId === me.id;
  const op = useOpening(room, me);
  const battle = useBattle(room);

  // Al cambiar de turno o de etapa se suelta lo que estaba elegido.
  useEffect(() => { setFrom(null); setAttackTo(null); setMoveTo(null); }, [room.turnNo, room.stage]);
  // El título de la pestaña avisa cuando te toca.
  useEffect(() => {
    if (!myTurn) return undefined;
    const before = document.title;
    document.title = `🌍 ¡Tu turno! · ${before}`;
    return () => { document.title = before; };
  }, [myTurn]);

  const forced = myTurn && room.stage === 'reinforce' && me.cards.length >= FORCED_TRADE;
  const reserve = !inGame(me) ? 0 : setup ? me.pend : myTurn && room.stage === 'reinforce' && !forced ? room.reinf : 0;
  const { targets, placeable } = useMemo(() => {
    const t = new Set();
    const p = new Set();
    if (!inGame(me)) return { targets: t, placeable: p };
    if (reserve > 0) room.own.forEach((o, c) => { if (o === mi) p.add(c); });
    if (myTurn && room.stage === 'attack' && !room.pending) {
      room.own.forEach((o, c) => { if (o === mi && room.arm[c] >= 2 && from === null) p.add(c); });
      if (from !== null) for (const n of NEIGHBORS[from]) if (room.own[n] !== mi) t.add(n);
    }
    if (myTurn && room.stage === 'regroup' && from !== null) for (const n of NEIGHBORS[from]) if (room.own[n] === mi) t.add(n);
    if (myTurn && room.stage === 'regroup' && from === null) room.own.forEach((o, c) => { if (o === mi && movable(room, c) > 0) p.add(c); });
    return { targets: t, placeable: p };
  }, [room, me, mi, myTurn, from, reserve]);

  // Poner ejércitos: en los iniciales, de a uno por toque o por ficha arrastrada; en los refuerzos, de a `amount`.
  function place(c) {
    if (reserve < 1 || room.own[c] !== mi) return;
    const n = setup || amount === 1 ? 1 : amount === 'todos' ? reserve : Math.min(amount, reserve);
    onDispatch({ type: 'place', c, n });
  }

  function pick(c) {
    if (!inGame(me) || op.phase || battle.showing) return; // mientras se reparte o ruedan los dados, el mapa solo se mira
    const mine = room.own[c] === mi;
    if (setup || (myTurn && room.stage === 'reinforce')) { if (mine) place(c); return; }
    if (!myTurn || room.pending) return;
    if (room.stage === 'attack') {
      if (mine) { setFrom(room.arm[c] >= 2 ? c : null); return; }
      if (from !== null && !attackProblem(room, mi, from, c)) setAttackTo({ from, to: c });
      return;
    }
    if (room.stage === 'regroup') {
      if (!mine) return;
      if (from !== null && from !== c && areNeighbors(from, c)) { setMoveTo({ from, to: c }); return; }
      setFrom(movable(room, c) > 0 ? c : null);
    }
  }

  const showAttack = attackTo && !room.pending && myTurn && room.stage === 'attack' && !battle.showing;
  const names = battle.showing ? { att: room.players[room.current]?.name || '', def: room.players[battle.showing.dv ?? room.own[battle.showing.t]]?.name || '' } : null;
  const color = ARMY_COLORS[me.color];
  const open = (t) => setTab((cur) => (cur === t ? null : t));
  const hasLast = room.last && room.last.f !== undefined;
  const reserveTitle = setup ? `Ejércitos iniciales · tanda ${room.stage === 'setup1' ? 1 : 2}` : 'Refuerzos';
  const showReserve = inGame(me) && !op.phase && (setup || reserve > 0);

  return (
    <div className="cs-root tg-page tg-playing">
      <div className="tg-board">
        <WorldMap
          room={op.shown} me={me} onPick={pick} from={from} targets={targets} placeable={placeable} hover={dropHover}
          overlay={op.phase === 'deal' ? <DealFly room={room} k={op.k} landed={op.landed} /> : null}
        />
        <div className="tg-top">
          {op.phase === 'deal'
            ? <DealBar room={room} k={op.k} landed={op.landed} me={me} onSkip={op.skip} />
            : !op.phase && <ActionBar room={room} me={me} mi={mi} dispatch={onDispatch} amount={amount} setAmount={setAmount} from={from} setFrom={setFrom} />}
        </div>
        <PlayersHud room={op.shown} me={me} />
        {showReserve && (
          <Reserve
            count={reserve} color={color.color} ink={color.ink} title={reserveTitle}
            hint={setup ? 'Arrastrá una ficha a un país tuyo, o tocá el país.' : 'Arrastrá fichas a tus países o tocalos.'}
            isValid={(i) => placeable.has(i)} onHover={setDropHover} onDrop={place}
          />
        )}
        <nav className="tg-dock" aria-label="Paneles">
          {TABS.map(([key, icon, label]) => (
            <button key={key} type="button" className={`${tab === key ? 'is-on' : ''}${key === 'cartas' && forced ? ' is-alert' : ''}`} aria-pressed={tab === key} data-tab={key} onClick={() => open(key)}>
              <span aria-hidden="true">{icon}</span><b>{label}</b>{key === 'cartas' && me.cards.length > 0 && <i>{me.cards.length}</i>}
            </button>
          ))}
        </nav>
        {tab && (
          <aside className="tg-drawer" data-drawer={tab}>
            <button type="button" className="tg-x" aria-label="Cerrar" onClick={() => setTab(null)}>✕</button>
            {tab === 'mision' && <ObjectivePanel room={room} me={me} mi={mi} />}
            {tab === 'cartas' && <HandPanel room={room} me={me} mi={mi} dispatch={onDispatch} />}
            {tab === 'jugadores' && <PlayersPanel room={room} me={me} onKick={(id) => onDispatch({ type: 'kick', target: id })} />}
            {tab === 'continentes' && <ContinentsPanel room={room} me={me} mi={mi} />}
            {tab === 'log' && (
              <>
                {hasLast && (
                  <section className="tg-panel" data-last>
                    <h2>Última batalla <small>{COUNTRIES[room.last.f].name} ➜ {COUNTRIES[room.last.t].name}</small></h2>
                    <BattleReport last={room.last} />
                  </section>
                )}
                <LogPanel room={room} />
              </>
            )}
            {tab === 'reglas' && <RulesPanel />}
            <div className="tg-leave">
              {host && !confirmEnd && <button type="button" className="tf-btn tf-btn-soft" onClick={() => setConfirmEnd(true)}>Terminar la partida</button>}
              {host && confirmEnd && (
                <>
                  <button type="button" className="tf-btn tf-btn-danger" data-act="toLobby" onClick={() => onDispatch({ type: 'toLobby' })}>Sí, volver a la sala de espera</button>
                  <button type="button" className="tf-btn tf-btn-soft" onClick={() => setConfirmEnd(false)}>No</button>
                </>
              )}
              <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir de la partida</button>
            </div>
          </aside>
        )}
      </div>

      {op.phase === 'mission' && <MissionScene room={room} me={me} mi={mi} onNext={op.toDeal} onSkip={op.skip} />}
      {battle.showing && <DiceTray key={battle.showing.n} last={battle.showing} names={names} onDone={battle.finish} />}
      {myTurn && room.pending && !battle.showing && <OccupyDialog room={room} onOccupy={(n) => { onDispatch({ type: 'occupy', n }); setAttackTo(null); }} />}
      {showAttack && (
        <AttackDialog
          room={room} from={attackTo.from} to={attackTo.to} onClose={() => setAttackTo(null)}
          onAttack={(dice) => onDispatch({ type: 'attack', from: attackTo.from, to: attackTo.to, dice, seen: room.rollN })}
          onBlitz={() => onDispatch({ type: 'blitz', from: attackTo.from, to: attackTo.to, seen: room.rollN })}
        />
      )}
      {moveTo && myTurn && room.stage === 'regroup' && (
        <MoveDialog room={room} from={moveTo.from} to={moveTo.to} onClose={() => setMoveTo(null)} onMove={(n) => { onDispatch({ type: 'move', from: moveTo.from, to: moveTo.to, n }); setMoveTo(null); setFrom(null); }} />
      )}
    </div>
  );
}

// ─── Fin ─────────────────────────────────────────────────────────────────────
function Ended({ room, me, onDispatch, onLeave }) {
  const winner = findPlayer(room, room.winner);
  const host = room.hostId === me?.id;
  const winnerIdx = room.players.indexOf(winner);
  const ranking = room.players
    .map((p, i) => ({ p, i, n: countOf(room, i) }))
    .sort((a, b) => (b.p.id === room.winner) - (a.p.id === room.winner) || b.n - a.n);
  const goal = winner && room.options.goal === 'secret' ? objectiveById(winner.obj) : null;
  const done = winnerIdx >= 0 && objectiveProgress(room, winnerIdx).done;
  return (
    <div className="cs-root tg-page">
      <div className="tg-card tg-ended">
        <div className="tg-winner">{winner ? <span className="tg-lobby-army is-big" style={{ background: ARMY_COLORS[winner.color].color }}>{winner.avatar}</span> : '🏳️'}</div>
        <p className="tf-eyebrow">Fin de la partida</p>
        <h1>{winner ? (winner.id === me?.id ? '¡Ganaste!' : `¡Ganó ${winner.name}!`) : 'Nadie ganó'}</h1>
        <p className="tg-hint">
          {goal && done ? <>Cumplió su objetivo: <b>{goal.text}</b>.</> : winner ? 'Llegó a 30 países o quedó como único jugador.' : ''}
        </p>
        <ul className="tg-ranking">
          {ranking.map(({ p, i, n }) => (
            <li key={p.id}>
              <span><Chip player={p} size={16} /> {p.avatar} {p.name}{p.id === room.winner ? ' 🏆' : ''}</span>
              <span className="tg-rank-obj">{room.options.goal === 'secret' && p.obj ? `Objetivo: ${objectiveById(p.obj).text}` : ''}</span>
              <strong>{p.out ? 'eliminado' : `${n} países`}</strong>
            </li>
          ))}
        </ul>
        <div className="tg-ended-actions">
          {host ? (
            <>
              <button type="button" className="tf-btn tf-btn-primary" data-act="start" onClick={() => onDispatch({ type: 'start' })}>🌍 Otra partida</button>
              <button type="button" className="tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Cambiar reglas</button>
            </>
          ) : <p className="tg-hint">El anfitrión puede arrancar otra.</p>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
        </div>
      </div>
    </div>
  );
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
export default function TegApp({ onBackToMenu }) {
  const [session, setSession] = useState(() => loadSession(codeFromUrl(), GAME));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = session?.code;
  const me = findPlayer(room, session?.playerId);

  useRegisterRoom(GAME, code, () => handleLeave());

  useEffect(() => {
    if (!code) return undefined;
    setRoom(null);
    return backend.subscribeRoom(code, (data) => {
      if (data && data.gameType === GAME_TYPE) { setRoom(data); return; }
      clearSession();
      setUrlCode('');
      setSession(null);
      setError('Esa sala ya no existe.');
    }, () => setError('No se pudo conectar con la sala.'));
  }, [code]);

  function enterRoom(next) {
    saveSession({ ...next, game: GAME });
    setUrlCode(next.code);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session) return null;
    try {
      return await backend.updateRoom(session.code, (current) => applyAction(current, { ...action, playerId: session.playerId }, { now: Date.now(), rand: Math.random }));
    } catch {
      setError('No se pudo guardar la jugada. Revisá tu conexión.');
      return null;
    }
  }

  async function handleCreate(name, avatar) {
    const clean = cleanName(name);
    if (!clean) { setError('Escribí tu nombre primero.'); return; }
    setBusy(true);
    try {
      const playerId = makeId();
      const { code: newCode } = await backend.createRoom(() => newRoom(playerId, clean, avatar));
      enterRoom({ code: newCode, playerId, name: clean });
    } catch {
      setError('No se pudo crear la sala. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(target, name, avatar) {
    const clean = cleanName(name);
    if (!clean) { setError('Escribí tu nombre primero.'); return; }
    setBusy(true);
    try {
      const playerId = makeId();
      const result = await backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: clean, avatar }));
      if (!result.room || result.room.gameType !== GAME_TYPE) { setError('No encontramos esa sala de T.E.G.'); return; }
      if (!findPlayer(result.room, playerId)) { setError(result.room.phase === 'lobby' ? 'La sala está llena.' : 'La partida ya empezó: no se puede entrar a mitad de juego.'); return; }
      enterRoom({ code: target, playerId, name: clean });
    } catch {
      setError('No se pudo conectar con la sala. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    const leaving = session;
    clearSession();
    setUrlCode('');
    setSession(null);
    setRoom(null);
    if (leaving) backend.updateRoom(leaving.code, (current) => applyAction(current, { type: 'leave', playerId: leaving.playerId })).catch(() => {});
  }

  async function copyInvite() {
    const link = gameUrl(GAME, code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copiá este link:', link);
    }
  }

  const banner = error && <p className="tg-error tg-banner" role="alert">{error}</p>;

  if (!session) return <>{banner}<Entry onCreate={handleCreate} onJoin={handleJoin} busy={busy} error={error} onBack={onBackToMenu} /></>;
  if (!room) return <div className="cs-root tg-page"><p className="tg-hint tg-msg">Entrando a la sala…</p></div>;
  if (!me || me.left) {
    return (
      <div className="cs-root tg-page">
        <div className="tg-card tg-msg">
          <p>{isKicked(room, session.playerId) ? 'El anfitrión te sacó de la sala.' : 'Ya no estás en esta sala.'}</p>
          {!isKicked(room, session.playerId) && room.phase === 'lobby' && <button type="button" className="tf-btn tf-btn-primary" onClick={() => dispatch({ type: 'join', name: session.name, avatar: getProfile().avatar })}>Volver a entrar</button>}
          <button type="button" className="tf-btn tf-btn-soft" onClick={handleLeave}>Salir</button>
        </div>
      </div>
    );
  }
  if (room.phase === 'lobby') return <>{banner}<Lobby room={room} me={me} code={code} onDispatch={dispatch} onLeave={handleLeave} onCopy={copyInvite} copied={copied} /><GameChat code={code} me={me} /></>;
  if (room.phase === 'ended') return <><Ended room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} /><GameChat code={code} me={me} /></>;
  return <>{banner}<Game room={room} me={me} onDispatch={dispatch} onLeave={handleLeave} /><GameChat code={code} me={me} /></>;
}
