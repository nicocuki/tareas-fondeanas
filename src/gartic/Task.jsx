import React, { useEffect, useRef, useState } from 'react';
import DrawingCanvas from './DrawingCanvas.jsx';
import Icon from './Icon.jsx';
import { MAX_TEXT, stepType } from './game.js';
import { saveStep, submit } from './storage.js';

export default function Task({ code, state, uid, initial, previous, ready, readyMap, players, now, onError }) {
  const key = 'gartic:draft:' + code + ':' + state.match + ':' + state.round + ':' + uid;
  const stored = (suffix = '') => { try { return sessionStorage.getItem(key + suffix); } catch { return null; } };
  const [content, setContent] = useState(() => stored() ?? initial?.content ?? '');
  const [strokes] = useState(() => stored(':trazos') ?? initial?.strokes ?? '');
  const draft = useRef(content), draftStrokes = useRef(strokes), canvas = useRef(null), queue = useRef(Promise.resolve()), alive = useRef(true);
  const [sending, setSending] = useState(false), [saved, setSaved] = useState(true);
  const type = stepType(state.mode, state.round, state.count);
  const deadline = state.startedAt + state.duration, left = Math.max(0, Math.min(state.duration, deadline - now));
  const referenceVisible = state.mode !== 'imitation' || now < state.startedAt + 5000;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function edit(value, nextStrokes = '') {
    draft.current = value; draftStrokes.current = nextStrokes; setContent(value); setSaved(false);
    try { sessionStorage.setItem(key, value); sessionStorage.setItem(key + ':trazos', nextStrokes); } catch {}
  }
  useEffect(() => {
    if (ready || sending || saved) return;
    const timer = setTimeout(() => {
      const value = draft.current, valueStrokes = draftStrokes.current;
      queue.current = queue.current.catch(() => {}).then(() => saveStep(code, state, uid, value, valueStrokes));
      queue.current.then(() => { if (alive.current) setSaved(draft.current === value); }).catch(() => { if (alive.current) onError('No se pudo guardar el borrador. Revisá la conexión.'); });
    }, 500);
    return () => clearTimeout(timer);
  }, [content, ready, sending, saved]);
  async function finish() {
    if (ready || sending) return;
    setSending(true);
    const drawing = type === 'drawing' && canvas.current;
    const value = drawing ? canvas.current.exportImage() : draft.current;
    const valueStrokes = drawing ? canvas.current.exportStrokes() : '';
    draft.current = value;
    try {
      try { sessionStorage.setItem(key, value); } catch {}
      await queue.current.catch(() => {});
      await submit(code, state, uid, value, valueStrokes);
      try { sessionStorage.removeItem(key); sessionStorage.removeItem(key + ':trazos'); } catch {}
      if (alive.current) setSaved(true);
    } catch {
      if (alive.current) { setSending(false); onError('No se pudo enviar. El borrador sigue guardado; intentá otra vez.'); }
    }
  }
  useEffect(() => {
    if (left > 0 || ready || sending) return;
    const timer = setTimeout(finish, 250);
    return () => clearTimeout(timer);
  }, [left, ready, sending]);

  const waiting = ready || sending;
  const seconds = Math.ceil(left / 1000);
  const doneCount = Object.keys(readyMap).length;
  const top = <div className="gp-task-top">
    <div className="gp-round" aria-label={'Ronda ' + (state.round + 1) + ' de ' + state.count}>{state.round + 1}/{state.count}</div>
    <ul className="gp-done-strip" aria-label={doneCount + ' de ' + state.count + ' listos'}>
      {Object.values(state.order).map((id) => <li key={id} className={readyMap[id] ? 'is-done' : ''} title={(players[id]?.name || 'Jugador') + (readyMap[id] ? ' · listo' : '')}>
        <span>{players[id]?.avatar || '🙂'}</span>{readyMap[id] && <i><Icon name="check" size={12} /></i>}
      </li>)}
    </ul>
    <div className={'gp-timer' + (left < 10000 ? ' is-urgent' : '')} role="timer" aria-label={seconds + ' segundos'}><Icon name="clock" size={22} /><span>{seconds}</span></div>
  </div>;
  const doneButton = <button type="button" className="gp-btn gp-btn-done" disabled={waiting} onClick={finish}><Icon name="check" />{ready ? 'Listo' : sending ? 'Enviando…' : '¡Listo!'}</button>;

  if (waiting) {
    return <section className="gp-task">{top}
      <div className="gp-paper gp-paper-wait">
        <div className="gp-rings" aria-hidden="true"><i /><i /></div>
        <div className="gp-paper-head"><strong>¡Listo!</strong><span>Esperando a los demás jugadores…</span></div>
        <div className="gp-paper-body">
          <p className="gp-wait-count">{doneCount} / {state.count}</p>
          <ul className="gp-wait-grid">
            {Object.values(state.order).map((id) => <li key={id} className={readyMap[id] ? 'is-done' : ''}>
              <span className="gp-avatar">{players[id]?.avatar || '🙂'}</span>
              <strong>{players[id]?.name || 'Jugador'}</strong>
              <small>{readyMap[id] ? '✓ Listo' : 'Pensando…'}</small>
            </li>)}
          </ul>
        </div>
      </div>
    </section>;
  }

  const phrase = previous?.type === 'text' ? previous.content : '';
  if (type === 'drawing') {
    let title = '¡Hora de dibujar!', subtitle = phrase || (state.round > 0 ? 'La frase quedó vacía. ¡Improvisá!' : '');
    let overlay = null;
    if (state.mode === 'imitation') {
      if (state.round === 0) { title = 'Hacé el dibujo original'; subtitle = 'Los demás lo van a tener que copiar de memoria'; }
      else if (referenceVisible) {
        title = '¡Memorizá este dibujo!';
        subtitle = 'Desaparece en ' + Math.max(0, Math.ceil((state.startedAt + 5000 - now) / 1000)) + ' s';
        overlay = <div className="gp-memo">{previous?.content ? <img src={previous.content} alt="El dibujo para memorizar" /> : <p>El dibujo quedó vacío.</p>}</div>;
      } else { title = 'Copialo de memoria'; subtitle = ''; }
    }
    return <section className="gp-task">{top}
      <DrawingCanvas ref={canvas} initial={content} initialStrokes={draftStrokes.current} onChange={edit} disabled={left === 0}
        title={title} subtitle={subtitle} overlay={overlay}
        actions={<div className="gp-done-wrap"><small>{saved ? 'Borrador guardado' : 'Guardando…'}</small>{doneButton}</div>} />
    </section>;
  }

  let title = 'Escribí una frase', hint = 'Inventá algo divertido para que lo dibuje otro jugador.';
  let body = <div className="gp-write-hint"><span>💭</span><p>{hint}</p></div>;
  if (state.mode === 'story') {
    title = state.round === 0 ? 'Empezá una historia' : 'Continuá la historia';
    if (state.round > 0) body = <blockquote className="gp-quote">{phrase || 'La parte anterior quedó vacía. ¡Seguí como quieras!'}</blockquote>;
  } else if (state.round > 0) {
    title = '¿Qué es esto? ¡Describilo!';
    body = previous?.content && previous.type === 'drawing'
      ? <img className="gp-describe-img" src={previous.content} alt="El dibujo que recibiste" />
      : <div className="gp-write-hint"><span>🫥</span><p>El dibujo quedó vacío. ¡Improvisá!</p></div>;
  }
  return <section className="gp-task">{top}
    <div className="gp-paper gp-paper-text">
      <div className="gp-rings" aria-hidden="true"><i /><i /></div>
      <div className="gp-paper-head"><strong>{title}</strong></div>
      <div className="gp-paper-body">{body}</div>
    </div>
    <form className="gp-write-bar" onSubmit={(e) => { e.preventDefault(); finish(); }}>
      <input autoFocus value={content} maxLength={MAX_TEXT} disabled={left === 0} onChange={(e) => edit(e.target.value)}
        aria-label={state.mode === 'story' ? 'Tu parte de la historia' : 'Tu frase'}
        placeholder={state.round === 0 ? 'Un pingüino llega tarde al trabajo…' : 'Escribí lo que te imaginás…'} />
      {doneButton}
    </form>
    <p className="gp-write-meta">{content.length} / {MAX_TEXT} · {saved ? 'Borrador guardado' : 'Guardando…'}</p>
  </section>;
}
