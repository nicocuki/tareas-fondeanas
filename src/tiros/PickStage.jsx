// Elegir carta, como en el original: de a uno, con las cinco cartas en arco y el personaje del que
// elige abajo, señalando con el brazo la carta a la que apunta. Todos lo ven en vivo: el que elige
// publica a qué carta apunta en `tiros/{sala}/elige` (sin pasar por la sala) y elige con el reducer.
//
// Todo se ubica en un lienzo de 1600 × 900 unidades: las cartas en % y el personaje en un SVG con
// el mismo viewBox, así el brazo llega justo a la carta en cualquier tamaño de pantalla.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { CARDS, RARITIES } from './cards.js';
import { currentPicker, findPlayer } from './game.js';

const W = 1600, H = 900;
const BODY = { x: 800, y: 960, r: 250 };
const ARC = { x: 800, y: 1120, r: 640, step: 21, tilt: 0.6 }; // centro y radio del arco, grados entre cartas y cuánto se inclinan
const CARD = { w: 196, h: 280, lift: 60, zoom: 1.22 };
const STAY_MS = 1000; // la elegida se queda sola arriba un segundo antes de irse

const angleOf = (i, n) => (i - (n - 1) / 2) * ARC.step;

function pose(i, n, active) {
  const a = (angleOf(i, n) * Math.PI) / 180;
  const r = ARC.r + (active ? CARD.lift : 0);
  return { x: ARC.x + r * Math.sin(a), y: ARC.y - r * Math.cos(a), deg: angleOf(i, n) * ARC.tilt, scale: active ? CARD.zoom : 1 };
}

// La carta más cercana a un punto del lienzo, según el ángulo visto desde el personaje.
function cardAt(x, y, n) {
  const deg = (Math.atan2(x - BODY.x, BODY.y - y) * 180) / Math.PI;
  return Math.max(0, Math.min(n - 1, Math.round(deg / ARC.step + (n - 1) / 2)));
}

function CardArt({ kind }) {
  return (
    <svg className="tt-arc-art" viewBox="0 0 100 70" aria-hidden="true">
      <path d="M0 70 L38 30 L58 50 L72 38 L100 66 L100 70 Z" className="tt-arc-hill" />
      <circle cx="50" cy="32" r="22" className="tt-arc-orb" />
      {kind === 'bullet' && <><circle cx="50" cy="32" r="8" className="tt-arc-ico" /><circle cx="34" cy="40" r="4.5" className="tt-arc-ico" /><circle cx="66" cy="25" r="3.5" className="tt-arc-ico" /></>}
      {kind === 'block' && <><circle cx="50" cy="32" r="12" className="tt-arc-ring" /><path d="M50 13v7M50 44v7M31 32h7M62 32h7" className="tt-arc-ring" /></>}
      {kind === 'player' && <path d="M50 46 C36 36 34 26 41 22 C45 20 49 22 50 26 C51 22 55 20 59 22 C66 26 64 36 50 46 Z" className="tt-arc-ico" />}
    </svg>
  );
}

function ArcCard({ id }) {
  const card = CARDS[id];
  if (!card) return null;
  const fx = card.lines.filter((l) => l[0] === '·');
  const stats = card.lines.filter((l) => l[0] !== '·');
  return (
    <div className={`tt-arc-card is-${card.rarity}`} data-card={id}>
      <i className="tt-arc-corner is-tl" /><i className="tt-arc-corner is-tr" /><i className="tt-arc-corner is-bl" /><i className="tt-arc-corner is-br" />
      <CardArt kind={card.kind} />
      <div className="tt-arc-text">
        {fx.map((l) => <p key={l} className="is-fx">{l.slice(2)}</p>)}
        {stats.map((l) => <p key={l} className={l[0] === '+' ? 'is-good' : 'is-bad'}>{l.slice(2)}</p>)}
      </div>
      <small>{RARITIES[card.rarity].label}</small>
    </div>
  );
}

// El personaje grande del que elige: cuerpo, cara enojada que mira a la carta y el brazo hasta ella.
function Picker({ color, target, n, hand }) {
  const card = pose(target, n, true);
  const dx = card.x - BODY.x, dy = card.y - BODY.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const sx = BODY.x + ux * BODY.r * 0.92, sy = BODY.y + uy * BODY.r * 0.92;
  const reach = (CARD.h * CARD.zoom) / 2 - 8; // la mano queda en el borde de abajo de la carta
  const hx = card.x - ux * reach, hy = card.y - uy * reach;
  // El brazo se curva un poco hacia afuera y abajo, como en el original.
  const side = dx >= 0 ? 1 : -1;
  const cx = (sx + hx) / 2 - uy * 70 * side, cy = (sy + hy) / 2 + ux * 70 * side;
  const look = Math.max(-1, Math.min(1, dx / 500));
  return (
    <svg className="tt-arc-picker" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <defs>
        <radialGradient id="tt-body-shine" cx="35%" cy="25%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id="tt-hand-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      {/* Posiciones como estilo (no atributo) para que la transición de CSS las anime. */}
      {hand && <path style={{ d: `path("M${sx} ${sy} Q${cx} ${cy} ${hx} ${hy}")` }} stroke={color} strokeWidth="22" strokeLinecap="round" fill="none" />}
      <circle cx={BODY.x} cy={BODY.y} r={BODY.r} fill={color} stroke="rgba(0,0,0,0.25)" strokeWidth="5" />
      <circle cx={BODY.x} cy={BODY.y} r={BODY.r} fill="url(#tt-body-shine)" />
      <g style={{ transform: `translateX(${look * 26}px)` }}>
        <ellipse cx="690" cy="866" rx="34" ry="16" fill="#ff5d73" opacity="0.28" />
        <ellipse cx="910" cy="866" rx="34" ry="16" fill="#ff5d73" opacity="0.28" />
        <path d="M640 760 L762 784 M960 760 L838 784" stroke="#1b1b24" strokeWidth="20" strokeLinecap="round" />
        <ellipse style={{ cx: 728 + look * 8 }} cy="826" rx="24" ry="36" fill="#1b1b24" />
        <ellipse style={{ cx: 872 + look * 8 }} cy="826" rx="24" ry="36" fill="#1b1b24" />
        <path d="M748 892 Q800 914 852 892" stroke="#1b1b24" strokeWidth="14" strokeLinecap="round" fill="none" />
      </g>
      {hand && (
        <>
          <circle style={{ cx: hx, cy: hy }} r="44" fill="#fff" opacity="0.75" filter="url(#tt-hand-glow)" />
          <circle style={{ cx: hx, cy: hy }} r="27" fill="#fff" />
        </>
      )}
    </svg>
  );
}

export default function PickStage({ room, me, code, now, onPick }) {
  const pick = room.picking;
  const pickerId = currentPicker(room);
  const picker = findPlayer(room, pickerId);
  const mine = pickerId === me.id;
  const hand = pick.hand || [];
  const n = hand.length;
  const turnKey = `${room.battle?.n || 0}:${pick.at}:${hand.join(',')}`;
  const [local, setLocal] = useState(Math.floor(n / 2));
  const [remote, setRemote] = useState(null);
  const [sent, setSent] = useState(false);
  const stage = useRef(null);
  const chan = useRef(null);

  useEffect(() => { setLocal(Math.floor(n / 2)); setSent(false); }, [turnKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que apunta el que elige, en vivo (sale y entra por el servidor de salas, sin la transacción).
  useEffect(() => {
    chan.current = backend.tirosChannel(code);
    return chan.current.subscribePoint((v) => setRemote(v));
  }, [code]);
  const hovered = mine ? local : remote?.k === turnKey && Number.isInteger(remote.i) ? remote.i : Math.floor(n / 2);

  function point(i) {
    if (!mine || sent || pick.chosen) return;
    const next = Math.max(0, Math.min(n - 1, i));
    if (next === local) return;
    setLocal(next);
    chan.current?.pointAt({ k: turnKey, i: next }).catch(() => {});
  }
  function choose(i = local) {
    if (!mine || sent || pick.chosen) return;
    setSent(true);
    onPick(hand[i], pick.at);
  }

  // Teclado: A/D o flechas para moverse, Espacio o Enter para elegir.
  const keys = useRef({});
  keys.current = { point, choose, local };
  useEffect(() => {
    if (!mine) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') { e.preventDefault(); keys.current.point(keys.current.local - 1); }
      else if (k === 'd' || k === 'arrowright') { e.preventDefault(); keys.current.point(keys.current.local + 1); }
      else if (k === ' ' || k === 'enter') { e.preventDefault(); keys.current.choose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mine]);

  const toStage = (e) => {
    const r = stage.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  // Con el mouse se apunta moviéndolo y el clic elige la que está debajo; con el dedo, el primer toque
  // apunta y el segundo elige.
  const onMove = (e) => { if (mine && e.pointerType === 'mouse') point(cardAt(...toStage(e), n)); };
  const onClick = (e) => {
    if (!mine) return;
    const i = cardAt(...toStage(e), n);
    if (i !== local) point(i);
    if (i === local || e.nativeEvent.pointerType === 'mouse') choose(i);
  };

  const chosenIndex = pick.chosen ? hand.indexOf(pick.chosen) : -1;
  const target = chosenIndex >= 0 ? chosenIndex : hovered;
  const leaving = chosenIndex >= 0 && now >= pick.chosenAt + STAY_MS;
  const later = pick.order.slice(pick.at + 1).map((id) => findPlayer(room, id)).filter((p) => p?.inGame);
  const left = Math.max(0, Math.ceil((room.phaseEndsAt - now) / 1000));
  const winner = findPlayer(room, room.roundWinner);

  return (
    <div className="tt-arc" ref={stage} onPointerMove={onMove} onClick={onClick} data-picking={pickerId} data-hovered={target} style={{ '--picker': picker?.color }}>
      <header className="tt-arc-head">
        <h1>
          {chosenIndex >= 0 ? (mine ? '¡Elegiste!' : `${picker?.name} eligió`) : mine ? '¡Te toca elegir!' : `Elige ${picker?.name || '…'}`}
          {chosenIndex < 0 && <span className="tt-arc-timer">{left} s</span>}
        </h1>
        <p>
          {winner && pick.at === 0 && !pick.chosen ? `${winner.name} ganó la ronda · ` : ''}
          {later.length ? `Después: ${later.map((p) => (p.id === me.id ? 'vos' : p.name)).join(', ')}` : 'Después arranca la pelea'}
        </p>
      </header>

      <div className="tt-arc-cards" key={turnKey}>
        {hand.map((id, i) => {
          const active = i === target;
          const p = pose(i, n, active);
          const dropped = (chosenIndex >= 0 && i !== chosenIndex) || (leaving && i === chosenIndex);
          return (
            <div
              key={id}
              className={`tt-arc-slot${active ? ' is-active' : ''}${dropped ? ' is-dropped' : ''}`}
              style={{
                left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, zIndex: active ? 5 : 1,
                transform: `translate(-50%, -50%) rotate(${p.deg}deg) scale(${p.scale})`,
              }}
            >
              <div className="tt-arc-rise" style={{ animationDelay: `${i * 70}ms` }}>
                <p className="tt-arc-name">{CARDS[id]?.name}</p>
                <ArcCard id={id} />
              </div>
            </div>
          );
        })}
        <div className={`tt-arc-body${leaving ? ' is-dropped' : ''}`}>
          <Picker color={picker?.color || '#f28c28'} target={target} n={n} hand={n > 0} />
        </div>
      </div>

      {mine && chosenIndex < 0 && (
        <p className="tt-arc-keys"><kbd>A</kbd> <kbd>D</kbd> o el mouse para moverte · <b>clic</b>, <kbd>Espacio</kbd> o <kbd>Enter</kbd> para elegir</p>
      )}
    </div>
  );
}

