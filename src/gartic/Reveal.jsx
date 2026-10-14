import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { W, H } from './DrawingCanvas.jsx';
import { buildAlbums, showDurations, showPosition, REPLAY_MS } from './game.js';
import { makeReplayer, parseStrokes } from './drawing.js';
import { watchResults, rematch, showControl } from './storage.js';

// Muestra un dibujo haciéndose trazo por trazo. `since` = hace cuántos ms empezó (Infinity: ya terminó).
function DrawingReplay({ src, strokes, since }) {
  const canvas = useRef(null);
  const [ops] = useState(() => parseStrokes(strokes));
  const [done, setDone] = useState(() => !ops || !ops.length || !(since < REPLAY_MS));
  const [start] = useState(() => performance.now() - (Number.isFinite(since) ? since : REPLAY_MS));
  useEffect(() => {
    if (done) return undefined;
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    const replay = makeReplayer(ctx, ops, W, H);
    let frame = 0;
    const step = () => {
      const progress = Math.min(1, (performance.now() - start) / REPLAY_MS);
      // Arranca rápido y frena al final, como cuando alguien termina los detalles.
      replay.advance(replay.total * (1 - (1 - progress) ** 1.6));
      if (progress < 1) frame = requestAnimationFrame(step);
      else setDone(true);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [done]);
  if (!src) return <p className="gp-empty-step">El lienzo quedó vacío.</p>;
  if (done) return <img src={src} alt="Dibujo" className={ops ? '' : 'gp-fade-in'} />;
  return <canvas ref={canvas} width={W} height={H} aria-label="El dibujo haciéndose" />;
}

function Step({ step, avatar, latest, since }) {
  const side = step.order % 2 === 0 ? 'is-left' : 'is-right';
  return <div className={'gp-msg ' + side + (step.type === 'drawing' ? ' is-drawing' : '')}>
    <span className="gp-avatar gp-avatar-sm">{avatar}</span>
    <div className="gp-msg-body">
      <small>{step.name}</small>
      {step.type === 'drawing'
        ? <div className="gp-msg-card">
          {latest ? <DrawingReplay key={step.authorId + step.order} src={step.content} strokes={step.strokes} since={since} />
            : step.content ? <img src={step.content} alt={'Dibujo de ' + step.name} /> : <p className="gp-empty-step">El lienzo quedó vacío.</p>}
          {step.content && <a className="gp-download" href={step.content} download={'trazo-loco-' + step.name + '.png'} aria-label="Descargar dibujo"><Icon name="download" size={18} /></a>}
        </div>
        : <p className="gp-msg-text">{step.content || 'Se quedó sin palabras…'}</p>}
    </div>
  </div>;
}

export default function Reveal({ code, room, host, run, now }) {
  const state = room.state;
  const [steps, setSteps] = useState(null), [browse, setBrowse] = useState(null);
  const list = useRef(null), seen = useRef({});
  useEffect(() => watchResults(code, state, setSteps, (error) => run(() => Promise.reject(error))), [code, state.match]);
  const albums = buildAlbums(state, steps, room.players);
  const durations = showDurations(state);
  const show = state.show || { index: 0, playing: false };
  const pos = showPosition(show, now, durations);
  const last = durations.length - 1;
  const finished = pos.index === last && (!show.playing || pos.since > 1500);
  const showAlbum = Math.floor(pos.index / state.count), showStep = pos.index % state.count;
  // Al terminar la presentación cada uno puede mirar el álbum que quiera.
  const album = browse !== null && finished ? browse : showAlbum;
  const visible = browse !== null && finished ? state.count - 1 : showStep;
  if (seen.current[pos.index] === undefined) seen.current[pos.index] = Date.now();
  const since = show.playing ? pos.since : Date.now() - seen.current[pos.index];
  const nextAuthor = albums[album]?.steps[visible + 1];
  const typing = browse === null && show.playing && nextAuthor && since > durations[pos.index] - 1400;
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [album, visible, typing, steps]);
  useEffect(() => { if (!finished) setBrowse(null); }, [finished]);
  const control = (command) => run(() => showControl(code, state, durations, now, command));
  const owner = albums[album];

  return <div className="gp-reveal">
    <aside className="gp-col">
      <h2 className="gp-title">Jugadores</h2>
      <div className="gp-panel gp-list">
        {albums.map((a, i) => <button key={a.id} type="button" disabled={!finished} onClick={() => setBrowse(i)}
          className={'gp-slot' + (i === album ? ' is-current' : '') + (i < showAlbum || finished ? ' is-seen' : '')}>
          <span className="gp-avatar">{room.players[a.id]?.avatar || '🙂'}</span>
          <strong>{a.name}</strong>
          {a.id === room.hostId && <i className="gp-crown"><Icon name="crown" size={16} /></i>}
        </button>)}
      </div>
    </aside>
    <section className="gp-col gp-col-wide">
      <h2 className="gp-title">Álbum de {owner?.name || '…'}</h2>
      <div className="gp-panel gp-album" ref={list} aria-live="polite">
        {!steps ? <p className="gp-album-wait">Juntando los álbumes…</p> : <>
          {owner.steps.slice(0, visible + 1).map((step, i) => <Step key={owner.id + ':' + i} step={step}
            avatar={room.players[step.authorId]?.avatar || '🙂'} latest={browse === null && i === visible} since={since} />)}
          {typing && <div className={'gp-msg ' + ((visible + 1) % 2 === 0 ? 'is-left' : 'is-right')}>
            <span className="gp-avatar gp-avatar-sm">{room.players[nextAuthor.authorId]?.avatar || '🙂'}</span>
            <div className="gp-msg-body"><small>{nextAuthor.name}</small><p className="gp-typing"><i /><i /><i /></p></div>
          </div>}
        </>}
      </div>
      <p className="gp-album-meta">Álbum {album + 1} de {albums.length}{browse === null ? ' · paso ' + (visible + 1) + ' de ' + state.count : ''}{finished ? ' · Tocá un jugador para ver su álbum' : ''}</p>
      <div className="gp-actions">
        {host && !finished && <>
          <button type="button" className="gp-btn gp-btn-sm" title="Álbum anterior" aria-label="Álbum anterior" onClick={() => control('prevAlbum')}><Icon name="prev" /></button>
          <button type="button" className="gp-btn gp-btn-sm" title="Paso anterior" aria-label="Paso anterior" onClick={() => control('prev')}><Icon name="back" /></button>
          <button type="button" className="gp-btn" onClick={() => control(show.playing ? 'pause' : 'play')}><Icon name={show.playing ? 'pause' : 'play'} />{show.playing ? 'Pausar' : 'Automático'}</button>
          <button type="button" className="gp-btn gp-btn-go" onClick={() => control('next')}>Siguiente<Icon name="forward" /></button>
          <button type="button" className="gp-btn gp-btn-sm" title="Álbum siguiente" aria-label="Álbum siguiente" onClick={() => control('nextAlbum')}><Icon name="next" /></button>
        </>}
        {host && finished && <>
          <button type="button" className="gp-btn" onClick={() => { setBrowse(null); control('play'); }}><Icon name="play" />Ver de nuevo</button>
          <button type="button" className="gp-btn gp-btn-go" onClick={() => run(() => rematch(code))}><Icon name="home" />Volver a la sala</button>
        </>}
        {!host && <p className="gp-note">{finished ? 'El anfitrión puede armar otra partida.' : show.playing ? 'El anfitrión está mostrando los álbumes…' : 'Esperando que el anfitrión muestre el siguiente…'}</p>}
      </div>
    </section>
  </div>;
}
