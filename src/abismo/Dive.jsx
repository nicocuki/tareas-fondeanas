// Abismo: la inmersión. La consigna, el campo para responder, el mar que se va oscureciendo y la animación en la
// que cada respuesta hunde al jugador hasta su nivel (las líneas punteadas son los niveles). Todo lo de acá es
// dibujo: la sala ya trae los puntos cuando llega el revelado; lo único que se manda es la respuesta (`answer`)
// y, el anfitrión, «Descender» (`next`).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { activePlayers, answersOf, promptAt } from './game.js';
import { TIERS, cleanAnswer, depthOf, fmtDepth, tierById } from './tiers.js';
import { Boat, Cloud, Fish, Krill, Sun, Weed } from './Art.jsx';
import { play, useMuted } from './sfx.js';

const SCALE = 1.3; // píxeles por metro
const SKY_M = 700;  // cuánto cielo hay arriba de la superficie (en «metros» de dibujo)
const SEA_M = 8200; // hasta dónde llega el mar dibujado (el máximo son 10 rondas × 1.000 m)
// Carteles que aparecen al pasar por ciertas profundidades, como en el original.
const LANDMARKS = [
  [40, 'hasta acá llega el buceo recreativo'],
  [200, 'acá empieza a faltar la luz'],
  [332, 'el buceo más profundo con tanque: 332 m'],
  [535, 'los pingüinos emperador bajan hasta acá'],
  [700, 'presión: 70 veces la de la superficie'],
  [1000, 'zona de medianoche: oscuridad total'],
  [1280, 'el elefante marino llega hasta acá'],
  [1800, 'el calamar gigante vive por acá'],
  [2250, 'el cachalote, el mamífero que más hondo baja'],
  [2900, 'el pez más profundo que se filmó: 8.300 m… falta'],
  [3800, 'el Titanic descansa a esta profundidad'],
  [4500, 'acá viven los pepinos de mar abisales'],
  [5500, 'más hondo que el Aconcagua es alto'],
  [6000, 'zona hadal: las fosas oceánicas'],
  [7000, 'un dron argentino bajó hasta acá en 2024'],
];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// La profundidad de cada jugador antes y después de esta ronda.
function depthsOf(room) {
  const round = answersOf(room);
  const out = {};
  for (const p of activePlayers(room)) {
    const after = depthOf(p.score);
    const gained = room.phase === 'reveal' ? depthOf(round[p.id]?.p || 0) : 0;
    out[p.id] = { before: after - gained, after, gained };
  }
  return out;
}

// El reloj redondo de abajo a la izquierda.
function Clock({ left, total }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, left / total));
  const secs = Math.max(0, Math.ceil(left / 1000));
  return (
    <div className={`ab-clock${secs <= 5 ? ' is-urgent' : ''}`} data-clock={secs}>
      <svg viewBox="0 0 44 44" width="52" height="52" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#1f3350" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 22 22)" />
      </svg>
      <span>{secs}</span>
    </div>
  );
}

export default function Dive({ room, me, now, onDispatch, judge, screenRef }) {
  const prompt = promptAt(room);
  const round = room.round;
  const total = room.options.rounds;
  const players = activePlayers(room);
  const inGame = Boolean(me?.inGame);
  const mine = inGame ? answersOf(room)[me.id] : null;
  const host = room.hostId === me?.id;
  const depths = useMemo(() => depthsOf(room), [room]);
  const [muted, toggleMuted] = useMuted();

  // A quién sigue la cámara: a mí, o al que va más hondo si solo miro.
  const followId = inGame ? me.id : [...players].sort((a, b) => b.score - a.score)[0]?.id;

  // ─── La animación del revelado ───────────────────────────────────────────
  const [anim, setAnim] = useState(null); // { key, t0, dur }
  const [frame, setFrame] = useState(0);
  const revealKey = room.phase === 'reveal' ? `${room.startedAt}:${round}` : '';
  useEffect(() => {
    if (!revealKey) { setAnim(null); return undefined; }
    const maxGain = Math.max(0, ...Object.values(depths).map((d) => d.gained));
    const dur = 700 + maxGain * 1.6;
    setAnim({ key: revealKey, t0: performance.now(), dur, maxGain });
    const myGain = depths[followId]?.gained || 0;
    play(myGain > 0 ? 'sink' : 'miss');
    let raf = 0;
    const loop = () => { setFrame((f) => f + 1); if (performance.now() - t0 < dur + 50) raf = requestAnimationFrame(loop); };
    const t0 = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [revealKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const progress = anim ? Math.min(1, (performance.now() - anim.t0) / anim.dur) : 1;
  const landed = !anim || progress >= 1;
  const shownDepth = (id) => {
    const d = depths[id];
    if (!d) return 0;
    return d.before + (d.after - d.before) * ease(progress);
  };
  // Al llegar, la cámara baja un poco más para que el krill quede arriba del cartel del resultado.
  const cam = shownDepth(followId) + (room.phase === 'reveal' && landed ? 130 : 0);

  // Sonidos de la bajada: cada línea de nivel que se cruza, y el golpe al llegar.
  const passedRef = useRef(0);
  const landedRef = useRef('');
  useEffect(() => {
    if (!anim) { passedRef.current = 0; return; }
    const d = depths[followId];
    if (!d) return;
    const gained = shownDepth(followId) - d.before;
    const passed = TIERS.filter((t) => depthOf(t.pts) <= gained && depthOf(t.pts) < d.gained).length;
    if (passed > passedRef.current) { passedRef.current = passed; play('tierline'); }
    if (landed && landedRef.current !== anim.key) {
      landedRef.current = anim.key;
      const a = answersOf(room)[followId];
      if (!a) return;
      play(a.k === 'krill' ? 'krillion' : a.p >= 60 ? 'landBig' : 'landSmall');
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Responder ──────────────────────────────────────────────────────────────
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [shake, setShake] = useState(0);
  const input = useRef(null);
  const promptKey = `${room.startedAt}:${round}`;
  useEffect(() => {
    setValue(''); setMsg(''); setBusy(false);
    if (room.phase === 'prompt') { play('category'); setTimeout(() => input.current?.focus(), 50); }
  }, [promptKey, room.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = room.phaseEndsAt - now;
  const secs = Math.ceil(left / 1000);
  const lastTick = useRef(99);
  useEffect(() => {
    if (room.phase !== 'prompt' || mine || !inGame) return;
    if (secs <= 5 && secs >= 1 && secs !== lastTick.current) { lastTick.current = secs; play('tick'); }
  }, [secs, room.phase, mine, inGame]);

  async function submit(e) {
    e?.preventDefault();
    const text = cleanAnswer(value);
    if (!text || busy || mine || room.phase !== 'prompt' || left <= 0) return;
    setBusy(true);
    setMsg('');
    play('submit');
    const res = await judge(prompt.id, text);
    if (!res.ok) {
      setMsg(res.reason || 'Eso no vale.');
      play('reject');
      setShake((s) => s + 1);
      setBusy(false);
      setTimeout(() => input.current?.focus(), 30);
      return;
    }
    const r = await onDispatch({ type: 'answer', round, text: res.text, canonical: res.canonical, tier: res.tier, note: res.note, sig: res.sig });
    setBusy(false);
    if (!r?.room || !answersOf(r.room)[me.id]) setMsg('Llegó tarde: la ronda ya se cerró.');
    else setValue('');
  }

  // ─── Decorado ───────────────────────────────────────────────────────────────
  const decor = useMemo(() => {
    let s = 1234567;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const fish = Array.from({ length: 34 }, (_, i) => ({ id: i, d: 30 + rnd() * 3800, x: rnd() * 100, dur: 24 + rnd() * 40, delay: -rnd() * 60, flip: rnd() < 0.5, k: 2 + Math.round(rnd()) }));
    const bubbles = Array.from({ length: 14 }, (_, i) => ({ id: i, d: 60 + rnd() * 2400, x: rnd() * 100, dur: 6 + rnd() * 8, delay: -rnd() * 12 }));
    const weeds = Array.from({ length: 10 }, (_, i) => ({ id: i, d: 150 + rnd() * 2600, x: rnd() < 0.5 ? 1 + rnd() * 6 : 90 + rnd() * 7, k: 3 + Math.round(rnd() * 2) }));
    const ticks = Array.from({ length: SEA_M / 100 }, (_, i) => (i + 1) * 100);
    return { fish, bubbles, weeds, ticks };
  }, []);

  // Las líneas de nivel de esta ronda salen de donde estaba el jugador al empezarla.
  const base = depths[followId]?.before || 0;
  const myGainNow = shownDepth(followId) - base;
  const y = (d) => d * SCALE;

  // ─── Lo que se muestra encima ───────────────────────────────────────────────
  const roundAnswers = answersOf(room);
  const results = players.map((p) => ({ p, a: roundAnswers[p.id] || null })).sort((a, b) => (b.a?.p || 0) - (a.a?.p || 0));
  const myResult = inGame ? roundAnswers[me.id] : null;
  const myTier = myResult ? tierById(myResult.k) : null;
  const last = round >= total;
  const waiting = players.filter((p) => !roundAnswers[p.id]);
  const overtime = room.phase === 'prompt' && left <= 0;

  return (
    <div className="ab-screen" ref={screenRef} data-phase={room.phase} data-round={round} data-landed={room.phase === 'reveal' && landed ? '1' : '0'}>
      <div className="ab-world" style={{ transform: `translateY(${-y(cam)}px)` }}>
        <div className="ab-sky" style={{ top: -y(SKY_M), height: y(SKY_M) }}>
          <Sun scale={7} className="ab-sun" />
          <Cloud scale={4} className="ab-cloud" style={{ left: '12%', bottom: y(SKY_M) * 0.55 }} />
          <Cloud scale={3} className="ab-cloud" style={{ left: '48%', bottom: y(SKY_M) * 0.7 }} />
          <Cloud scale={5} className="ab-cloud" style={{ left: '70%', bottom: y(SKY_M) * 0.42 }} />
          <Boat scale={4} className="ab-boat" />
        </div>
        <div className="ab-sea" style={{ height: y(SEA_M) }}>
          <div className="ab-rays" />
          {decor.weeds.map((w) => <Weed key={w.id} scale={w.k} className="ab-weed" style={{ top: y(w.d), left: `${w.x}%` }} />)}
          {decor.fish.map((f) => (
            <div key={f.id} className="ab-fish" style={{ top: y(f.d), left: `${f.x}%`, '--dur': `${f.dur}s`, '--delay': `${f.delay}s`, '--dir': f.flip ? -1 : 1, opacity: Math.max(0.12, 0.9 - f.d / 2600) }}>
              <Fish scale={f.k} flip={f.flip} color={f.d > 900 ? '#06101f' : '#0b1a2e'} />
            </div>
          ))}
          {decor.bubbles.map((b) => <i key={b.id} className="ab-bubble" style={{ top: y(b.d), left: `${b.x}%`, '--dur': `${b.dur}s`, '--delay': `${b.delay}s` }} />)}
          {decor.ticks.map((d) => <div key={d} className={`ab-tick${d % 500 === 0 ? ' is-major' : ''}`} style={{ top: y(d) }}><span>-{d}m</span></div>)}
          {LANDMARKS.map(([d, text]) => <div key={d} className="ab-landmark" style={{ top: y(d) }}><span>{text}</span></div>)}
          {TIERS.map((t) => {
            const at = base + depthOf(t.pts);
            const passed = myGainNow >= depthOf(t.pts) - 0.5;
            return (
              <div key={t.id} className={`ab-tierline${passed ? ' is-passed' : ''}`} style={{ top: y(at), '--tc': t.color }} data-tierline={t.id}>
                <span>{t.icon} {t.name} · {t.pts}</span>
              </div>
            );
          })}
          {players.map((p, i) => {
            const d = shownDepth(p.id);
            const a = roundAnswers[p.id];
            const isMe = p.id === me?.id;
            const x = isMe ? 50 : 18 + ((i * 37) % 64);
            const tier = a && room.phase === 'reveal' ? tierById(a.k) : null;
            return (
              <div key={p.id} className={`ab-diver${isMe ? ' is-me' : ''}`} style={{ top: y(d), left: `${x}%` }} data-diver={p.id} data-m={Math.round(d)}>
                <Krill scale={isMe ? 4 : 3} color={isMe ? '#ff5d8f' : '#ff9fbd'} />
                <span className="ab-diver-name">{p.avatar} {p.name}</span>
                {room.phase === 'reveal' && (
                  <span className="ab-diver-answer" style={{ color: landed && tier ? tier.color : undefined }}>
                    {a ? `«${a.c}»` : 'sin respuesta'}{landed ? '' : ' ▼'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* HUD */}
      <div className="ab-hud">
        <div className="ab-box"><small>Profundidad</small><strong data-depth>{fmtDepth(shownDepth(followId))}</strong></div>
        <div className="ab-progress">
          <div className="ab-dots" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => {
              const a = inGame ? room.answers?.[i]?.[me.id] : null;
              const done = i + 1 < round || (i + 1 === round && room.phase === 'reveal');
              const color = done ? (a ? tierById(a.k)?.color : '#3d4f6e') : undefined;
              return <i key={i} className={i + 1 === round ? 'is-now' : done ? 'is-done' : ''} style={color ? { background: color } : undefined} />;
            })}
          </div>
          <small>Consigna {round} de {total}</small>
        </div>
        <div className="ab-box"><small>Puntos</small><strong data-score>{inGame ? me.score : ''}</strong></div>
      </div>
      <button type="button" className="ab-mute" onClick={toggleMuted} aria-label={muted ? 'Prender el sonido' : 'Silenciar'} title={muted ? 'Prender el sonido' : 'Silenciar'}>{muted ? '🔇' : '🔊'}</button>

      {room.phase === 'prompt' && (
        <>
          <div className="ab-prompt" data-prompt={prompt?.id}>
            <small>Consigna {round} de {total}</small>
            <h2>{prompt?.text}</h2>
            <p>▼ las respuestas más raras se hunden más ▼</p>
          </div>
          <div className="ab-bottom">
            {!inGame ? (
              <p className="ab-status">Entraste con la partida empezada: mirás esta y jugás la próxima.</p>
            ) : mine ? (
              <div className="ab-sent" data-sent>
                <p>«{mine.c}» ya está en el agua. Esperando a {waiting.length === 1 ? waiting[0].name : `${waiting.length} más`}…</p>
                <ul>{players.map((p) => <li key={p.id} className={roundAnswers[p.id] ? 'is-done' : ''} title={p.name}>{p.avatar}</li>)}</ul>
              </div>
            ) : (
              <>
                <form className={`ab-answer${shake ? ' is-shake' : ''}`} key={shake} onSubmit={submit}>
                  <Clock left={left} total={room.options.seconds * 1000} />
                  <input
                    ref={input}
                    className="ab-input"
                    value={value}
                    maxLength={32}
                    placeholder={overtime ? 'se acabó el tiempo' : 'escribí una sola respuesta…'}
                    disabled={busy || overtime}
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-label="Tu respuesta"
                    data-answer
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <button type="submit" className="ab-dive-btn" disabled={busy || overtime || !cleanAnswer(value)} data-act="dive">{busy ? '…' : 'Sumergir'}</button>
                </form>
                <p className={`ab-status${msg ? ' is-reject' : ''}`} role="status" data-status>
                  {busy ? 'El juez lo está pensando…' : msg || (overtime ? `Cerrando la ronda${waiting.length ? ' (el juez termina de juzgar)' : ''}…` : 'Una sola palabra o nombre. Si no vale, probá otra.')}
                </p>
              </>
            )}
          </div>
        </>
      )}

      {room.phase === 'reveal' && landed && (
        <div className="ab-reveal" data-reveal>
          {inGame && (
            <div className="ab-result" style={{ '--tc': myTier?.color || '#3d4f6e' }}>
              <span className="ab-result-icon" aria-hidden="true">{myTier ? myTier.icon : '🫧'}</span>
              <h2 data-tier={myTier?.id || 'nada'}>{myTier ? myTier.name : 'Te quedaste en la superficie'}</h2>
              {myResult && <p className="ab-result-answer">«{myResult.c}»{myResult.t ? <small> (escribiste «{myResult.t}»)</small> : null}</p>}
              <p className="ab-result-pts">{myResult ? <><b>+{myResult.p} pts</b> · se hunde {fmtDepth(depthOf(myResult.p))}</> : <b>+0 pts</b>}</p>
              <p className="ab-result-note">{myResult ? myResult.n || myTier?.blurb : 'Sin respuesta válida a tiempo. La próxima sale.'}</p>
            </div>
          )}
          {players.length > 1 && (
            <ol className="ab-results" data-results>
              {results.map(({ p, a }) => {
                const t = a ? tierById(a.k) : null;
                return (
                  <li key={p.id} className={p.id === me?.id ? 'is-me' : ''} style={{ '--tc': t?.color || '#3d4f6e' }}>
                    <span className="ab-results-who">{p.avatar} {p.name}</span>
                    <span className="ab-results-answer">{a ? `«${a.c}»` : '—'}</span>
                    <span className="ab-results-tier">{t ? `${t.icon} ${t.name}` : 'nada'}</span>
                    <b>+{a?.p || 0}</b>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="ab-reveal-actions">
            {host ? (
              <button type="button" className="ab-dive-btn is-big" data-act="next" onClick={() => onDispatch({ type: 'next', round })}>{last ? 'Ver el final' : 'Descender'} ▼</button>
            ) : room.phaseEndsAt ? (
              <p className="ab-status">{last ? 'El final' : 'La próxima consigna'} en {Math.max(0, Math.ceil((room.phaseEndsAt - now) / 1000))} s</p>
            ) : (
              <p className="ab-status">Esperando al anfitrión…</p>
            )}
          </div>
        </div>
      )}
      <div className="ab-crt" aria-hidden="true" />
    </div>
  );
}

