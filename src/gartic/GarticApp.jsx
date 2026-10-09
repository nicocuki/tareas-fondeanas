import React, { useEffect, useRef, useState } from 'react';
import { LobbyLayout } from '../lobby/index.js';
import { loadName } from '../session.js';
import { backend } from '../storage.js';
import { isFirebaseConfigured } from '../firebaseConfig.js';
import { MODES, cleanName, previousAuthor } from './game.js';
import * as network from './storage.js';
import Task from './Task.jsx';
import Reveal from './Reveal.jsx';
import './gartic.css';
const AVATARS=['🐸','🦊','🐼','🐙','🐨','🦄','🐱','🐧'];
const urlCode=()=>new URLSearchParams(location.search).get('sala')?.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4)||'';
function savedSession(){try{return JSON.parse(sessionStorage.getItem('gartic:session'));}catch{return null;}}
function remember(code,uid){
  const url=new URL(location.href);url.searchParams.set('juego','gartic');
  if(code){url.searchParams.set('sala',code);sessionStorage.setItem('gartic:session',JSON.stringify({code,uid}));}
  else{url.searchParams.delete('sala');sessionStorage.removeItem('gartic:session');}
  history.replaceState(null,'',url);
}
export default function GarticApp({onBackToMenu}){
  const [uid,setUid]=useState(null),[name,setName]=useState(loadName),[avatar,setAvatar]=useState(AVATARS[0]);
  const [joinCode,setJoinCode]=useState(urlCode),[code,setCode]=useState(''),[room,setRoom]=useState(null);
  const [connected,setConnected]=useState({}),[ready,setReady]=useState({}),[readyKey,setReadyKey]=useState(''),[own,setOwn]=useState(null),[previous,setPrevious]=useState(null);
  const [ownLoaded,setOwnLoaded]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState('');
  const [online,setOnline]=useState(false),[offset,setOffset]=useState(0),[tick,setTick]=useState(Date.now());
  const stopPresence=useRef(null),advancing=useRef(false);
  useEffect(()=>{
    if(!isFirebaseConfigured)return;
    let active=true;
    network.identity().then((user)=>{
      if(!active)return;setUid(user.uid);
      const saved=savedSession();
      if(saved?.uid===user.uid && /^[A-Z]{4}$/.test(saved.code) && (!urlCode()||urlCode()===saved.code))setCode(saved.code);
    }).catch(()=>{if(active)setError('No pudimos conectar tu jugador. Revisá que Firebase tenga habilitado el acceso anónimo.');});
    const off=network.watch('.info/connected',setOnline);
    const offOffset=backend.subscribeServerOffset(setOffset);
    const timer=setInterval(()=>setTick(Date.now()),250);
    return()=>{active=false;off();offOffset();clearInterval(timer);};
  },[]);
  useEffect(()=>{
    if(!code || !uid)return;
    let active=true;
    setRoom(null);setConnected({});
    const off=network.watchRoom(code,(data)=>{
      if(!active)return;
      if(!data?.players?.[uid]){setCode('');remember('',uid);setError('Ya no estás en esa sala. Podés volver a entrar.');return;}
      setRoom(data);
    },()=>setError('No se pudo abrir la sala. Revisá la conexión y las reglas de Firebase.'));
    const offPresence=network.watchPresence(code,(data)=>setConnected(data||{}));
    network.presence(code,uid).then((stop)=>{if(active)stopPresence.current=stop;else stop().catch(()=>{});});
    return()=>{active=false;off();offPresence();const stop=stopPresence.current;stopPresence.current=null;stop?.().catch(()=>{});};
  },[code,uid]);
  const state=room?.state, phase=state?.phase, taskKey=state?state.match+':'+state.round:'';
  const now=tick+offset;
  useEffect(()=>{
    if(phase!=='playing' || !state.positions?.[uid]) {
      // La posición cero también es un participante.
      if(phase!=='playing' || state.positions?.[uid]===undefined)return;
    }
    setReady({});setOwn(null);setOwnLoaded('');setPrevious(null);
    const offReady=network.watchReady(code,state,(data)=>{setReadyKey(taskKey);setReady(data||{});},()=>setError('No se pudo consultar quién está listo.'));
    let first=true;
    const offOwn=network.watchOwnStep(code,state,uid,(data)=>{if(first){setOwn(data);setOwnLoaded(taskKey);first=false;}},()=>setError('No se pudo recuperar tu tarea.'));
    const offPrev=state.round>0?network.watchPrevious(code,state,previousAuthor(state,uid),setPrevious,()=>{}):()=>{};
    return()=>{offReady();offOwn();offPrev();};
  },[code,taskKey,phase,uid]);
  const currentReady=readyKey===taskKey?ready:{};
  const readyCount=Object.keys(currentReady).length;
  useEffect(()=>{
    if(!online || phase!=='playing' || state.positions?.[uid]===undefined || advancing.current || readyKey!==taskKey)return;
    const coordinator=Object.keys(state.positions).sort().find((id)=>connected[id]);
    if(coordinator!==uid)return;
    if(readyCount<state.count && now<state.startedAt+state.duration+5000)return;
    advancing.current=true;
    network.advance(code,state,readyCount,now).catch(()=>setError('No se pudo avanzar la ronda. Reintentando…')).finally(()=>{advancing.current=false;});
  },[tick,phase,readyCount,taskKey,online,readyKey,connected]);
  useEffect(()=>{
    if(!room || connected[room.hostId] || !connected[uid])return;
    const timer=setTimeout(()=>network.transferHost(code,room,connected).catch(()=>{}),5000);
    return()=>clearTimeout(timer);
  },[room?.hostId,code,connected,uid]);
  async function run(action){
    setBusy(true);setError('');
    try{await action();}catch(e){setError(e.message?.includes('PERMISSION_DENIED')?'Firebase rechazó la operación. Revisá las reglas y el estado de la sala.':e.message||'No se pudo completar la acción.');}
    finally{setBusy(false);}
  }
  async function enter(create){
    const clean=cleanName(name);
    if(!clean){setError('Escribí tu nombre primero.');return;}
    const target=joinCode.trim().toUpperCase();
    if(!create && !/^[A-Z]{4}$/.test(target)){setError('El código tiene 4 letras.');return;}
    await run(async()=>{
      const next=create?await network.createRoom(uid,clean,avatar):target;
      if(!create)await network.joinRoom(next,uid,clean,avatar);
      localStorage.setItem('codigo-secreto:nombre',clean);
      remember(next,uid);setCode(next);
    });
  }
  async function leave(){
    await run(async()=>{
      await stopPresence.current?.();stopPresence.current=null;
      if(phase==='lobby')await network.leaveRoom(code,uid,true);
      remember('',uid);setCode('');setRoom(null);setJoinCode('');
    });
  }
  async function copy(link){
    const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('juego','gartic');url.searchParams.set('sala',code);
    const value=link?url.toString():code;
    try{await navigator.clipboard.writeText(value);setCopied(link?'link':'code');setTimeout(()=>setCopied(''),2000);}catch{window.prompt('Copiá la invitación:',value);}
  }
  const banners=<>{!online && code && <div className="gp-notice" role="status">Reconectando… Tu tarea sigue guardada.</div>}{error && <div className="gp-error" role="alert">{error}</div>}</>;
  if(!code)return <div className="gp-root"><main className="gp-home">
    <button onClick={()=>{const u=new URL(location.href);u.searchParams.delete('juego');u.searchParams.delete('sala');history.replaceState(null,'',u);onBackToMenu();}}>← Volver a los juegos</button>
    <div className="gp-hero"><span>🎨</span><p className="gp-eyebrow">TELÉFONO DESCOMPUESTO VISUAL</p><h1>Trazo Loco</h1><p>Una idea, muchas manos.<br/>El desastre se descubre al final.</p></div>
    {banners}<section className="gp-card"><label>Tu nombre<input value={name} maxLength={24} autoComplete="nickname" placeholder="¿Cómo te llamás?" onChange={(e)=>setName(e.target.value)}/></label>
    <div className="gp-avatar-picker">{AVATARS.map((a)=><button aria-label={'Avatar '+a} aria-pressed={avatar===a} className={avatar===a?'selected':''} key={a} onClick={()=>setAvatar(a)}>{a}</button>)}</div>
    <button className="gp-primary gp-wide" disabled={busy || !uid} onClick={()=>enter(true)}>Crear sala</button>
    <form className="gp-row" onSubmit={(e)=>{e.preventDefault();enter(false);}}><input aria-label="Código de sala" placeholder="ABCD" maxLength={4} autoCapitalize="characters" value={joinCode} onChange={(e)=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g,''))}/><button disabled={busy || !uid}>Unirme</button></form>
    {!isFirebaseConfigured && <p>Configurá Firebase para jugar entre dispositivos.</p>}</section>
    <section className="gp-how"><h2>¿Cómo jugar?</h2><p>💬 Escribí una frase → 🎨 alguien la dibuja → 👀 otra persona la interpreta → 🔁 la cadena sigue → 🎉 revelamos todo.</p><small>De 3 a 20 jugadores. Cada uno desde su pantalla.</small></section>
  </main></div>;
  if(!room)return <div className="gp-root"><main className="gp-home">{banners}<p>Entrando a la sala…</p><button onClick={leave}>Cancelar</button></main></div>;
  const host=room.hostId===uid;
  const roster=<aside className="gp-card"><h2>Jugadores <small>{Object.keys(room.players).length}</small></h2>{Object.entries(room.players).map(([id,p])=><div className="gp-player" key={id}><span className="gp-avatar">{p.avatar}</span><div><strong>{p.name} {id===room.hostId?'👑':''} {id===uid?'(vos)':''}</strong><small>{connected[id]?(currentReady[id] && phase==='playing'?'✓ Listo':'Conectado'):'Reconectando…'}</small></div><i className={connected[id]?'online':''}/></div>)}</aside>;
  if(phase==='lobby')return <div className="gp-root gp-lobby"><LobbyLayout code={code} gameTitle="Trazo Loco · Sala de espera" subtitle={host?'Elegí un modo e invitá a tus amigos.':'El anfitrión elige el modo. Prepará tu imaginación.'} copied={copied==='link'} onCopyInvite={()=>copy(true)} onLeave={leave} banners={banners}>
    <div className="gp-lobby-grid">{roster}<section className="gp-card"><h2>Modos de juego</h2><div className="gp-modes">{MODES.map((mode)=><button key={mode.id} disabled={!host || !mode.available || busy} className={'gp-mode '+(room.mode===mode.id?'selected':'')} aria-pressed={room.mode===mode.id} onClick={()=>run(()=>network.configure(code,'mode',mode.id))}><span>{mode.icon}</span><strong>{mode.name}</strong><p>{mode.description}</p><small>{mode.kind}</small>{!mode.available && <small>🔒 No disponible aún</small>}</button>)}</div>
    <div className="gp-settings"><label>Máximo de jugadores<select disabled={!host || busy} value={room.settings.maxPlayers} onChange={(e)=>run(()=>network.configure(code,'settings',{...room.settings,maxPlayers:Number(e.target.value)}))}>{[3,4,6,8,10,12,16,20].filter((n)=>n>=Math.max(...Object.values(room.players).map((p)=>p.index))+1).map((n)=><option key={n}>{n}</option>)}</select></label><label>Tiempo inicial<select disabled={!host || busy} value={room.settings.seconds} onChange={(e)=>run(()=>network.configure(code,'settings',{...room.settings,seconds:Number(e.target.value)}))}>{[45,60,90,120].map((n)=><option key={n} value={n}>{n} segundos</option>)}</select></label></div>
    <div className="gp-row"><button onClick={()=>copy(false)}>{copied==='code'?'¡Código copiado!':'Copiar código'}</button><button onClick={()=>copy(true)}>Invitar</button>{host && <button className="gp-primary" disabled={busy || !online || Object.keys(connected).length<3} onClick={()=>run(()=>network.start(code,room,connected))}>Iniciar partida →</button>}</div><p>{host?'Necesitan al menos 3 jugadores conectados.':'Esperando que el anfitrión inicie la partida…'}</p></section></div>
  </LobbyLayout></div>;
  return <div className="gp-root"><main className="gp-play"><header className="gp-row"><h1>🎨 Trazo Loco</h1><span>Sala {code} · {MODES.find((m)=>m.id===state.mode)?.name}</span><button onClick={leave}>Salir</button></header>{banners}<div className="gp-game-grid">{roster}<div>{phase==='reveal'?<Reveal code={code} room={room} host={host} run={run}/>:state.positions?.[uid]===undefined?<section className="gp-card">La partida ya empezó. Esperá a la próxima.</section>:ownLoaded===taskKey?<Task key={taskKey} code={code} state={state} uid={uid} initial={own} previous={previous} ready={!!currentReady[uid]} readyCount={readyCount} now={now} onError={setError}/>:<section className="gp-card">Preparando tu tarea…</section>}</div></div></main></div>;
}
