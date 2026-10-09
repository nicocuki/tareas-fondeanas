import React, { useEffect, useRef, useState } from 'react';
import DrawingCanvas from './DrawingCanvas.jsx';
import { MAX_TEXT, stepType } from './game.js';
import { saveStep, submit } from './storage.js';
export default function Task({ code, state, uid, initial, previous, ready, readyCount, now, onError }) {
  const key='gartic:draft:'+code+':'+state.match+':'+state.round+':'+uid;
  const stored=()=>{try{return sessionStorage.getItem(key);}catch{return null;}};
  const [content,setContent]=useState(()=>stored()??initial?.content??'');
  const draft=useRef(content), canvas=useRef(null), queue=useRef(Promise.resolve()), alive=useRef(true);
  const [sending,setSending]=useState(false),[saved,setSaved]=useState(true);
  const type=stepType(state.mode,state.round,state.count);
  const deadline=state.startedAt+state.duration, left=Math.max(0,Math.min(state.duration,deadline-now));
  const referenceVisible=state.mode!=='imitation' || now<state.startedAt+5000;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  function edit(value) {
    draft.current=value;setContent(value);setSaved(false);
    try{sessionStorage.setItem(key,value);}catch{}
  }
  useEffect(()=>{
    if(ready || sending || saved) return;
    const timer=setTimeout(()=>{
      const value=draft.current;
      queue.current=queue.current.catch(()=>{}).then(()=>saveStep(code,state,uid,value));
      queue.current.then(()=>{if(alive.current)setSaved(draft.current===value);}).catch(()=>{if(alive.current)onError('No se pudo guardar el borrador. Revisá la conexión.');});
    },500);
    return ()=>clearTimeout(timer);
  },[content,ready,sending,saved]);
  async function finish() {
    if(ready || sending) return;
    setSending(true);
    const value=type==='drawing'?(canvas.current?.exportImage()||draft.current):draft.current;
    draft.current=value;
    try{
      try{sessionStorage.setItem(key,value);}catch{}
      await queue.current.catch(()=>{});
      await submit(code,state,uid,value);
      try{sessionStorage.removeItem(key);}catch{}
      if(alive.current)setSaved(true);
    }catch{
      if(alive.current){setSending(false);onError('No se pudo enviar. El borrador sigue guardado; intentá otra vez.');}
    }
  }
  useEffect(()=>{
    if(left>0 || ready || sending) return;
    const timer=setTimeout(finish,250);
    return ()=>clearTimeout(timer);
  },[left,ready,sending]);
  const waiting=ready || sending;
  let title=type==='drawing'?'¡A dibujar!':state.round===0?'Inventá una frase':'¿Qué ves en este dibujo?';
  if(state.mode==='story')title=state.round===0?'Comenzá una historia':'Continuá la historia';
  if(state.mode==='imitation')title=state.round===0?'Creá el dibujo original':referenceVisible?'Memorizá el dibujo':'Copialo de memoria';
  return <section className="gp-card gp-task">
    <div className="gp-row"><div><p className="gp-eyebrow">Ronda {state.round+1} / {state.count}</p><h2>{waiting?'Esperando a los demás…':title}</h2></div><strong className={'gp-clock '+(left<10000?'urgent':'')}>{Math.ceil(left/1000)} s</strong></div>
    <div className="gp-progress" aria-label="Jugadores listos"><span style={{width:(readyCount/state.count*100)+'%'}}/></div>
    <p role="status">{readyCount} / {state.count} jugadores listos {ready?'· ¡Listo!':sending?'· Enviando…':''}</p>
    {!waiting && state.round>0 && <div className="gp-reference">
      {!referenceVisible ? <p>🧠 La referencia desapareció. ¡Ahora usá tu memoria!</p> : previous?.content ? (previous.type==='drawing'?<img src={previous.content} alt="El dibujo que recibiste"/>:<blockquote>{previous.content}</blockquote>) : <p>La etapa anterior quedó vacía. ¡Improvisá!</p>}
    </div>}
    {type==='drawing'?<DrawingCanvas ref={canvas} initial={content} onChange={edit} disabled={waiting || left===0}/>:<label className="gp-write">{state.mode==='story'?'Tu parte de la historia':'Tu frase'}<textarea autoFocus value={content} maxLength={MAX_TEXT} disabled={waiting || left===0} onChange={(e)=>edit(e.target.value)} placeholder={state.round===0?'Un pingüino llega tarde al trabajo…':'Escribí lo que te imaginás…'}/><small>{content.length} / {MAX_TEXT}</small></label>}
    <div className="gp-row"><small>{saved?'Borrador guardado':'Guardando borrador…'}</small><button className="gp-primary" disabled={waiting} onClick={finish}>{ready?'✓ Listo':sending?'Enviando…':'¡Listo!'}</button></div>
  </section>;
}
