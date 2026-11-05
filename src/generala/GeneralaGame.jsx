// Generala: la partida. A la izquierda la mesa en 3D (table.js, que se carga recién acá) y a la derecha
// la planilla. La mesa reproduce cada tirada; mientras una tirada se está viendo, la planilla y los botones
// siguen mostrando la sala de antes (como `useStagedRoom` en el Monopoly), así nadie ve el resultado antes
// de que los dados terminen de rodar.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { backend } from '../storage.js';
import {
  MAX_ROLLS, categoriesFor, currentPlayer, findPlayer, holdProblem, preview, rollProblem, scoreProblem, totalOf,
} from './game.js';
import { setSound, soundOn } from './sound.js';

const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

// Una carita de dado dibujada con CSS (para la fila de abajo de la mesa y el final).
export function Face({ value }) {
  return (
    <span className="gn-face" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <i key={n} className={PIPS[value]?.includes(n) ? 'is-on' : ''} />)}
    </span>
  );
}

// ─── La planilla ─────────────────────────────────────────────────────────────
// `totals`: la fila del total. Durante la partida no se muestra (pedido de Feli: el resultado es con suspenso, al final).
export function Sheet({ room, me, live, onScore, onKick, totals = false }) {
  const [confirm, setConfirm] = useState(null); // casilla que se está por tachar
  const cats = categoriesFor(room);
  const turn = room.turn;
  const playing = room.phase === 'playing';
  const options = live && playing ? preview(room) : {};
  const mine = playing && turn?.p === me?.id;
  const host = room.hostId === me?.id;
  useEffect(() => { setConfirm(null); }, [turn?.n, turn?.rollN]);

  return (
    <div className="gn-sheet-wrap" data-sheet>
      <table className="gn-sheet">
        <thead>
          <tr>
            <th className="gn-cat" scope="col">Planilla</th>
            {room.players.map((p) => (
              <th key={p.id} scope="col" className={`${playing && turn?.p === p.id ? 'is-turn' : ''} ${p.left ? 'is-left' : ''}`} style={{ '--c': p.color }} data-player={p.id}>
                <span className="gn-avatar">{p.avatar}</span>
                <span className="gn-name">{p.name}</span>
                {p.left && <small>se fue</small>}
                {host && onKick && playing && !p.left && p.id !== me.id && (
                  <button type="button" className="gn-kick" title={`Sacar a ${p.name}`} data-kick={p.id} onClick={() => { if (window.confirm(`¿Sacar a ${p.name} de la partida?`)) onKick(p.id); }}>✕</button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cats.map((c, row) => (
            <tr key={c.id} className={row === 6 ? 'is-games' : ''}>
              <th className="gn-cat" scope="row" title={c.hint}>
                <b>{c.label}</b>
                <span>{c.name}</span>
              </th>
              {room.players.map((p) => {
                const done = p.sheet[c.id];
                const current = playing && turn?.p === p.id;
                const option = current ? options[c.id] : undefined;
                if (done !== undefined) {
                  return <td key={p.id} className={`${done === 0 ? 'is-crossed' : 'is-done'} ${room.last?.p === p.id && room.last?.cat === c.id ? 'is-last' : ''}`} data-cell={`${p.id}:${c.id}`}>{done === 0 ? '✕' : done}</td>;
                }
                if (option === undefined) return <td key={p.id} className={current ? 'is-open' : ''} data-cell={`${p.id}:${c.id}`} />;
                if (!mine || p.id !== me.id) return <td key={p.id} className="is-preview" data-cell={`${p.id}:${c.id}`}>{option || ''}</td>;
                const asking = confirm === c.id;
                return (
                  <td key={p.id} className="is-choice" data-cell={`${p.id}:${c.id}`}>
                    <button
                      type="button" data-cat={c.id} data-points={option} className={option ? 'is-points' : asking ? 'is-ask' : 'is-zero'}
                      disabled={Boolean(scoreProblem(room, me.id, c.id))}
                      title={option ? `Anotar ${option} en ${c.name}` : `Tachar ${c.name} (vale cero)`}
                      onClick={() => {
                        if (!option && !asking) { setConfirm(c.id); return; }
                        setConfirm(null);
                        onScore(c.id);
                      }}
                    >
                      {option || (asking ? '¿Tachar?' : '✕')}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr>
              <th className="gn-cat" scope="row"><span>Total</span></th>
              {room.players.map((p) => <td key={p.id} data-total={p.id}>{totalOf(p.sheet)}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// Un botón que pide confirmar: el primer toque lo arma («¿Seguro?») y el segundo lo hace.
export function ConfirmButton({ children, ask = '¿Seguro?', onConfirm, ...rest }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" {...rest} data-armed={armed ? 1 : 0} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? ask : children}
    </button>
  );
}

// ─── La partida ──────────────────────────────────────────────────────────────
export default function GeneralaGame({ room, me, code, onDispatch, onLeave }) {
  const canvasRef = useRef(null);
  const tableRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(room.turn?.rollN ?? 0); // hasta qué tirada ya mostró la mesa
  const [sound, setSoundState] = useState(soundOn);
  const [toast, setToast] = useState(null);
  const channel = useMemo(() => backend.generalaChannel(code), [code]);

  // Mientras la mesa muestra una tirada, todo lo demás sigue con la sala de antes de esa tirada.
  const pending = ready && Boolean(room.turn) && room.turn.rollN !== shown;
  const frozen = useRef(room);
  if (!pending) frozen.current = room;
  const view = pending ? frozen.current : room;
  const turn = view.turn;
  const player = currentPlayer(view);
  const mine = player?.id === me.id;
  const live = !pending && ready;
  const canRoll = live && mine && !rollProblem(view, me.id);
  const canHold = live && mine && !holdProblem(view, me.id);

  // Lo que la mesa necesita en cada callback, siempre al día.
  const api = useRef({});
  api.current = {
    async onThrow({ throw: gesture, values, poses, seen }) {
      const result = await onDispatch({ type: 'roll', seen, throw: gesture, values, poses });
      return Boolean(result?.committed);
    },
    onHold(i) {
      const t = room.turn;
      if (t) onDispatch({ type: 'hold', i, turn: t.n, seen: t.rollN });
    },
    onHand({ x, z }) {
      const t = room.turn;
      if (t) channel.publishHand({ n: t.n, r: t.rollN, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }).catch(() => {});
    },
  };

  useEffect(() => {
    let table = null;
    let dead = false;
    import('./table.js')
      .then(({ createTable }) => createTable(canvasRef.current, {
        onShown: (n) => setShown(n),
        onThrow: (t) => api.current.onThrow(t),
        onHold: (i) => api.current.onHold(i),
        onHand: (h) => api.current.onHand(h),
      }))
      .then((t) => {
        if (dead) { t.dispose(); return; }
        table = t;
        tableRef.current = t;
        window.__generala = t; // para manejar la mesa desde un navegador automatizado
        setReady(true);
      })
      .catch((err) => { console.error(err); if (!dead) setFailed(true); });
    return () => {
      dead = true;
      table?.dispose();
      tableRef.current = null;
      if (window.__generala === table) delete window.__generala;
    };
  }, []);

  // La mesa siempre recibe la sala de verdad: ella decide cuándo mostrar cada cosa.
  useEffect(() => {
    if (!ready) return;
    const real = room.turn && room.turn.p === me.id;
    tableRef.current?.sync({
      turn: room.turn, mine: real,
      canRoll: Boolean(real && !rollProblem(room, me.id)),
      canHold: Boolean(real && !holdProblem(room, me.id)),
    });
  }, [ready, room, me.id]);

  // El cubilete en la mano de otro.
  useEffect(() => {
    if (!ready) return undefined;
    return channel.subscribeHand((hand) => tableRef.current?.setRemoteHand(hand && typeof hand === 'object' ? hand : null));
  }, [ready, channel]);

  // Espacio: apretar para sacudir, soltar para tirar.
  useEffect(() => {
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
    const down = (e) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) tableRef.current?.press();
    };
    const up = (e) => { if (e.code === 'Space' && !typing(e)) tableRef.current?.release(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Aviso de lo último que se anotó.
  const last = view.last;
  useEffect(() => {
    if (!last) return undefined;
    const who = findPlayer(view, last.p);
    const cat = categoriesFor(view).find((c) => c.id === last.cat) || { name: last.cat };
    setToast({ key: last.n, who, text: last.pts ? `anotó ${last.pts} en ${cat.name}` : `tachó ${cat.name}`, served: last.served, zero: !last.pts });
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [last?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // El botón: apretado sacude, al soltar tira. Con un clic suelto (teclado o navegador automatizado) hace las dos cosas.
  const held = useRef(false);
  const buttonDown = (e) => { if (e.button === 0 && tableRef.current?.press()) held.current = true; };
  const buttonUp = () => { if (held.current) tableRef.current?.release(); };
  const buttonClick = () => {
    if (held.current) { held.current = false; return; }
    if (tableRef.current?.press()) setTimeout(() => tableRef.current?.release(), 420);
  };

  const rolls = turn?.rolls ?? 0;
  let hint = '';
  if (failed) hint = 'No se pudo abrir la mesa en 3D en este navegador.';
  else if (!ready) hint = 'Preparando la mesa…';
  else if (pending) hint = mine ? 'Rodando…' : `${player?.name || 'Alguien'} tiró…`;
  else if (!mine) hint = player ? `Le toca a ${player.name}.` : '';
  else if (turn.cocked) hint = '¡Dado montado! Esa tirada no vale: tirá de nuevo los mismos dados.';
  else if (rolls === 0) hint = 'Mantené apretado sobre la mesa para sacudir el cubilete y soltá para tirar.';
  else if (rolls < MAX_ROLLS) hint = 'Tocá los dados que querés guardar y tirá de nuevo, o anotá en la planilla.';
  else hint = 'No quedan tiradas: anotá en la planilla (o tachá una casilla).';

  return (
    <div className="gn-play" data-stage={pending ? 'rolling' : turn?.cocked ? 'cocked' : rolls >= MAX_ROLLS ? 'score' : rolls ? 'choose' : 'roll'} data-turn={turn?.p} data-rolls={rolls}>
      <div className="gn-stage">
        <canvas ref={canvasRef} className="gn-canvas" data-generala-canvas />
        <div className="gn-vignette" aria-hidden="true" />

        <div className={`gn-top ${mine ? 'is-mine' : ''}`} style={{ '--c': player?.color }}>
          <span className="gn-top-who">{player ? <>{player.avatar} {mine ? '¡Te toca!' : player.name}</> : '—'}</span>
          <span className="gn-rolls" aria-label={`Tirada ${rolls} de ${MAX_ROLLS}`} data-rolls-left={MAX_ROLLS - rolls}>
            {Array.from({ length: MAX_ROLLS }, (_, k) => <i key={k} className={k < rolls ? 'is-used' : ''} />)}
          </span>
        </div>

        {toast && (
          <p key={toast.key} className={`gn-toast ${toast.zero ? 'is-zero' : ''}`} style={{ '--c': toast.who?.color }} role="status">
            <b>{toast.who?.avatar} {toast.who?.name}</b> {toast.text}{toast.served && <em>¡servido!</em>}
          </p>
        )}

        <button type="button" className="gn-sound" aria-pressed={sound} title={sound ? 'Apagar el sonido' : 'Prender el sonido'} data-act="sound" onClick={() => { setSound(!sound); setSoundState(!sound); }}>
          {sound ? '🔊' : '🔇'}
        </button>

        <div className="gn-bottom">
          <p className={`gn-hint ${turn?.cocked && !pending ? 'is-alert' : ''}`} data-hint>{hint}</p>
          <div className="gn-controls">
            <div className="gn-dice" data-dice>
              {[0, 1, 2, 3, 4].map((i) => {
                const value = turn?.dice[i] || 0;
                const onTable = Boolean(turn?.poses[i]);
                const isHeld = Boolean(turn?.held[i]) && onTable;
                return (
                  <button
                    key={i} type="button" className={`gn-die ${isHeld ? 'is-held' : ''} ${onTable && !value ? 'is-cocked' : ''} ${onTable ? '' : 'is-cup'}`}
                    data-die={i} data-value={value} data-held={isHeld ? 1 : 0} disabled={!canHold || !value}
                    title={!onTable ? 'En el cubilete' : !value ? 'Montado: no vale' : isHeld ? 'Guardado: tocá para volver a tirarlo' : 'Tocá para guardarlo'}
                    onClick={() => api.current.onHold(i)}
                  >
                    {value ? <Face value={value} /> : <span className="gn-face is-empty">{onTable ? '✕' : ''}</span>}
                    <small>{isHeld ? 'guardado' : ''}</small>
                  </button>
                );
              })}
            </div>
            <button
              type="button" className="gn-roll" data-act="roll" disabled={!canRoll}
              onPointerDown={buttonDown} onPointerUp={buttonUp} onPointerCancel={buttonUp} onPointerLeave={buttonUp} onClick={buttonClick}
              onKeyDown={(e) => { if (e.code === 'Space') e.preventDefault(); }}
            >
              🎲 {turn?.cocked ? 'Tirar de nuevo' : rolls === 0 ? 'Tirar' : rolls >= MAX_ROLLS ? 'Sin tiradas' : `Tirar (${MAX_ROLLS - rolls})`}
            </button>
          </div>
        </div>
      </div>

      <aside className="gn-side" style={{ '--players': view.players.length }}>
        <Sheet
          room={view} me={me} live={live}
          onScore={(cat) => onDispatch({ type: 'score', cat, turn: view.turn.n })}
          onKick={(id) => onDispatch({ type: 'kick', target: id })}
        />
        <p className="gn-note">
          {view.options.servida ? 'Generala servida gana la partida. ' : ''}Servido (en la primera tirada) vale 5 más. El total se ve al final.
        </p>
        <div className="gn-side-actions">
          {room.hostId === me.id && (
            <ConfirmButton className="tf-btn tf-btn-soft" data-act="end" ask="¿Terminar ahora?" onConfirm={() => onDispatch({ type: 'endGame' })}>🏁 Terminar la partida</ConfirmButton>
          )}
          <ConfirmButton className="tf-btn tf-btn-soft" data-act="leave" ask="¿Salir de la partida?" onConfirm={onLeave}>Salir</ConfirmButton>
        </div>
      </aside>
    </div>
  );
}
