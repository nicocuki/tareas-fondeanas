import React, { useEffect, useState } from 'react';
import { buildAlbums } from './game.js';
import { watchResults, rematch } from './storage.js';
export default function Reveal({ code, room, host, run }) {
  const [steps,setSteps]=useState(null),[index,setIndex]=useState(0),[playing,setPlaying]=useState(false),[albums,setAlbums]=useState(false);
  useEffect(()=>watchResults(code,room.state,setSteps,(error)=>run(()=>Promise.reject(error))),[code,room.state.match]);
  const chains=buildAlbums(room.state,steps,room.players), total=room.state.count**2;
  useEffect(()=>{
    if (!playing || albums) return;
    const timer=setInterval(()=>setIndex((i)=>{ if(i>=total-1){setPlaying(false);return i;} return i+1; }),2500);
    return ()=>clearInterval(timer);
  },[playing,albums,total]);
  if (!steps) return <div className="gp-card">Preparando la revelación…</div>;
  const chain=Math.floor(index/room.state.count), turn=index%room.state.count;
  const renderStep=(step)=><div className="gp-step" key={step.order}>
    <p className="gp-eyebrow">{step.order===0?'La idea original':step.type==='drawing'?'El dibujo':'Lo que entendió'} · {step.name}</p>
    {step.type==='drawing' ? (step.content?<img src={step.content} alt={'Dibujo de '+step.name}/>:<p>El lienzo quedó vacío.</p>) : <blockquote>{step.content || 'Se quedó sin palabras…'}</blockquote>}
  </div>;
  return <section className="gp-card gp-reveal">
    <div className="gp-row"><h2>{albums?'Álbumes de la partida':'¡Mirá cómo terminó!'}</h2><button onClick={()=>{setAlbums(!albums);setPlaying(false);}}>{albums?'Volver a la presentación':'Ver todos los álbumes'}</button></div>
    {albums ? chains.map((c)=><details key={c.id}><summary>📒 La cadena de {c.name}</summary>{c.steps.map(renderStep)}</details>) : <>
      <p>Cadena de <strong>{chains[chain].name}</strong> · {chain+1} / {chains.length} · Paso {turn+1} / {room.state.count}</p>
      <div key={chain} className="gp-chain">{chains[chain].steps.slice(0,turn+1).map(renderStep)}</div>
      <div className="gp-row gp-controls">
        <button disabled={index===0} onClick={()=>{setPlaying(false);setIndex(index-1);}}>← Anterior</button>
        <button className="gp-primary" onClick={()=>{if(index===total-1)setIndex(0);setPlaying(!playing);}}>{playing?'Pausar':'▶ Reproducir'}</button>
        <button disabled={index===total-1} onClick={()=>{setPlaying(false);setIndex(index+1);}}>Siguiente →</button>
      </div>
    </>}
    {host?<button className="gp-primary" onClick={()=>run(()=>rematch(code))}>Otra partida · Volver al lobby</button>:<p>El anfitrión puede preparar otra partida.</p>}
  </section>;
}
