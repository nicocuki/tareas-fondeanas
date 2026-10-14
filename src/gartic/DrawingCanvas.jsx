import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { floodFill, parseStrokes, TOOL_CODES } from './drawing.js';
import { MAX_STROKES } from './game.js';
import Icon from './Icon.jsx';

export const W = 960, H = 600;
const TOOLS = [
  ['pencil', 'Lápiz', 'B'], ['eraser', 'Goma', 'E'],
  ['rect', 'Rectángulo', 'R'], ['ellipse', 'Círculo', 'C'],
  ['filledRect', 'Rectángulo relleno', 'F'], ['filledEllipse', 'Círculo relleno', 'G'],
  ['line', 'Línea', 'L'], ['bucket', 'Balde', 'K'],
];
const PALETTE = [
  '#000000', '#666666', '#0050cd', '#ffffff', '#aaaaaa', '#26c9ff',
  '#017420', '#691a00', '#963d00', '#11b03c', '#ff0013', '#ff7829',
  '#b0701c', '#99004e', '#cb5a57', '#ffc126', '#ff008f', '#feafa8',
  '#3a1f8f', '#7561d9', '#db79d6', '#f8e4c4', '#6fdc8c', '#fff36b',
];
const SIZES = [2, 6, 12, 22, 36];

// `onChange(imagen, trazos)`: los trazos van como texto JSON, o '' si no se pudieron grabar enteros.
export default forwardRef(function DrawingCanvas({ initial = '', initialStrokes = '', onChange, disabled = false, title, subtitle, overlay, actions }, forwardedRef) {
  const canvas = useRef(null), stroke = useRef(null), history = useRef([]), future = useRef([]);
  // Las operaciones vigentes (una por cada paso del historial) y las deshechas, para rehacer.
  const ops = useRef(null), undone = useRef([]), lost = useRef(false);
  const [tool, setTool] = useState('pencil'), [color, setColor] = useState('#000000'), [size, setSize] = useState(6);
  const [, setVersion] = useState(0), [loaded, setLoaded] = useState(false);
  const changed = useRef(onChange); changed.current = onChange;
  const exportImage = () => canvas.current.toDataURL('image/png');
  const exportStrokes = () => {
    if (lost.current) return '';
    const text = JSON.stringify(ops.current);
    return text.length > MAX_STROKES ? '' : text;
  };
  useImperativeHandle(forwardedRef, () => ({ exportImage, exportStrokes }));
  function emit() { changed.current?.(exportImage(), exportStrokes()); setVersion((v) => v + 1); }
  function remember() {
    history.current.push(canvas.current.getContext('2d').getImageData(0, 0, W, H));
    if (history.current.length > 20) history.current.shift();
    future.current = [];
    undone.current = [];
  }
  function record(op) {
    ops.current.push(op);
    if (JSON.stringify(op).length + 2 > MAX_STROKES) lost.current = true;
  }
  useEffect(() => {
    let active = true;
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    // Un borrador recuperado sin sus trazos no se puede reproducir entero: el álbum mostrará la imagen.
    ops.current = parseStrokes(initialStrokes) || [];
    lost.current = Boolean(initial) && !parseStrokes(initialStrokes);
    if (initial) {
      const image = new Image();
      image.onload = () => { if (active) { ctx.drawImage(image, 0, 0, W, H); setLoaded(true); } };
      image.onerror = () => { if (active) setLoaded(true); };
      image.src = initial;
    } else setLoaded(true);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (disabled) return undefined;
    function key(e) {
      if (e.target.closest?.('input, textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); undo(true); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const found = TOOLS.find(([, , letter]) => letter === e.key.toUpperCase());
      if (found) setTool(found[0]);
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  function point(e) {
    const box = canvas.current.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(W - 1, (e.clientX - box.left) * W / box.width))), Math.round(Math.max(0, Math.min(H - 1, (e.clientY - box.top) * H / box.height)))];
  }
  function configure(ctx) {
    ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color; ctx.fillStyle = ctx.strokeStyle;
  }
  function drawShape(ctx, start, end) {
    const [x, y] = start, [ex, ey] = end;
    ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke(); }
    else if (tool.toLowerCase().includes('rect')) {
      if (tool === 'filledRect') ctx.fillRect(x, y, ex - x, ey - y); else ctx.strokeRect(x, y, ex - x, ey - y);
    } else {
      ctx.ellipse((x + ex) / 2, (y + ey) / 2, Math.abs(ex - x) / 2, Math.abs(ey - y) / 2, 0, 0, Math.PI * 2);
      if (tool === 'filledEllipse') ctx.fill(); else ctx.stroke();
    }
  }
  function down(e) {
    if (disabled || !loaded || stroke.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); canvas.current.setPointerCapture(e.pointerId);
    const pos = point(e), ctx = canvas.current.getContext('2d'); remember(); configure(ctx);
    if (tool === 'bucket') {
      const pixels = ctx.getImageData(0, 0, W, H);
      floodFill(pixels, ...pos, [...[1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)), 255]);
      ctx.putImageData(pixels, 0, 0);
      record(['b', color, size, ...pos]);
      emit(); return;
    }
    const op = [TOOL_CODES[tool], color, size, ...pos];
    stroke.current = { start: pos, last: pos, pointerId: e.pointerId, base: ctx.getImageData(0, 0, W, H), op };
    if (tool === 'pencil' || tool === 'eraser') { ctx.beginPath(); ctx.arc(...pos, size / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  function move(e) {
    const s = stroke.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const pos = point(e), ctx = canvas.current.getContext('2d'); configure(ctx);
    if (tool === 'pencil' || tool === 'eraser') {
      // Los puntos muy pegados no cambian el dibujo y engordan la grabación.
      if (Math.abs(pos[0] - s.last[0]) + Math.abs(pos[1] - s.last[1]) < 2) return;
      ctx.beginPath(); ctx.moveTo(...s.last); ctx.lineTo(...pos); ctx.stroke(); s.last = pos;
      s.op.push(...pos);
    } else { ctx.putImageData(s.base, 0, 0); drawShape(ctx, s.start, pos); s.last = pos; }
  }
  function up(e) {
    const s = stroke.current;
    if (!s || s.pointerId !== e.pointerId) return;
    move(e); stroke.current = null;
    record(tool === 'pencil' || tool === 'eraser' ? s.op : [...s.op, ...s.last]);
    emit();
  }
  function undo(redo = false) {
    if (stroke.current || disabled) return;
    const from = redo ? future.current : history.current, to = redo ? history.current : future.current;
    if (!from.length) return;
    const ctx = canvas.current.getContext('2d');
    to.push(ctx.getImageData(0, 0, W, H)); ctx.putImageData(from.pop(), 0, 0);
    if (redo) { if (undone.current.length) ops.current.push(undone.current.pop()); }
    else if (ops.current.length) undone.current.push(ops.current.pop());
    else lost.current = true;
    emit();
  }
  function clear() {
    if (disabled || stroke.current) return;
    remember(); const ctx = canvas.current.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    record(['c', '#ffffff', 0]);
    emit();
  }
  return <div className={'gp-desk' + (disabled ? ' is-disabled' : '')}>
    <div className="gp-panel gp-palette" aria-label="Colores">
      <p className="gp-panel-title">Colores</p>
      <div className="gp-swatches">
        {PALETTE.map((c) => <button key={c} type="button" aria-label={'Color ' + c} aria-pressed={color === c} disabled={disabled} onClick={() => { setColor(c); if (tool === 'eraser') setTool('pencil'); }} className={color === c ? 'is-on' : ''} style={{ background: c }} />)}
      </div>
      <label className="gp-custom-color" title="Otro color">
        <span style={{ background: color }} />
        <input type="color" value={color} disabled={disabled} onChange={(e) => setColor(e.target.value)} aria-label="Elegir otro color" />
      </label>
    </div>
    <div className="gp-paper">
      <div className="gp-rings" aria-hidden="true"><i /><i /></div>
      <div className="gp-paper-head"><strong>{title}</strong>{subtitle && <span>{subtitle}</span>}</div>
      <div className="gp-paper-body gp-canvas-wrap">
        <canvas ref={canvas} width={W} height={H} aria-label="Lienzo de dibujo" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} className={disabled ? 'disabled' : ''} />
        {overlay}
      </div>
    </div>
    <div className="gp-panel gp-toolbox" role="toolbar" aria-label="Herramientas de dibujo">
      {TOOLS.map(([id, label, letter]) => <button key={id} type="button" title={label + ' (' + letter + ')'} aria-label={label} aria-pressed={tool === id} disabled={disabled} className={tool === id ? 'is-on' : ''} onClick={() => setTool(id)}><Icon name={id} /><kbd>{letter}</kbd></button>)}
      <button type="button" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled={disabled || !history.current.length} onClick={() => undo()}><Icon name="undo" /></button>
      <button type="button" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" disabled={disabled || !future.current.length} onClick={() => undo(true)}><Icon name="redo" /></button>
      <button type="button" title="Limpiar todo" aria-label="Limpiar" className="gp-wide-tool" disabled={disabled} onClick={clear}><Icon name="trash" /></button>
    </div>
    <div className="gp-panel gp-bottombar">
      <div className="gp-sizes" role="group" aria-label="Grosor">
        {SIZES.map((s, i) => <button key={s} type="button" aria-label={'Grosor ' + (i + 1)} aria-pressed={size === s} disabled={disabled} className={size === s ? 'is-on' : ''} onClick={() => setSize(s)}><i style={{ width: 6 + i * 4, height: 6 + i * 4 }} /></button>)}
      </div>
      <label className="gp-slider"><span>Grosor {size}</span><input type="range" min="1" max="60" value={size} disabled={disabled} onChange={(e) => setSize(Number(e.target.value))} /></label>
      {actions}
    </div>
  </div>;
});
