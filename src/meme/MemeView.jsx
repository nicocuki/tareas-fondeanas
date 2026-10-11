// Un meme: la plantilla y los textos encima, con letra de meme (blanca con borde negro).
// Si es editable, cada texto se puede arrastrar con el mouse o el dedo.
import React, { useRef } from 'react';

export default function MemeView({ template, texts, labels, editable = false, active = -1, onMove, onSelect, className = '', maxHeight }) {
  const box = useRef(null);
  const drag = useRef(null);

  function start(e, i) {
    if (!editable) return;
    e.preventDefault();
    onSelect?.(i);
    const rect = box.current.getBoundingClientRect();
    drag.current = { i, rect, dx: e.clientX - (rect.left + (texts[i].x / 100) * rect.width), dy: e.clientY - (rect.top + (texts[i].y / 100) * rect.height) };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const x = ((e.clientX - d.dx - d.rect.left) / d.rect.width) * 100;
    const y = ((e.clientY - d.dy - d.rect.top) / d.rect.height) * 100;
    onMove?.(d.i, Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  }
  function end() { drag.current = null; }

  if (!template) return null;
  return (
    <div
      ref={box}
      className={`mm-meme${editable ? ' is-editable' : ''} ${className}`}
      style={{ aspectRatio: `${template.w} / ${template.h}`, ...(maxHeight && { width: `min(100%, calc((${maxHeight}) * ${template.w / template.h}))`, marginInline: 'auto' }) }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <img src={template.url} alt={template.name || 'Plantilla de meme'} draggable={false} />
      {texts.map((t, i) => (
        <div
          key={i}
          className={`mm-text${t.k ? ' is-dark' : ''}${active === i ? ' is-active' : ''}${!t.t && editable ? ' is-empty' : ''}`}
          style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.w ?? 92}%`, fontSize: `${t.s}cqw` }}
          onPointerDown={(e) => start(e, i)}
        >
          {t.t || (editable ? labels?.[i] || `Texto ${i + 1}` : '')}
        </div>
      ))}
    </div>
  );
}
