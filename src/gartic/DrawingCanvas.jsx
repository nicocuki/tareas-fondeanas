import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { floodFill } from './drawing.js';
const W = 960, H = 600;
const TOOLS = [['pencil','✏️','Lápiz'],['eraser','🧽','Goma'],['line','╱','Línea'],['rect','▭','Rectángulo'],['ellipse','○','Círculo'],['filledRect','▬','Rectángulo relleno'],['filledEllipse','●','Círculo relleno'],['bucket','🪣','Balde']];
const PALETTE = ['#222222','#ffffff','#f44366','#ff9738','#ffd447','#62bd84','#52b9ee','#7561d9','#db79d6','#905838'];
export default forwardRef(function DrawingCanvas({ initial = '', onChange, disabled = false }, forwardedRef) {
  const canvas = useRef(null), stroke = useRef(null), history = useRef([]), future = useRef([]);
  const [tool,setTool] = useState('pencil'), [color,setColor] = useState('#222222'), [size,setSize] = useState(6);
  const [version,setVersion] = useState(0), [loaded,setLoaded] = useState(false);
  const changed = useRef(onChange); changed.current = onChange;
  const exportImage = () => canvas.current.toDataURL('image/png');
  useImperativeHandle(forwardedRef, () => ({ exportImage }));
  function emit() { changed.current?.(exportImage()); setVersion((v) => v + 1); }
  function remember() {
    history.current.push(canvas.current.getContext('2d').getImageData(0,0,W,H));
    if (history.current.length > 20) history.current.shift();
    future.current = [];
  }
  useEffect(() => {
    let active = true;
    const ctx = canvas.current.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
    if (initial) {
      const image = new Image();
      image.onload = () => { if (active) { ctx.drawImage(image,0,0,W,H); setLoaded(true); } };
      image.onerror = () => { if (active) setLoaded(true); };
      image.src = initial;
    } else setLoaded(true);
    return () => { active = false; };
  }, []);
  function point(e) {
    const box = canvas.current.getBoundingClientRect();
    return [Math.max(0,Math.min(W-1,(e.clientX-box.left)*W/box.width)),Math.max(0,Math.min(H-1,(e.clientY-box.top)*H/box.height))];
  }
  function configure(ctx) {
    ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color; ctx.fillStyle = ctx.strokeStyle;
  }
  function drawShape(ctx, start, end) {
    const [x,y] = start, [ex,ey] = end;
    ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(x,y); ctx.lineTo(ex,ey); ctx.stroke(); }
    else if (tool.toLowerCase().includes('rect')) {
      if (tool === 'filledRect') ctx.fillRect(x,y,ex-x,ey-y); else ctx.strokeRect(x,y,ex-x,ey-y);
    } else {
      ctx.ellipse((x+ex)/2,(y+ey)/2,Math.abs(ex-x)/2,Math.abs(ey-y)/2,0,0,Math.PI*2);
      if (tool === 'filledEllipse') ctx.fill(); else ctx.stroke();
    }
  }
  function down(e) {
    if (disabled || !loaded || stroke.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); canvas.current.setPointerCapture(e.pointerId);
    const pos=point(e), ctx=canvas.current.getContext('2d'); remember(); configure(ctx);
    if (tool === 'bucket') {
      const pixels=ctx.getImageData(0,0,W,H);
      const rgb=[1,3,5].map((i)=>parseInt(color.slice(i,i+2),16));
      floodFill(pixels,...pos,[...rgb,255]); ctx.putImageData(pixels,0,0); emit(); return;
    }
    stroke.current={ start:pos, last:pos, pointerId:e.pointerId, base:ctx.getImageData(0,0,W,H) };
    if (tool === 'pencil' || tool === 'eraser') { ctx.beginPath(); ctx.arc(...pos,size/2,0,Math.PI*2); ctx.fill(); }
  }
  function move(e) {
    const s=stroke.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const pos=point(e), ctx=canvas.current.getContext('2d'); configure(ctx);
    if (tool === 'pencil' || tool === 'eraser') {
      ctx.beginPath(); ctx.moveTo(...s.last); ctx.lineTo(...pos); ctx.stroke(); s.last=pos;
    } else { ctx.putImageData(s.base,0,0); drawShape(ctx,s.start,pos); }
  }
  function up(e) {
    if (!stroke.current || stroke.current.pointerId !== e.pointerId) return;
    move(e); stroke.current=null; emit();
  }
  function undo(redo=false) {
    if (stroke.current || disabled) return;
    const from=redo?future.current:history.current, to=redo?history.current:future.current;
    if (!from.length) return;
    const ctx=canvas.current.getContext('2d');
    to.push(ctx.getImageData(0,0,W,H)); ctx.putImageData(from.pop(),0,0); emit();
  }
  function clear() {
    if (disabled || stroke.current) return;
    remember(); const ctx=canvas.current.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H); emit();
  }
  return <div className="gp-editor" data-version={version}>
    <div className="gp-tools" role="toolbar" aria-label="Herramientas de dibujo">
      {TOOLS.map(([id,icon,label])=><button key={id} title={label} aria-label={label} aria-pressed={tool===id} disabled={disabled} className={tool===id?'selected':''} onClick={()=>setTool(id)}>{icon}<span>{label}</span></button>)}
      <button disabled={disabled || !history.current.length} onClick={()=>undo()}>↶<span>Deshacer</span></button>
      <button disabled={disabled || !future.current.length} onClick={()=>undo(true)}>↷<span>Rehacer</span></button>
      <button disabled={disabled} onClick={clear}>✕<span>Limpiar</span></button>
    </div>
    <canvas ref={canvas} width={W} height={H} aria-label="Lienzo de dibujo" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} className={disabled?'disabled':''}/>
    <div className="gp-colors">
      {PALETTE.map((c)=><button key={c} aria-label={'Color '+c} aria-pressed={color===c} disabled={disabled} onClick={()=>setColor(c)} style={{background:c,borderColor:color===c?'#7561d9':'#c8c5d6'}}/>)}
      <label>Color <input type="color" value={color} disabled={disabled} onChange={(e)=>setColor(e.target.value)}/></label>
      <label>Grosor {size}<input type="range" min="1" max="40" value={size} disabled={disabled} onChange={(e)=>setSize(Number(e.target.value))}/></label>
    </div>
  </div>;
});
